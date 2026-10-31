#!/usr/bin/env python3
"""Portable agent checks and explicit, host-assisted Graphify publication. Python >=3.9."""
from __future__ import annotations
import argparse
import contextlib
import fnmatch
import hashlib
import json
import os
from pathlib import Path
import re
import shutil
import signal
import subprocess
import sys
import time
import uuid

ROOT = Path(__file__).resolve().parents[2]
STATE = ROOT / '.agent-state'
CONTRACT = 1
CODE_EXTENSIONS = {'.py', '.js', '.jsx', '.ts', '.tsx', '.mjs', '.cjs', '.go', '.rs', '.java', '.cs', '.rb', '.c', '.h', '.cpp', '.hpp', '.swift', '.kt', '.php', '.vue'}
DOC_EXTENSIONS = {'.md', '.txt', '.rst'}
BUILTIN_EXCLUDES = ['.git/**', '.agent-state/**', '.agent-runtime/**', 'graphify-out/**', 'node_modules/**', '.venv/**', 'venv/**', '__pycache__/**', '**/__pycache__/**', '**/node_modules/**', '**/.venv/**', '.env', '.env.*', '**/.env', '**/.env.*', '*.pem', '**/*.pem', '*.key', '**/*.key']

class KitError(Exception):
    pass

def read_json(path):
    try:
        return json.loads(path.read_text(encoding='utf-8'))
    except (ValueError, OSError) as exc:
        raise KitError('Cannot read JSON: %s (%s)' % (path, type(exc).__name__)) from exc

def write_json(path, data):
    path.parent.mkdir(parents=True, exist_ok=True)
    temporary = path.with_name(path.name + '.' + uuid.uuid4().hex + '.tmp')
    temporary.write_text(json.dumps(data, ensure_ascii=False, indent=2) + '\n', encoding='utf-8')
    os.replace(temporary, path)

def digest(data):
    return hashlib.sha256(data).hexdigest()

def encoded(data):
    return json.dumps(data, sort_keys=True, separators=(',', ':')).encode('utf-8')

def relative_path(value):
    if not isinstance(value, str) or not value or Path(value).is_absolute() or '..' in Path(value).parts:
        raise KitError('Expected a project-relative path: %r' % value)
    path = ROOT / value
    try:
        path.resolve().relative_to(ROOT)
    except ValueError as exc:
        raise KitError('Path leaves the project: %s' % value) from exc
    return path

def config():
    cfg = read_json(ROOT / '.agentkit.json')
    if cfg.get('schemaVersion') != 1 or cfg.get('profile') not in ('small', 'medium', 'large'):
        raise KitError('Unsupported configuration schema or profile')
    for field in ('checks', 'requiredDocs', 'inputExclude'):
        if not isinstance(cfg.get(field), list):
            raise KitError('Configuration field must be an array: ' + field)
    graph = cfg.get('graph', {})
    graph.setdefault('contextRoots', [])
    for field in ('codeRoots', 'documentRoots', 'contextRoots', 'exclude', 'cases'):
        if not isinstance(graph.get(field), list):
            raise KitError('graph.%s must be an array' % field)
    if not isinstance(graph.get('python'), str) or not graph['python']:
        raise KitError('Configure graph.python')
    if not re.fullmatch(r'\d+\.\d+\.\d+', str(graph.get('version', ''))):
        raise KitError('graph.version must be an exact version')
    if any(not isinstance(v, str) for v in cfg['inputExclude'] + graph['exclude']):
        raise KitError('Exclusions must be strings')
    return cfg

def excluded(rel, patterns):
    parts = Path(rel).parts
    # A prefix ending in /** excludes that directory itself as well as its contents.
    return any(fnmatch.fnmatchcase(rel, p) or (p.endswith('/**') and rel == p[:-3]) for p in patterns) or any(p in ('__pycache__', 'node_modules', '.git', '.venv') for p in parts)

def inventory(cfg, graph=False):
    patterns = BUILTIN_EXCLUDES + cfg['inputExclude'] + (cfg['graph']['exclude'] if graph else [])
    selected = {}
    if graph:
        roots = [(p, 'code') for p in cfg['graph']['codeRoots']] + [(p, 'document') for p in cfg['graph']['documentRoots']] + [(p, 'context') for p in cfg['graph']['contextRoots']]
    else:
        roots = [('.', 'input')]
    for value, kind in roots:
        base = relative_path(value)
        if base.is_symlink() or not base.exists():
            raise KitError('Input root is missing or a symlink: ' + value)
        paths = []
        if base.is_file():
            paths = [base]
        else:
            for directory, dirs, files in os.walk(base, followlinks=False):
                current = Path(directory)
                dirs[:] = sorted(d for d in dirs if not (current / d).is_symlink() and not excluded((current / d).relative_to(ROOT).as_posix(), patterns))
                paths.extend(current / f for f in sorted(files))
        for path in paths:
            rel = path.relative_to(ROOT).as_posix()
            if path.is_symlink() or excluded(rel, patterns):
                continue
            if graph and kind != 'context' and path.suffix.lower() not in (CODE_EXTENSIONS if kind == 'code' else DOC_EXTENSIONS):
                continue
            if rel in selected and selected[rel]['kind'] != kind:
                raise KitError('Overlapping code/document ownership: ' + rel)
            selected[rel] = {'kind': kind, 'sha256': digest(path.read_bytes())}
    return dict(sorted(selected.items()))

def fingerprint(cfg):
    return digest(encoded(inventory(cfg)))

def graph_fingerprint(cfg, sources):
    policy = {k: cfg['graph'][k] for k in ('version', 'codeRoots', 'documentRoots', 'contextRoots', 'exclude')}
    adapter = {p: digest((ROOT / 'tools/agentkit' / p).read_bytes()) for p in ('agent.py', 'graph_bridge.py')}
    return digest(encoded({'contract': CONTRACT, 'adapter': adapter, 'policy': policy, 'sources': sources}))

@contextlib.contextmanager
def writer_lock():
    STATE.mkdir(parents=True, exist_ok=True)
    path = STATE / 'writer.lock'
    try:
        fd = os.open(str(path), os.O_CREAT | os.O_EXCL | os.O_WRONLY, 0o600)
    except FileExistsError as exc:
        raise KitError('Another sync owns .agent-state/writer.lock. If it crashed, verify its PID is stopped before removing that lock.') from exc
    try:
        with os.fdopen(fd, 'w') as stream:
            stream.write(json.dumps({'pid': os.getpid(), 'started': time.time()}))
        yield
    finally:
        path.unlink(missing_ok=True)

def graph_python(cfg):
    value = cfg['graph']['python']
    return str(relative_path(value)) if '/' in value or '\\' in value else value

def kill_command_tree(process):
    if os.name == 'nt':
        try:
            subprocess.run(['taskkill', '/PID', str(process.pid), '/T', '/F'],
                           stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL, timeout=5)
        except (OSError, subprocess.TimeoutExpired):
            pass
        if process.poll() is None:
            process.kill()
    else:
        try:
            os.killpg(process.pid, signal.SIGKILL)
        except ProcessLookupError:
            pass

def execute(argv, timeout=120, cwd=ROOT):
    try:
        with subprocess.Popen(argv, cwd=str(cwd), stdout=subprocess.PIPE, stderr=subprocess.STDOUT,
                              shell=False, start_new_session=os.name != 'nt',
                              env=dict(os.environ, PYTHONDONTWRITEBYTECODE='1', GRAPHIFY_QUERY_LOG_DISABLE='1')) as process:
            try:
                output, _ = process.communicate(timeout=timeout)
            except subprocess.TimeoutExpired:
                kill_command_tree(process)
                output, _ = process.communicate()
                return 124, output.decode('utf-8', errors='replace') + '\nCommand exceeded its timeout.\n'
            except BaseException:
                kill_command_tree(process)
                process.wait()
                raise
            return process.returncode, output.decode('utf-8', errors='replace')
    except OSError as exc:
        return 127, 'Cannot start executable (%s): %s\n' % (type(exc).__name__, argv[0])

def validate_semantics(envelope, source, sha, text):
    if not isinstance(envelope, dict) or envelope.get('source_file') != source or envelope.get('source_sha256') != sha or envelope.get('contract_version') != CONTRACT:
        raise KitError('Semantic result ownership/hash mismatch: ' + source)
    nodes, edges = envelope.get('nodes'), envelope.get('edges')
    if not isinstance(nodes, list) or not isinstance(edges, list) or not nodes:
        raise KitError('Semantic result needs nonempty nodes and an edges array: ' + source)
    lines = text.splitlines()
    ids = set()
    namespace = 'doc_' + digest(source.encode())[:12] + '_'
    def location(item):
        line = item.get('line')
        if type(line) is not int or line < 1 or line > len(lines):
            raise KitError('Invalid evidence line: ' + source)
        evidence = item.get('evidence')
        if not isinstance(evidence, str) or not evidence.strip() or evidence not in lines[line - 1]:
            raise KitError('Evidence must be an exact nonempty excerpt of its source line: ' + source)
        return source + ':' + str(line)
    normalized_nodes = []
    for node in nodes:
        if not isinstance(node, dict) or not re.fullmatch(r'[a-z0-9_]+', str(node.get('id', ''))) or node['id'] in ids or not isinstance(node.get('label'), str) or not node['label'].strip():
            raise KitError('Invalid/duplicate semantic node: ' + source)
        ids.add(node['id'])
        normalized_nodes.append({'id': namespace + node['id'], 'label': node['label'], 'source_file': source, 'source_location': location(node), 'file_type': 'concept'})
    normalized_edges = []
    for edge in edges:
        if not isinstance(edge, dict) or edge.get('source') not in ids or edge.get('target') not in ids or not isinstance(edge.get('relation'), str) or not edge['relation'].strip():
            raise KitError('Invalid semantic edge endpoint/relation: ' + source)
        normalized_edges.append({'source': namespace + edge['source'], 'target': namespace + edge['target'], 'relation': edge['relation'], 'confidence': 'EXTRACTED', 'confidence_score': 1.0, 'source_file': source, 'source_location': location(edge)})
    return {'nodes': normalized_nodes, 'edges': normalized_edges}

def current_generation():
    pointer = STATE / 'current.json'
    if not pointer.exists():
        return None
    info = read_json(pointer)
    name = info.get('generation', '')
    if not re.fullmatch(r'[a-f0-9]{64}-[a-f0-9]{8}', name):
        raise KitError('Invalid generation pointer')
    return STATE / 'generations' / name

def graph_status(cfg):
    generation = current_generation()
    if generation is None:
        return {'status': 'missing', 'changed': [], 'deleted': [], 'action': 'Run graph sync; complete returned semantic jobs, then repeat sync.'}
    manifest = read_json(generation / 'manifest.json')
    graph = generation / 'graph.json'
    if not graph.exists() or digest(graph.read_bytes()) != manifest.get('graphSha256'):
        return {'status': 'invalid', 'action': 'Run graph sync to publish a valid generation.'}
    sources = inventory(cfg, graph=True)
    old = manifest['sources']
    changed = [p for p, item in sources.items() if old.get(p) != item]
    deleted = sorted(set(old) - set(sources))
    fresh = graph_fingerprint(cfg, sources) == manifest.get('fingerprint')
    return {'status': 'ready' if fresh else 'degraded', 'generation': generation.name, 'changed': changed, 'deleted': deleted, 'policyChanged': not fresh and not changed and not deleted}

def graph_sync(cfg):
    with writer_lock():
        sources = inventory(cfg, graph=True)
        if not sources:
            raise KitError('Graph corpus is empty. Configure explicit code/document roots.')
        key = graph_fingerprint(cfg, sources)
        if graph_status(cfg)['status'] == 'ready':
            print('Graph ready; synchronization is a no-op.')
            return 0
        work = STATE / 'pending' / key
        snapshot = work / 'snapshot'
        snapshot.mkdir(parents=True, exist_ok=True)
        for rel, item in sources.items():
            data = (ROOT / rel).read_bytes()
            if digest(data) != item['sha256']:
                raise KitError('Sources changed while snapshotting; repeat sync.')
            target = snapshot / rel
            target.parent.mkdir(parents=True, exist_ok=True)
            target.write_bytes(data)
        semantics = {'nodes': [], 'edges': []}
        pending = []
        for rel, item in sources.items():
            if item['kind'] != 'document':
                continue
            text = (snapshot / rel).read_text(encoding='utf-8')
            if not text.strip():
                continue
            job = digest(encoded([CONTRACT, rel, item['sha256']]))
            cache = STATE / 'semantic-cache' / (job + '.json')
            result = work / 'results' / (job + '.json')
            chosen = cache if cache.exists() else result
            if chosen.exists():
                envelope = read_json(chosen)
                normalized = validate_semantics(envelope, rel, item['sha256'], text)
                semantics['nodes'].extend(normalized['nodes'])
                semantics['edges'].extend(normalized['edges'])
                if chosen == result:
                    write_json(cache, envelope)
            else:
                result.parent.mkdir(parents=True, exist_ok=True)
                pending.append({'id': job, 'source_file': rel, 'source_sha256': item['sha256'], 'document': str(snapshot / rel), 'result': str(result), 'contract_version': CONTRACT})
        write_json(work / 'jobs.json', {'contract_version': CONTRACT, 'jobs': pending, 'schema': 'Read docs/agent/graphify.md and .agents/skills/project-graphify/SKILL.md. Every node/edge needs line and exact evidence.'})
        if pending:
            print(json.dumps({'status': 'semantic-required', 'jobs': str(work / 'jobs.json'), 'count': len(pending)}, indent=2))
            return 2
        write_json(work / 'semantic.json', semantics)
        request = {'snapshot': str(snapshot), 'code': [p for p, v in sources.items() if v['kind'] == 'code'], 'documents': [p for p, v in sources.items() if v['kind'] == 'document'], 'semantic': str(work / 'semantic.json'), 'output': str(work / 'graph.json'), 'version': cfg['graph']['version']}
        request_path = work / 'request.json'
        write_json(request_path, request)
        code, output = execute([graph_python(cfg), '-B', str(ROOT / 'tools/agentkit/graph_bridge.py'), str(request_path)], cfg['graph'].get('timeout', 300))
        print(output, end='')
        if code:
            raise KitError('Graphify build failed; previous generation remains available (exit %s).' % code)
        if inventory(cfg, graph=True) != sources:
            raise KitError('Sources changed during extraction; previous generation retained. Repeat sync.')
        graph = work / 'graph.json'
        if not graph.exists():
            raise KitError('Graphify did not produce graph.json')
        name = key + '-' + uuid.uuid4().hex[:8]
        destination = STATE / 'generations' / name
        destination.mkdir(parents=True)
        shutil.copyfile(graph, destination / 'graph.json')
        write_json(destination / 'manifest.json', {'fingerprint': key, 'sources': sources, 'graphSha256': digest(graph.read_bytes()), 'publishedAt': time.time(), 'graphifyVersion': cfg['graph']['version']})
        write_json(STATE / 'current.json', {'generation': name})
        print('Published directed graph: ' + name)
        return 0

def graph_cli(cfg, command, values, budget=1500):
    state = graph_status(cfg)
    if state['status'] not in ('ready', 'degraded'):
        raise KitError('Graph is not usable: ' + state['status'])
    if state['status'] == 'degraded':
        print('Graph is stale; verify changed/deleted source overlay: ' + json.dumps(state), file=sys.stderr)
    args = [graph_python(cfg), '-B', '-m', 'graphify', command] + values + ['--graph', str(current_generation() / 'graph.json')]
    if command == 'query':
        args += ['--budget', str(budget)]
    code, output = execute(args, cfg['graph'].get('timeout', 300))
    print(output, end='')
    return code

def graph_eval(cfg):
    state = graph_status(cfg)
    if state['status'] != 'ready':
        raise KitError('Golden navigation requires a fresh graph: ' + state['status'])
    cases = cfg['graph']['cases']
    if not cases:
        raise KitError('Configure graph.cases with real source/edge/query evidence.')
    data = read_json(current_generation() / 'graph.json')
    nodes = data['nodes']
    edges = data.get('links', data.get('edges', []))
    by_id = {n['id']: n for n in nodes}
    failed = False
    seen = set()
    for case in cases:
        name = case.get('id')
        if not isinstance(name, str) or not name or name in seen:
            raise KitError('Golden case IDs must be nonempty and unique')
        seen.add(name)
        operation = case.get('operation')
        if operation == 'source':
            value = case.get('value')
            passed = bool(value) and any(n.get('source_file') == value for n in nodes)
        elif operation == 'edge':
            for key in ('source', 'target', 'relation'):
                if not isinstance(case.get(key), str) or not case[key]:
                    raise KitError('Golden edge requires source/target node IDs and relation')
            passed = case['source'] in by_id and case['target'] in by_id and any(e.get('source') == case['source'] and e.get('target') == case['target'] and e.get('relation') == case['relation'] for e in edges)
        elif operation == 'query':
            if not case.get('query') or not case.get('expectedSources'):
                raise KitError('Golden query requires query and expectedSources')
            args = [graph_python(cfg), '-B', '-m', 'graphify', 'query', case['query'], '--graph', str(current_generation() / 'graph.json'), '--budget', str(case.get('budget', 1500))]
            code, output = execute(args, cfg['graph'].get('timeout', 300))
            passed = code == 0 and all(p in output for p in case['expectedSources']) and 'No matching nodes' not in output
        else:
            raise KitError('Unknown golden operation: %r' % operation)
        print(('%s ' % ('PASS' if passed else 'FAIL')) + name)
        failed |= not passed
    return int(failed)

def validate_checks(cfg):
    checks = cfg['checks']
    if not checks or not any(c.get('required', True) for c in checks):
        raise KitError('Configure at least one required stack check')
    known = set()
    for check in checks:
        name = check.get('id')
        if not isinstance(name, str) or not re.fullmatch(r'[a-z][a-z0-9_-]*', name) or name in known:
            raise KitError('Check IDs must be unique lowercase names')
        for dep in check.get('dependsOn', []):
            if dep not in known:
                raise KitError('Dependencies must precede their consumer: ' + str(dep))
        argv = check.get('argv')
        if argv is not None and (not isinstance(argv, list) or not argv or any(not isinstance(v, str) or not v for v in argv)):
            raise KitError('Check argv must be a nonempty string array or null')
        if type(check.get('timeout', 120)) is not int or check.get('timeout', 120) <= 0:
            raise KitError('Check timeout must be a positive integer')
        known.add(name)

def doctor(cfg):
    validate_checks(cfg)
    problems = []
    if cfg.get('configured') is not True:
        problems.append('Set configured=true only after completing ADAPTATION.ru.md')
    for rel in cfg['requiredDocs']:
        path = relative_path(rel)
        if not path.is_file():
            problems.append('Missing required document: ' + rel)
        elif 'TODO_ADAPT' in path.read_text(encoding='utf-8'):
            problems.append('Unfinished project facts: ' + rel)
    agents = ROOT / 'AGENTS.md'
    if not agents.is_file() or agents.stat().st_size > cfg.get('rootBudgetBytes', 8192):
        problems.append('AGENTS.md is missing or exceeds rootBudgetBytes')
    for check in cfg['checks']:
        if check.get('required', True) and check.get('argv') is None:
            problems.append('Required command not configured: ' + check['id'])
    # Local Markdown targets are checked without opening network URLs.
    paths = [ROOT / 'AGENTS.md', ROOT / 'GUIDES.md', ROOT / 'CONTEXT.md'] + list((ROOT / 'docs').rglob('*.md'))
    for path in paths:
        if not path.is_file():
            continue
        text = re.sub(r'```.*?```', '', path.read_text(encoding='utf-8'), flags=re.S)
        for target in re.findall(r'\[[^\]]*\]\(([^)\s]+)\)', text):
            target = target.split('#', 1)[0]
            if target and not re.match(r'^[a-zA-Z][a-zA-Z0-9+.-]*:', target) and not (path.parent / target).exists():
                problems.append('Broken local link in %s: %s' % (path.relative_to(ROOT), target))
    catalog = read_json(ROOT / 'docs/design/catalog.json')
    for entry in catalog.get('documents', []):
        if not relative_path(entry['path']).is_file():
            problems.append('Missing design document: ' + entry['path'])
        for source in entry.get('sources', []):
            if not relative_path(source).exists():
                problems.append('Missing design source: ' + source)
    for problem in problems:
        print('FAIL ' + problem)
    if not problems:
        print('PASS project configuration, required docs, local links and root budget')
    return int(bool(problems))

def docs_impact(cfg, base):
    catalog = read_json(ROOT / 'docs/design/catalog.json')
    if base:
        code, output = execute(['git', 'diff', '--name-only', '-z', base, '--'], 30)
        if code:
            raise KitError('git diff failed for supplied base')
        changed = set(output.split('\0')) - {''}
    else:
        changed = set(graph_status(cfg).get('changed', [])) | set(graph_status(cfg).get('deleted', []))
        if not changed:
            print('No graph delta available; use --base REF for a Git comparison. This is advisory.')
    for entry in catalog.get('documents', []):
        hits = sorted(p for p in changed if p in entry.get('sources', []) or any(p.startswith(prefix.rstrip('/') + '/') for prefix in entry.get('prefixes', [])))
        if hits:
            print(json.dumps({'document': entry['path'], 'sources': hits, 'review': entry.get('reviewWhen', [])}, ensure_ascii=False))
    return 0

def run_checks(cfg, quick):
    validate_checks(cfg)
    before = fingerprint(cfg)
    run_dir = STATE / 'runs' / (time.strftime('%Y%m%d-%H%M%S') + '-' + uuid.uuid4().hex[:8])
    run_dir.mkdir(parents=True)
    write_json(run_dir / 'report.json', {'schemaVersion': 1, 'mode': 'quick' if quick else 'full', 'status': 'RUNNING', 'inputsUnchanged': False, 'inputFingerprint': before, 'results': []})
    write_json(STATE / 'latest-run.json', {'report': str((run_dir / 'report.json').relative_to(ROOT))})
    results = []
    statuses = {}
    failed = False
    doc_code = doctor(cfg)
    results.append({'id': 'doctor', 'status': 'FAIL' if doc_code else 'PASS', 'required': True})
    failed |= bool(doc_code)
    selected = {c['id'] for c in cfg['checks'] if not quick or c.get('quick', False)}
    for check in reversed(cfg['checks']):
        if check['id'] in selected:
            selected.update(check.get('dependsOn', []))
    if quick and not selected:
        raise KitError('No quick checks configured')
    for check in cfg['checks']:
        if check['id'] not in selected:
            continue
        required = check.get('required', True)
        if any(statuses.get(dep) != 'PASS' for dep in check.get('dependsOn', [])):
            status, code, output = 'BLOCKED', None, 'A prerequisite did not pass.\n'
        elif check.get('argv') is None:
            status, code, output = 'UNCONFIGURED', None, 'Configure this stack command.\n'
        else:
            print('RUN ' + check['id'], flush=True)
            code, output = execute(check['argv'], check.get('timeout', 120))
            status = 'PASS' if code == 0 else 'FAIL'
        (run_dir / (check['id'] + '.log')).write_text(output, encoding='utf-8')
        statuses[check['id']] = status
        print('%s %s' % (status, check['id']), flush=True)
        results.append({'id': check['id'], 'status': status, 'required': required, 'exitCode': code})
        failed |= required and status != 'PASS'
    if not quick:
        strict = cfg.get('requireFreshGraph', False)
        status = graph_status(cfg)
        good = status['status'] == 'ready'
        print('%s graph-freshness (%s)' % ('PASS' if good else 'UNAVAILABLE', 'required' if strict else 'advisory'))
        results.append({'id': 'graph-freshness', 'status': 'PASS' if good else 'UNAVAILABLE', 'required': strict, 'details': status})
        failed |= strict and not good
        if good and cfg['graph']['cases']:
            result = graph_eval(cfg)
            results.append({'id': 'graph-eval', 'status': 'FAIL' if result else 'PASS', 'required': strict})
            failed |= strict and bool(result)
        elif strict:
            results.append({'id': 'graph-eval', 'status': 'BLOCKED', 'required': True})
            failed = True
    after = fingerprint(cfg)
    stable = before == after
    failed |= not stable
    report = {'schemaVersion': 1, 'profile': cfg['profile'], 'mode': 'quick' if quick else 'full', 'status': 'FAIL' if failed else 'PASS', 'inputFingerprint': before, 'inputsUnchanged': stable, 'results': results}
    write_json(run_dir / 'report.json', report)
    write_json(STATE / 'latest-run.json', {'report': str((run_dir / 'report.json').relative_to(ROOT))})
    print('Checks %s; report: %s' % (report['status'], (run_dir / 'report.json').relative_to(ROOT)))
    return int(failed)

def report_status(cfg):
    latest = read_json(STATE / 'latest-run.json')
    report = read_json(relative_path(latest['report']))
    fresh = report.get('inputsUnchanged') and report.get('inputFingerprint') == fingerprint(cfg)
    print(json.dumps({'status': report['status'] if fresh else 'STALE', 'mode': report['mode'], 'report': latest['report']}, indent=2))
    return 0 if fresh and report['status'] == 'PASS' else 1

def main():
    parser = argparse.ArgumentParser(description=__doc__)
    subs = parser.add_subparsers(dest='command', required=True)
    subs.add_parser('doctor')
    checks = subs.add_parser('check')
    checks.add_argument('--quick', action='store_true')
    subs.add_parser('report')
    impact = subs.add_parser('docs-impact')
    impact.add_argument('--base')
    graph = subs.add_parser('graph')
    gs = graph.add_subparsers(dest='operation', required=True)
    for operation in ('status', 'sync', 'eval'):
        gs.add_parser(operation)
    for operation in ('query', 'explain', 'path'):
        command = gs.add_parser(operation)
        command.add_argument('values', nargs=2 if operation == 'path' else 1)
        if operation == 'query':
            command.add_argument('--budget', type=int, default=1500)
    args = parser.parse_args()
    try:
        cfg = config()
        if args.command == 'doctor':
            return doctor(cfg)
        if args.command == 'check':
            return run_checks(cfg, args.quick)
        if args.command == 'report':
            return report_status(cfg)
        if args.command == 'docs-impact':
            return docs_impact(cfg, args.base)
        if args.operation == 'status':
            result = graph_status(cfg)
            print(json.dumps(result, indent=2))
            return 0 if result['status'] in ('ready', 'degraded') else 1
        if args.operation == 'sync':
            return graph_sync(cfg)
        if args.operation == 'eval':
            return graph_eval(cfg)
        return graph_cli(cfg, args.operation, args.values, getattr(args, 'budget', 1500))
    except (KitError, KeyError, TypeError, OSError, UnicodeError, ValueError) as exc:
        print('ERROR: ' + str(exc), file=sys.stderr)
        return 1

if __name__ == '__main__':
    sys.exit(main())
