# Card catalog and room deck cycles

> The executable uses the [first-game design](first-game.md). Below, older round, dealing, scoring and schema behavior applies to compatibility fixtures; shared foundation behavior still applies.

Status: implemented. Catalog editing is organizer-only; issued cards and scored outcomes are immutable copies.

## Owners and lifetime

createCatalog owns the laptop-wide private catalog, revision and the latest 256 successful request fingerprints. createLobby composes it outside the active room and passes enabled cards through game to dealing. Room closure retains the catalog; a new game starts with empty usage. Domain modules perform no file operations. Session serializes editor commands with gameplay and persists the complete schema-5 checkpoint before returning success. A failed write restores the committed catalog and usage with the existing paused recovery behavior.

Standard content remains server-only in cards.ts. Shared catalog code validates structure and text bounds without embedding tasks. A CatalogFile contains format pomekhi.cards, version 1 and enabled/card entries. Limits are 500 entries, 512 KiB canonical UTF-8 JSON, title 120 code points and each required body field 2000 code points. IDs are unique stable ASCII identifiers of at most 80 characters. Possessed cards require behavior, release and infection conditions and may have a clue; exorcists require a mission. The editor treats the harder flag and the imported harder set tag as the same restriction; changing its checkbox clears the tag and records the selected value. Disabled cards remain exportable. Unknown fields are discarded.

## Room usage and selection

Dealing owns usage sets for each role and actual difficulty. Every issuance consumes an ID, including tutorial, replacements, canceled previews and aborted rounds. Cancel/remove never returns usage. Role fairness remains separate and counts only completed ordinary rounds.

Select the highest admissible difficulty first. Randomly draw from admissible unseen cards; when none remain, reset that pool cycle while retaining IDs already assigned in the current operation. Fall back to simpler levels only when no unique admissible card remains at the requested level. Exclude other current assignments and the recipient's previous card. A provisional swap within an uncommitted full deal prevents a greedy earlier choice from unnecessarily forcing a simpler card. Prepare assignments and usage together, then commit both only on success.

Before a full deal each role needs enough enabled cards at/below the requested difficulty for its roster plus one spare. Late admission filters legal roles by the same spare requirement; impossible admission creates no membership or assignment. Replacements and late admissions retain everyone else's IDs/cards/readiness. Text edits keep the ID and its pool usage. Moving a card between role/level pools uses that pool's retained history. No old scored-round history is inferred when it has no card identities.

## Editor and protocol

HostPage editor mode at /?screen=editor uses existing organizer authorization. No router or new role is introduced. Bank read is explicit, names/text stay concealed until opening a card, and normal host/display/player projections contain no catalog. The editor holds bank data in React memory only. Read is always available to an authorized organizer with healthy storage. Writes are allowed without a room and in lobby, breaks and finished state; reading/timed phases are read-only, including pause.

catalog:command has typed read/save/import/reset inputs and a separate CatalogReply. Runtime actor validation precedes access. Mutations carry catalog revision and requestId; canonical fingerprints recognize successful retries, while a reused ID with changed content fails. Revision conflicts preserve the draft and require rereading. The catalog journal is bounded to 256; evicted requests still fail their old revision rather than applying twice. Editor commands are never automatically replayed.

Import validates and replaces the entire bank after a preview of added/changed/removed IDs and confirmation. Export includes no players, credentials, assignments, usage or results. Standard reset replaces custom edits after confirmation and retains room usage. Socket.IO accepts up to 1 MiB for import; every other incoming command retains a separate 16 KiB guard, including individual save requests. Over-limit content and payloads that cannot be serialized receive INVALID_INPUT before command dispatch, including anonymous requests. No task contents are logged or published in normal snapshots.

## Disk migration and failure

Version 5 stores catalog outside room and usage inside dealing in the existing atomic file. Versions 1-4 migrate through their existing steps, seed the standard catalog and mark known issued dealing/search cards as used. Existing assignments, results, credentials and successful gameplay requests are preserved. Unknown earlier usage stays unknown. All issued content restores verbatim, not by looking it up in the edited bank.

Closing a room persists room:null with the catalog intact. Confirmed full recovery reset preserves the original file and restores standard content; its warning explicitly includes custom-bank loss. Normal write failure or malformed import never silently resets the bank.

## Verification

Rule tests cover cycles, tutorial/preview consumption, fallback/spares, atomic failures, revision/idempotency, migration and write errors. Real Socket.IO tests cover seven identities, private replies, bulk import and rejection of impossible late admission. React tests cover concealed titles and draft preservation after a stale edit. Browser acceptance must include actual JSON download/upload, room closure, restart with stable assignments/usage, desktop/320px and both supported browser engines over LAN/Tuna. Physical Windows/iOS/Android and live content suitability remain external acceptance boundaries.
