# Pomekhi agent guide

Pomekhi is a horror party game with a shared laptop display and private phone cards. This checkout implements the runtime, lobby, private-card reading and timed rounds; physical game actions and disk recovery are future work. [Product requirements](docs/product/README.md) distinguish the agreed target from implemented behavior.

## Sources and scope

The current user request owns intended changes. [CONTEXT.md](CONTEXT.md) owns terminology; [product requirements](docs/product/README.md) own game rules; [shared protocol](src/shared/protocol.ts) owns implemented wire shapes. Current source and tests establish implementation. [Architecture](docs/agent/architecture.md) defines placement and ownership.

Keep project code inside this directory. Keep agent instructions, documentation and code comments in English; game-facing copy is Russian. Preserve unrelated changes. Ask only about unresolved decisions that materially change behavior or scope; continue independent work while waiting. Git initialization, commits, pushes and publication require an explicit request.

## Navigate before changing

Read [GUIDES.md](GUIDES.md) for task-specific context. Before tracing dependencies, callers or impact, read the [local Graphify skill](.agents/skills/project-graphify/SKILL.md) and run `npm run agent:graph:status`. This project's adapter owns publication; do not replace it with a global Graphify workflow.

Use a ready graph first. With a degraded graph inspect the changed/deleted source overlay. After two unhelpful queries use `rg` and current source. Synchronize before exhaustive impact analysis and before the full gate; finish any semantic jobs returned by sync. The graph is a navigation index, not proof of behavior.

## Respect ownership

Read [architecture](docs/agent/architecture.md) before changing boundaries, [stack](docs/agent/stack.md) for runtime/build changes, and [consumers](docs/agent/ownership.md) for shared contracts. Search existing code before adding an abstraction. Keep one-consumer helpers beside their consumer.

The server owns authoritative game state, phase deadlines and role history. Clients present their authorized projection. Private assignments, the task database and organizer credentials stay out of public snapshots and client bundles. Keep timers, randomness and state transitions testable independently of transport and presentation.

Preserve connection, loading, failure, keyboard and focus states. Treat real-device behavior as a separate acceptance boundary. Add dependencies within the authorized task and update the lockfile; never add paid runtime services to satisfy a free-hosting requirement silently.

## Verify and deliver

Read [testing](docs/agent/testing.md) before changing tests and [quality gates](docs/agent/quality-gates.md) before delivery. Use a test boundary that retains the actual invariant. Run `npm run agent:quick` while iterating. For implementation delivery synchronize the graph, run `npm run agent:graph:eval`, then `npm run agent:check` and `npm run agent:report`.

Review the mapped [design documents](docs/design/README.md) for state, ownership, lifecycle, concurrency, persistence, recovery or build changes. Update the owning explanation when design changes; otherwise state why no design update is needed. Record product rule changes in their owning document and terminology changes in the glossary.

Report implemented behavior, actual checks, quick/full status, graph freshness and material unverified conditions. A foundation health response does not prove game readiness; an unperformed device or tunnel scenario remains unverified.
