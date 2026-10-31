#!/usr/bin/env python3
"""Pinned Graphify library bridge; invoked in a separate Graphify environment."""
import hashlib
import importlib.metadata
import json
from pathlib import Path
import sys
from import_boundaries import complete_import_boundaries

def main():
    request = json.loads(Path(sys.argv[1]).read_text(encoding='utf-8'))
    actual = importlib.metadata.version('graphifyy')
    if actual != request['version']:
        raise RuntimeError('Graphify version mismatch: expected %s, installed %s' % (request['version'], actual))
    from graphify.extract import extract, _get_extractor
    from graphify.build import build_from_json
    from graphify.export import to_json
    snapshot = Path(request['snapshot'])
    unsupported = [p for p in request['code'] if _get_extractor(snapshot / p) is None]
    if unsupported:
        raise RuntimeError('No Graphify AST extractor for: ' + ', '.join(unsupported))
    # Explicit paths, code-only structural API: no model or provider is invoked.
    data = extract([snapshot / p for p in request['code']], root=snapshot, cache_root=snapshot, parallel=False) if request['code'] else {'nodes': [], 'edges': []}
    if data.get('failed_sources'):
        failed = [Path(p).relative_to(snapshot).as_posix() for p in data['failed_sources']]
        raise RuntimeError('Incomplete AST extraction; refresh blocked for: ' + ', '.join(failed))
    semantics = json.loads(Path(request['semantic']).read_text(encoding='utf-8'))
    data['nodes'].extend(semantics['nodes'])
    data['edges'].extend(semantics['edges'])
    all_sources = request['code'] + request['documents']
    # Anchors make indexed file presence explicit; golden behavioral checks use symbols/edges.
    anchors = {}
    for source in all_sources:
        identifier = 'file_' + hashlib.sha256(source.encode()).hexdigest()[:20]
        anchors[source] = identifier
        data['nodes'].append({'id': identifier, 'label': source, 'file_type': 'code' if source in request['code'] else 'document', 'source_file': source, 'source_location': source + ':1'})
    complete_import_boundaries(data, snapshot, anchors)
    for node in list(data['nodes']):
        source = str(node.get('source_file', ''))
        try:
            if Path(source).is_absolute():
                source = Path(source).relative_to(snapshot).as_posix()
        except ValueError:
            raise RuntimeError('Extracted source leaves snapshot: ' + source)
        if source:
            node['source_file'] = source
        if source in anchors and node['id'] != anchors[source]:
            data['edges'].append({'source': anchors[source], 'target': node['id'], 'relation': 'contains', 'confidence': 'EXTRACTED', 'confidence_score': 1.0, 'source_file': source, 'source_location': node.get('source_location', source + ':1')})
    ids = [n['id'] for n in data['nodes']]
    if not ids or len(ids) != len(set(ids)):
        raise RuntimeError('Graph must have nonempty, unique node IDs')
    known = set(ids)
    if any(e.get('source') not in known or e.get('target') not in known for e in data['edges']):
        raise RuntimeError('Graph has an unknown edge endpoint')
    graph = build_from_json(data, directed=True, root=snapshot)
    if not graph.is_directed() or not graph.number_of_nodes():
        raise RuntimeError('Expected a nonempty directed graph')
    if not to_json(graph, {}, request['output'], force=True):
        raise RuntimeError('Graph export refused')
    exported = json.loads(Path(request['output']).read_text(encoding='utf-8'))
    if not exported.get('directed') or not exported.get('nodes'):
        raise RuntimeError('Exported graph schema is invalid')
    print('Graphify %s: %s nodes, %s directed edges' % (actual, graph.number_of_nodes(), graph.number_of_edges()))
    return 0

if __name__ == '__main__':
    try:
        sys.exit(main())
    except Exception as exc:
        print('Graphify bridge failed: %s' % exc, file=sys.stderr)
        sys.exit(1)
