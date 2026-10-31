# Verification and delivery

`.agentkit.json` owns commands, timeouts, prerequisites and required/advisory status. The selected profile provides initial required check IDs, not proof that the project implements them.

1. Run narrow checks for the change.
2. Run `npm run agent:doctor` and `npm run agent:quick` while iterating.
3. Review [consumers](ownership.md) and [mapped design documents](../design/README.md). docs-impact is advisory and needs a real Git base when one is used.
4. Run `npm run agent:graph:sync`; complete semantic-required jobs through the [local skill](../../.agents/skills/project-graphify/SKILL.md), then repeat sync. The runner does not call a model or install dependencies.
5. Run `npm run agent:graph:eval`, then `npm run agent:check` and `npm run agent:report`. Inspect exit codes, report mode and freshness.
6. Review unrelated changes using the source inventory or Git diff when a repository exists. Record relevant manual scenarios and all material limits.

The medium configuration requires environment checks, English documentation/link checks, adapted-agent-tool regressions, ESLint, TypeScript, unit tests, production build and real HTTP/Socket.IO integration. Quick mode omits build, integration and full graph acceptance. Full mode requires a ready graph and golden cases. Integration depends on a successful build; an empty suite is not an equivalent check.

Windows launch, iOS/Android browsers, Tuna/mobile networks, audio and future gameplay are separate acceptance scenarios. Mark them unverified until exercised. No CI workflow is installed: clean CI needs a deliberate semantic-graph bootstrap rather than a copied local .agent-state or a full-check command alone.

Every invocation writes its own logs/report under `.agent-state/runs`. Required failures, unconfigured required commands, blocked prerequisites and source changes during the run fail the gate. Independent commands continue. `report` compares the latest report to current input hashes; stale evidence cannot establish current success. A quick PASS is labeled quick and is not full acceptance.

Fingerprint inputs include project files except configured exclusions. Include lockfiles, build/test configuration and all owned packages; exclusions weaken freshness claims. The fingerprint does not identify external service state, environment variables, installed binaries or device behavior. Commands should verify pinned runtimes and any environment-specific prerequisites themselves.

The runner owns each configured command's process tree and forcefully terminates it on timeout before returning code 124. POSIX uses a separate session/process group; Windows uses taskkill /T /F with a direct-process fallback. Avoid watch modes and detached processes in gate commands. The agentkit timeout regression binds an ephemeral loopback port, so both quick and full checks need local socket permission.

Small projects may keep the graph advisory. Medium/large default to fresh graph + golden navigation as mandatory. The base runner does not prove coverage, test count, integration depth or architecture boundaries: the configured tools/scenarios must establish these.

Delivery includes changed behavior, checks/scenarios and results, quick/full mode, consumer scope, graph freshness, updated design/product documents (or a no-impact reason), glossary changes and environmental limits. A manual scenario remains unverified until it was actually run; setting a JSON field is not evidence.
