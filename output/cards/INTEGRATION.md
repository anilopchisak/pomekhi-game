# Card-set integration

The game ships the 136-card authored set as the default bank for new rooms. It projects playable text from the [main catalog](cards.json) and [short card copy](../../src/server/short-card-copy.ts) into the [server-only authored bank](../../src/server/authored-content.ts). The catalog carries private author rationale, references and editorial decisions separately. Phones get their own assignment, including setup and the full release and capture conditions. The authored missions have no helper field.

## Selection and recovery

First Game and Ordinary use the authored missions, six stories, ten ordinary prophecies, final door and two references. First Game also supports the separate editable bank. The editorial JSON is a full-set source format. The editable-bank importer accepts its own personal-card format.

The host can enable comedy missions and select each optional subset independently. The host confirms applicable venue features and consent before the first deal locks preparation. The spinner requires an already clear space and the angel requires an existing house mirror in its play location.

Checkpoints store the selected subsets, venue features and issued assignment text. Recovery replaces retired Dwelling missions in every saved assignment copy and retains action journals and scores. Existing groups, personal assignments and open prophecies use their saved data after restart. Recovery discards the retired horror setting and preserves issued historical assignments. The editable catalog remains independent.

## Verification

[Content parity tests](../../src/server/authored-content.test.ts) compare the playable runtime text with the editorial sources. The [game design](../../docs/design/first-game.md) documents the rules, private reports and recovery. The [current implementation](../../docs/product/current-implementation.md) describes the controls and mode differences. Physical play still determines discoverability, fear and balance, including mirror sightlines, available space and visibility of the dim screen.
