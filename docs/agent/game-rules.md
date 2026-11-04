# Game rules workflow for agents

Use this workflow for gameplay questions, player instructions, rule reviews and changes toward the original game. The accepted target is Oderzhimye with the computer replacing the Great Master. New rooms use Ordinary on an authored adaptation. Locked First Game checkpoints remain playable. Exact original card content remains outside the implementation. A document about the target does not establish current behavior.

## Select the ruleset

Use the current request and its conversation context to determine which ruleset the output describes. State that scope in the output before describing gameplay.

| Task | Required sources | Completion criterion |
| --- | --- | --- |
| Explain the current build or write instructions for playing it | [Current implementation](../product/current-implementation.md), relevant current source and tests | Every instruction corresponds to implemented behavior or is clearly identified as a physical convention. |
| Describe or implement the accepted target | [Target rules](../product/README.md), [glossary](../../CONTEXT.md), relevant current source | Intended rules and remaining implementation gaps are stated separately. |
| Revise the existing Russian player rulebook | [Player rulebook](../../output/player-rules/RULES-RU.md) and its [target](../product/README.md) | Its target status remains explicit, and changed wording preserves the rules. |
| Compare current play with the original | Both product documents, original rulebook and relevant current source | Each difference identifies observed behavior, intended behavior and supporting evidence. |

When the context selects the target, retain that selection. For instructions explicitly intended for the running build, use current behavior. If neither the request nor its context selects a ruleset and that choice changes the deliverable, ask one focused question while continuing source inspection.

The existing Russian player rulebook describes the target. To produce a guide for the current build, create a separately labeled guide unless the user asks to replace that file. A warning about missing features does not make target instructions usable as current-build instructions.

## Establish implementation evidence

Follow the [local graph workflow](graphify.md) before tracing behavior. Read the owning source after navigation. The table below is a source route, not a permanent assertion that the code will remain unchanged.

| Concern | Current implementation owner |
| --- | --- |
| Phase transitions, defaults, tutorial and progression | [game.ts](../../src/server/game.ts), especially planRound, deal and start |
| Role assignment, admission and replacement | [dealing.ts](../../src/server/dealing.ts), especially publicState and deal |
| Capture, group release, mission eligibility and results | [search.ts](../../src/server/search.ts) |
| Candles, penalties, revealed rules and terminal outcome | [ritual.ts](../../src/server/ritual.ts), [prophecies.ts](../../src/server/prophecies.ts) |
| Actual issued tasks and catalog settings | [cards.ts](../../src/server/cards.ts), [catalog.ts](../../src/server/catalog.ts) and the authorized local catalog when relevant |
| Phone instructions and actions | [RoundStatus.tsx](../../src/client/shared/ui/RoundStatus.tsx), [PlayControls.tsx](../../src/client/pages/player/ui/PlayControls.tsx) |
| Published command and view shapes | [protocol.ts](../../src/shared/protocol.ts) |
| Delayed reports and persisted recovery | [round-sync.ts](../../src/server/round-sync.ts), [session-format.ts](../../src/server/session-format.ts), [owning designs](../design/README.md) |

For each current-behavior claim, inspect the relevant path and an appropriate existing test when the claim depends on ordering or an edge case. Report a source-based conclusion as source-based; distinguish it from a scenario actually executed. When source and an implementation document disagree, report the source behavior and correct the document within the authorized task.

## Keep the known differences explicit

The executable follows the [first-game design](../design/first-game.md), including persistent possession, returner-only deals, solo exploration and the original candle formula. Older configurable behavior remains in compatibility fixtures. Ordinary-mode Master trials, exact original card content and unresolved source rulings remain outside the first-game variant.

Keep one success per original possessed assignment, no extra rescue credit for captives, and no exorcist mission credit after capture even if later released. Preserve private projections, honest physical reports, causal correction and durable recovery.

## Apply the requested type of change

For documentation-only work, update the requested explanations and their routing. Keep runtime source, tests, protocol, catalog and saved parties unchanged. Describe unimplemented target mechanics as requirements or gaps.

For an authorized implementation, identify the rule being implemented, its owner and affected consumers before editing. Carry a lifecycle change through results, phone instructions, offline reconciliation and saved-state handling as applicable. Update the owning design when that behavior changes. Product wording alone cannot migrate a save or provide a new command.

When adapting the Master, preserve the accepted trial properties and source limits in the [target rules](../product/README.md#computer-great-master). Use participant reports for physical facts. Document actor-dependent trial substitutions individually. Card text, penalty ties and other [unresolved original interpretations](../product/README.md#remaining-source-interpretation-work) remain open until supported by an original ruling or a user decision.

Horror tiers, new mission systems, branching story arcs and extra rituals from the earlier audit remain proposals. Include them only when the user adds them to the requested scope.

## Verify and deliver

For player-facing text, use simple Russian and a visible ruleset label. Include only controls available in that ruleset; identify any required physical convention. Use English for agent documentation. A current-build guide and a target guide may share terminology without sharing behavior.

For a documentation change, verify local links, compare each changed rule with its owning source and run the applicable [quality checks](quality-gates.md). State whether game code changed, which ruleset the document describes, quick/full status and graph freshness. Leave device and physical-play claims unverified unless those scenarios were actually exercised.

For an implemented rule change, use the project's test boundary that preserves the invariant and update implementation status only after the required checks. Completing one mechanism does not establish full original-game fidelity.
