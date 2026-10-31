# Project Graphify workflow

The supplied agent.py and graph_bridge.py own snapshots, host-assisted extraction and publication. The [local skill](../../.agents/skills/project-graphify/SKILL.md) defines navigation and evidence. A global Graphify workflow must not replace this contract.

## Isolated installation

The runner accepts Python 3.9+, but Graphify requires Python 3.10+. Python 3.12 is the verified local setup interpreter. POSIX:

```sh
python3.12 -m venv .agent-runtime
.agent-runtime/bin/python -m pip install -r tools/agentkit/requirements-graphify.txt
```

Windows PowerShell with Python 3.12:

```powershell
py -3.12 -m venv .agent-runtime
.agent-runtime/Scripts/python.exe -m pip install -r tools/agentkit/requirements-graphify.txt
```

The pin is graphifyy==0.9.55. Its transitive dependencies are not a hash-locked environment. The bridge validates the installed version and blocks failed AST extraction.

The project bridge additionally resolves dangling JS/TS import references using their actual import statements. Indexed TypeScript files satisfy compiled .js paths. Direct named re-exports are followed from AST-evidenced export statements to unique indexed definitions, retaining the intermediate export location. Module re-export edges use the same .js-to-TypeScript resolution. Wildcard or chained named bindings are not inferred. External packages and non-code assets become explicitly labeled reference boundaries, not invented internal symbols. Missing relative code, unknown call endpoints and unsupported evidence still fail publication. Run `npm run agent:test` for regression coverage of this adaptation.

Use the npm agent commands from [package.json](../../package.json). Their launcher selects .agent-runtime/bin/python on POSIX or .agent-runtime/Scripts/python.exe on Windows and exposes that directory on PATH. This lets graph.python use the portable executable name python without modifying the supplied adapter. Advanced direct Python commands require the activated environment and pinned Node.

## Corpus and publication

The configuration owns exact roots and exclusions. Source, launchers and selected build/test configuration are structural inputs. English project, agent, product and design documents and the local skill are document inputs. Resolver files belong in contextRoots. Dependencies, builds, environments, runtime data, credentials and local graph state are excluded.

```sh
npm run agent:graph:status
npm run agent:graph:sync
```

Exit code 2 with semantic-required is pending work. Read jobs.json and immutable snapshot documents; write evidence results to the given paths, then repeat sync. Extract meaningful concepts, owners, decisions and explicit relations. Copy job hashes and contract version exactly. Every evidence excerpt must occur on its stated line. The adapter namespaces document IDs and adds file anchors; it does not infer cross-document semantic relations automatically.

Only successful extraction, semantic validation and drift checks publish a new generation. Failure preserves the old generation. There is one writer. Ignored .agent-state stores local snapshots, results, logs and generations. Exclude it from commits and shared archives; a clean checkout rebuilds it.

## Navigation and evaluation

```sh
npm run agent:graph:query -- getServerConfig
npm run agent:graph:explain -- createAppServer
npm run agent:graph:path -- SOURCE_ID TARGET_ID
npm run agent:graph:eval
```

Use real labels or exact IDs. Path is directed; disambiguate endpoints. Inspect source and changed/deleted overlay. After two unhelpful queries use rg. Callback, JSX and dynamic transport relationships require source confirmation; a missing edge is not proof of no interaction.

Golden cases verify source routes and a known directed relation. They do not replace behavior tests or establish every reference. This adapter has one graph, no scope flag and no background watcher. The medium full gate requires graph readiness and successful cases.

## Recovery and limits

After interruption inspect the writer.lock PID and confirm it is no longer running before removing only that stale lock. Keep live writers and the current generation intact.

The runner does not read an AI API key or invoke a model. The current authorized agent completes semantic jobs in its normal environment. Report blocked freshness instead of claiming exhaustive navigation. Local graph readiness does not bootstrap clean CI automatically.
