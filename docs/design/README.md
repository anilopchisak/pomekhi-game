# Living design documents

The executable follows the [first-game design](first-game.md) and the [current implementation](../product/current-implementation.md). The [target rules](../product/README.md) also specify the future ordinary mode with active trials. Mechanism documents below retain details for foundations shared with compatibility tests; first-game lifecycle differences are owned by the first-game design.

Add documents only for mechanisms whose ownership, state, lifecycle, concurrency, failure or recovery needs explanation. `catalog.json` maps source changes to candidate documents; `docs-impact` is advisory and cannot decide semantic impact.

For each mechanism describe its purpose, owning modules/interfaces, source of truth, state transitions, important failure cases, consumers and verification. Link to actual code and canonical contracts. A diagram is useful when it clarifies relationships; no fixed chapter count is required.

Update explanations in the same change when the implemented design changes. For refactor/style/test-only work with no design effect report the reason. Structural checks validate paths, not truth. Avoid storing one-off investigation snapshots alongside current design.

Current mechanisms: [runtime lifecycle](runtime-foundation.md), [lobby membership, authorization and recovery](lobby-sessions.md), [private cards and reading](dealing.md), [timed rounds](rounds.md), [search actions and results](search-actions.md), [session persistence](session-persistence.md), [offline participation and reconciliation](offline-play.md) [shared ritual](ritual.md) and [atmosphere and broadcast](atmosphere.md) and [card catalog and deck cycles](card-catalog.md).
