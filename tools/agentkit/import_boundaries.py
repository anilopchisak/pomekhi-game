"""Resolve evidenced JS/TS import boundaries before strict graph validation."""
import hashlib
from pathlib import Path
import re


def relative_import(snapshot, source, specifier):
    """Resolve source extensions while preserving the snapshot ownership check."""
    unresolved = source.parent / specifier
    if unresolved.is_symlink():
        raise RuntimeError('Relative import target is a symlink')
    base = unresolved.resolve()
    try:
        base.relative_to(snapshot)
    except ValueError as exc:
        raise RuntimeError('Relative import leaves snapshot') from exc
    candidates = [base]
    if base.suffix in ('.js', '.jsx', '.mjs', '.cjs'):
        candidates.extend(base.with_suffix(ext) for ext in ('.ts', '.tsx', '.mts', '.cts'))
    elif not base.suffix:
        candidates.extend(base.with_suffix(ext) for ext in ('.ts', '.tsx', '.js', '.jsx'))
        candidates.extend(base / ('index' + ext) for ext in ('.ts', '.tsx', '.js', '.jsx'))
    target = next((path for path in candidates if path.is_file()), None)
    if target is None:
        raise RuntimeError('Relative import does not resolve: ' + specifier)
    if target.is_symlink():
        raise RuntimeError('Relative import target is a symlink')
    return target


def source_statement(edge, snapshot):
    source = (snapshot / edge.get('source_file', '')).resolve()
    source.relative_to(snapshot)
    match = re.search(r'(?:^L|:)(\d+)(?:$|:)', str(edge.get('source_location', '')))
    if not match:
        raise RuntimeError('Unresolved import lacks a source line')
    line = int(match.group(1))
    lines = source.read_text(encoding='utf-8').splitlines()
    if line < 1 or line > len(lines):
        raise RuntimeError('Unresolved import line is outside source')
    return source, line, '\n'.join(lines[line - 1:]).split(';', 1)[0]


def named_reexport(data, snapshot, module, imported_target, anchors):
    """Resolve a direct named re-export only from AST-evidenced export statements."""
    def owns(node, path):
        return bool(node.get('source_file')) and (snapshot / node['source_file']).resolve() == path

    modules = [node for node in data['nodes'] if owns(node, module) and node.get('label') == module.name]
    if len(modules) != 1:
        raise RuntimeError('Named re-export has no unique indexed module')
    matches = []
    for export in data['edges']:
        if export.get('context') != 're-export' or export.get('relation') != 'imports_from':
            continue
        if (snapshot / export.get('source_file', '')).resolve() != module:
            continue
        _, line, statement = source_statement(export, snapshot)
        binding = re.fullmatch(r'\s*export\s+(?:type\s+)?\{\s*([A-Za-z_][A-Za-z0-9_]*)(?:\s+as\s+([A-Za-z_][A-Za-z0-9_]*))?\s*\}\s+from\s+[\'"]([^\'"\n]+)[\'"]\s*', statement)
        if not binding:
            continue
        original, alias, specifier = binding.groups()
        if imported_target != modules[0]['id'] + '_' + (alias or original).lower():
            continue
        if not specifier.startswith('.'):
            raise RuntimeError('Named re-export must resolve inside the snapshot')
        target = relative_import(snapshot, module, specifier)
        if target.relative_to(snapshot).as_posix() not in anchors:
            raise RuntimeError('Named re-export is outside configured code roots')
        symbols = [node for node in data['nodes'] if owns(node, target) and node.get('label') in (original, original + '()')]
        if len(symbols) != 1:
            raise RuntimeError('Named re-export has no unique extracted definition')
        matches.append((symbols[0]['id'], module.relative_to(snapshot).as_posix() + ':' + str(line)))
    if len(matches) != 1:
        raise RuntimeError('Unresolved named re-export: ' + imported_target)
    return matches[0]


def complete_import_boundaries(data, snapshot, anchors):
    """Keep external imports explicit and reject all unsupported dangling edges."""
    snapshot = Path(snapshot).resolve()
    known = {node['id'] for node in data['nodes']}
    additions = {}
    for edge in data['edges']:
        if edge.get('source') not in known:
            raise RuntimeError('Graph has an unknown source endpoint')
        if edge.get('target') in known:
            continue
        if edge.get('relation') not in ('imports_from', 'imports', 're_exports'):
            raise RuntimeError('Graph has an unknown non-import endpoint: %s -> %s (%s)' % (edge.get('source'), edge.get('target'), edge.get('relation')))
        source, line, statement = source_statement(edge, snapshot)
        try:
            relative_source = source.relative_to(snapshot).as_posix()
        except ValueError as exc:
            raise RuntimeError('Import source leaves snapshot') from exc
        if source.suffix not in ('.js', '.jsx', '.ts', '.tsx', '.mjs', '.cjs'):
            raise RuntimeError('Unsupported unresolved import language')
        if not re.match(r'^\s*import\s', statement) and not ((edge.get('context') == 're-export' or edge.get('relation') == 're_exports') and re.match(r'^\s*export\s', statement)):
            raise RuntimeError('Unresolved import evidence is not a static import')
        specifier_match = re.search(r'\bfrom\s*[\'"]([^\'"\n]+)[\'"]|^\s*import\s*[\'"]([^\'"\n]+)[\'"]', statement)
        if not specifier_match:
            raise RuntimeError('Unresolved import specifier has no source evidence')
        specifier = specifier_match.group(1) or specifier_match.group(2)
        reference_kind = 'external'
        if specifier.startswith('.'):
            target = relative_import(snapshot, source, specifier)
            relative_target = target.relative_to(snapshot).as_posix()
            if edge['relation'] == 'imports':
                edge['target'], edge['reexport_location'] = named_reexport(data, snapshot, target, edge['target'], anchors)
                continue
            if relative_target in anchors:
                edge['target'] = anchors[relative_target]
                continue
            if target.suffix in ('.js', '.jsx', '.ts', '.tsx', '.mjs', '.cjs', '.mts', '.cts'):
                raise RuntimeError('Relative code import is outside configured code roots: ' + relative_target)
            reference_kind = 'asset'
        elif edge['relation'] == 'imports':
            raise RuntimeError('Unresolved named import is not an indexed re-export')
        identity = (relative_source + ':' + specifier) if reference_kind == 'asset' else specifier
        identifier = 'import_boundary_' + hashlib.sha256(identity.encode()).hexdigest()[:20]
        if identifier not in additions:
            additions[identifier] = {
                'id': identifier,
                'label': specifier,
                'file_type': 'reference',
                'reference_kind': reference_kind,
                'source_file': relative_source,
                'source_location': '%s:%s' % (relative_source, line),
            }
        edge['target'] = identifier
    data['nodes'].extend(additions.values())
