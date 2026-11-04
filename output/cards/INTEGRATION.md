# Card-set integration

The game ships the 147-card authored set as the default bank for new rooms. It projects playable text from the [main catalog](cards.json) and the [horror variants](horror/cards.json) into [server-only mission content](../../src/server/authored-content.ts) and [opening stories](../../src/server/first-game-content.ts). The catalog carries private author rationale, references and editorial decisions separately. Phones get their own assignment, including setup and the full release and capture conditions. The authored missions have no helper field.

## Selection and recovery

First Game and Ordinary use the authored missions, six stories, ten ordinary prophecies, final door and two references. Ordinary uses the authored trial instructions with the existing private reports and branch evaluation. First Game also supports the separate editable bank. The editorial JSON is a full-set source format. The editable-bank importer accepts its own personal-card format.

The host may enable the horror option and select each optional subset independently. The server uses an eligible variant in place of its base mission. An eligible base mission stays in the draw if its variant does not qualify. Both editions use the same slot ID for the usage cycle. The host confirms applicable venue features and consent before the first deal locks preparation. The spinner requires an already clear space and the angel requires an existing house mirror in its play location.

Checkpoints store the selected option and issued assignment text. Existing groups, personal assignments, open prophecies and pending trial reports use their saved data after restart. The horror field is optional for earlier checkpoints. The editable catalog remains independent.

## Verification

[Content parity tests](../../src/server/authored-content.test.ts) compare the playable runtime text with the editorial sources. The [game design](../../docs/design/first-game.md) documents the rules, private reports and recovery. The [current implementation](../../docs/product/current-implementation.md) describes the controls and mode differences. Physical play still determines discoverability, fear and balance, including mirror sightlines, available space and visibility of the dim screen.
