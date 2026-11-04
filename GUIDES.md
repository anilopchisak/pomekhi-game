# Context router

Read the documents whose trigger applies. Keep implemented behavior separate from future requirements.

| Trigger | Read |
| --- | --- |
| Runtime, installation, dependency, build, launcher or Tuna tunnel | [Stack](docs/agent/stack.md), [project README](README.md) |
| Module placement, transport, public interface or state owner | [Architecture](docs/agent/architecture.md) |
| Gameplay question, player instructions or rule change | [Game rules workflow](docs/agent/game-rules.md) |
| Current-build phase, role, difficulty or scoring | [Current implementation](docs/product/current-implementation.md), then the owning source identified by the workflow |
| Target game rule or original-game adaptation | [Target rules](docs/product/README.md), [glossary](CONTEXT.md) |
| Shared protocol or behavior across laptop and phones | [Consumers](docs/agent/ownership.md) |
| Regression, mocks, randomness, timers or test infrastructure | [Testing](docs/agent/testing.md) |
| Caller, dependency, execution path or change impact | [Local skill](.agents/skills/project-graphify/SKILL.md), [Graphify workflow](docs/agent/graphify.md) |
| State, persistence, synchronization, lifecycle or failure semantics | [Design index](docs/design/README.md) |
| Verification or delivery | [Quality gates](docs/agent/quality-gates.md) |
| Agent setup provenance and chosen profile | [Adaptation record](docs/agent/adaptation.md) |
