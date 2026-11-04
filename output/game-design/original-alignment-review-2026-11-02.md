# Pomekhi alignment with Oderzhimye and content redesign plan

This proposal restores the structure of Oderzhimye while assigning the Great Master's administrative and dramatic work to the computer. The largest gaps are persistent possession, return and redealing rules, the Spirit Dwelling, and the Master's trials. Content variety should come from different physical and social interactions, rather than longer verbal sequences. Replace mandatory difficulty progression with a mixed deck filtered by the group's selected horror intensity and practical constraints.

Status: proposal for discussion and implementation planning. Existing product rules, source, saved catalog and game state are unchanged. Repository agent documentation is English; proposed player-facing card text is Russian.

## Evidence and limits

- Reference: the supplied 16-page Russian rulebook at `/Users/pokasich/Downloads/c3f4htgd1w0st3gh3utbc3yrkl36m803.pdf`. All pages were extracted; component diagrams and icon meanings on pages 5, 8, 10, 11, 13 and 16 were also rendered and inspected. Page numbers below refer to the printed rulebook.
- Publisher confirmation: [Oderzhimye product page](https://nizagams.ru/product/hantise/) and its [rules download page](https://nizagams.ru/rules/oderzhimye/).
- Implementation snapshot: `main`, commit `b66f871`. Primary sources: [cards](../../src/server/cards.ts), [prophecies](../../src/server/prophecies.ts), [dealing](../../src/server/dealing.ts), [game lifecycle](../../src/server/game.ts), [search ledger](../../src/server/search.ts), [ritual](../../src/server/ritual.ts), [protocol](../../src/shared/protocol.ts), [phone phase instructions](../../src/client/shared/ui/RoundStatus.tsx), and [card presentation](../../src/client/pages/player/ui/PersonalCardPanel.tsx).
- The local saved catalog contains the same 90 enabled cards as the source bank, without additions, removals or text changes. Only catalog data was compared; credentials and participant data are irrelevant to this review.
- The supplied PDF is a rulebook with sample cards, not the complete commercial decks. It establishes the rules, component counts, card structure and examples. It cannot establish equivalence with every one of the original 75 possessed missions, 42 exorcist missions, 11 Master trials, 11 prophecies or 6 story cards.
- This is a source-based design review and a set of tabletop walkthroughs. No physical playtest, fear rating or empirical win rate is claimed. New cards below are original prototypes, not reproduced commercial cards.

## What is already aligned

Keep the cooperative objective, seven-round default, private assignments, alternating preparation and exploration, release judged by the possessed player, capture through a card condition, captured players copying their captor, immediate return after release, loss of an exorcist mission credit after capture, candle advancement, two accumulating public prophecy rules and the final release card.

Keep the laptop display, phone identities, durable action receipts, private projections, paused restart recovery and explicit reconciliation. They are useful digital support for the game. Their interface should occupy little attention during exploration.

The original also allows humor and improvisation (page 3). Horror does not require every card to be grim, every action to be a puzzle, or every failure to have a punishment.

## Rule differences and recommended treatment

| Topic | Original rule and evidence | Current implementation | Proposed treatment |
| --- | --- | --- | --- |
| Continuing possession | Unreleased possessed and captives stay in their locations and cannot return until released (pages 9 and 14). | Every return phase tells everyone to return; the next deal clears search and creates new assignments for the roster. | Preserve unresolved groups, their locations and issued mission text between rounds. Release, rather than the round boundary, ends possession. |
| Who receives a new card | Preparation deals cards to the mediums present around the table; unresolved players remain elsewhere (pages 7, 9 and 14). Redealing only returners is the combined reading of those passages. | All room participants receive a new role and card. | Deal only to returned, participating mediums. Document the inferred edge cases explicitly rather than describing them as a fully specified digital procedure in the PDF. |
| Alternating roles | Deal exorcist first, then possessed, alternating in seating order; changing seats changes roles (page 7). | Random initial roles, later favoring participants with fewer completed possessed rounds. Configurable possessed count. | Use a virtual table order, exorcist first, for the returning subset. Fairness weighting and arbitrary possessed counts belong to a custom mode. |
| Reduced returning roster | Persistent groups can leave only a few mediums at the table. The ordinary alternating deal can give one returner an exorcist card. | Each deal needs at least four people, at least two exorcists and no more possessed than exorcists. | Separate initial party admission from later redealing. Allow one returning exorcist and a global possessed majority. Never redeal retained groups to repair a ratio. |
| Total capture and defeat | Lose when the ritual is called and no medium can return; already freed mediums can be at the table (pages 3, 9 and 10). | Full capture ends search, but the ritual can continue after a universal reset. | Evaluate whether any medium is free/returned after reconciliation. A disconnected phone is not a possessed player. No active exorcist alone does not prove defeat when freed players are already at base. |
| Solo exploration | Exorcists must move alone; coalitions are forbidden, brief conversation at encounters is allowed (pages 8, 9 and 14). | Pairs are allowed; solo search is only preferred. | Solo exploration is the faithful default. Pairs remain a clearly named comfort variant. Do not write missions requiring an accompanying team in the default deck. |
| Light as a role signal | Exorcists keep dim sources on, possessed/captives switch theirs off after taking position, freed players turn them on; cards can override rules (pages 2, 8 and 14). | Dark readable cards, visible phone timer and controls; no implemented role-based dark stage. | Add a near-black possession view with temporary access to actions. Explain that a browser cannot guarantee a physically extinguished screen/backlight. Maintain an accessible alternative. |
| Timing | Master decides the end; about four minutes is guidance, with no phone alarms (page 9). | Visible exact countdown; default search is three minutes, with 45-second placement and return. | Computer keeps a hidden authoritative exploration clock, initially about four minutes, and announces transitions. Exact public countdown is optional. Duration remains a setting, not a claim of literal original timing. |
| Spirit Dwelling | Remote or particularly unsettling location; box contains three random exorcist cards; some missions require depositing a card there (pages 2, 4 and 14). | Named zones, without a distinct Dwelling or deposit action. | Add a physical marked Dwelling plus digital deposit confirmation. Model the three initial cards as deck state; do not invent a draw/reward rule absent from the supplied rules. |
| Story | Six possible opening story cards; one fitting the environment is read before the first round (pages 6, 7 and 15). | A general old-TV/strange-recording theme, without a story-card entity or selection. | Add a selected prologue, place, entity and clear ending. A branching campaign or multiple plot twists would be an expansion, not a restored original rule. |
| Master trials | Eleven trial cards; choose seven, one per round. Hidden outcomes can depend on whether 0-1 or 2 prophecies are open (pages 6, 13 and 15). | No equivalent; software administrates rounds but earns no Master contribution. | Add a separate computer-trial deck with hidden outcomes and participant-confirmed physical facts. Convert feasible trials individually. Actor-dependent trials need acknowledged adaptation. |
| First game | Play a full party without Master trial effects; those cards only count rounds (page 12). | A separate optional practice round followed by ordinary progression. | Offer the original first-game preset with trial effects suppressed for all seven rounds. A short controls tutorial may remain an explicitly digital extra. |
| Candle setup | For N human mediums, A=N+1, B=2, C=3 (page 5). | Seven humans produce 7/2/3, with general target 3N+7 for seven rounds. | With N humans all playing mediums and the computer replacing Master: A=N+1 gives 3N+10 steps. Restore this together with the trial contribution; do not change the goal alone. |
| Rescue and mission credits | Freed original possessed score; an exorcist captured then freed still gives thumbs down even after completing a mission (pages 8-9). | One rescue per original group; no extra rescue for its captives, and no mission credit after capture. | Preserve this aligned rule. A mass release must not score every captive as another possessed mission. Define later-round credit explicitly for retained groups. |
| Group identity and location | Same-mission mediums in the same location are released together (page 8). Captives remain with their original captor. | Group identity is one original possessed assignment; any member can release the group, with no recorded physical location. | Use a persistent group ID, and retain its location. Do not group unrelated players merely because a reused card has the same ID. Decide the unusual identical-mission/same-location case before permitting duplicated issued missions. |
| Prophecy deck | Ten ordinary prophecies plus one final card; constraints accumulate at the ritual table (pages 3, 5 and 11). | Six original ordinary rules plus final card. | Restore the breadth of a ten-rule ordinary deck with compatible original wording, or import privately supplied original content. Audit combinations, not just each rule. |
| Candle penalties | Move a candle backwards according to the largest pile; A cannot move off the left edge (page 11). | Select the largest eligible B/C/out pile, with farthest tie break. | Mark the A-largest case and tie handling as interpretation choices. The supplied wording does not spell out the implementation's eligible-pile selection and tie break. Test the chosen convention explicitly. |
| Difficulty | Optional harder-card subset, alongside indoor/outdoor/contact subsets (page 6). | Every card has level 1-3; rounds impose rising levels. | Remove compulsory level progression. Keep complexity as an internal authoring/filtering tag; allow an optional harder subset. |
| Mission timing | Additional exorcist mission is attempted before checking (pages 8-9 and 14). | Many missions require first doing something at base after search. | Move mission completion into exploration. Base is for reporting/checking, not manufacturing a fresh success after the deadline. |
| Card replacement and custom length | No general reshuffle-to-optimize mechanic or endless party in the supplied rules. | Replacements, reshuffles, configurable lengths and endless/freeplay. | Keep comfort replacements before play. Restrict tactical rerolls in the faithful preset. Keep endless and variable length in custom play. |

Immediate early victory versus continuing empty rounds, tie handling, and cross-round captive credit deserve explicit digital conventions. Do not inflate these into confirmed contradictions where the rulebook does not specify a complete algorithm.

## Balancing the missing Master

For N mediums, the original candle travel is:

`3 * (N + 1) + 2 * 2 + 3 = 3N + 10`.

For seven human mediums plus a computer Master, that is A=8, B=2, C=3 and 31 steps. The current game requires 28. The original can receive a Master success each round, potentially seven additional steps; the present implementation has none. These two changes cannot be evaluated independently.

The theoretical per-round ceiling with N humans and a virtual Master is N+1. Actual opportunities shrink with retained groups, capture, unsuccessful personal missions and trials. A theoretical upper bound is not a predicted win rate.

Recommended faithful baseline:

1. Restore persistent possession, returner-only deals, the original candle setup and the computer trial contribution as one rule package.
2. Keep a strict preset and a first-game preset. In the first-game preset, omit trial effects as the original specifies. Do not silently award replacement automatic points.
3. Evaluate at N=5, 7 and 9 mediums before claiming support equivalent to the boxed game's advertised 6-12 people, which includes its human Master. The current 4-12-human range is a digital variant, not evidence of original balance.
4. Change one balancing variable at a time during tests. Do not secretly reduce candle targets in reaction to success or fear.

## Computer Master responsibilities

| Function | Computer behavior | Human fact input |
| --- | --- | --- |
| Preparation | Explain the setting, permitted locations, light convention, solo rule, emergency stop and selected content limits. | Choose zones, Dwelling, practical tags and desired intensity. |
| Dealing | Retain unresolved groups; deal to returners in table order; keep private cards private. | Returned participants acknowledge presence and readiness. |
| Exploration | Announce the start and ritual call; run a hidden clock; deliver only relevant scripted prompts. | Players carry out physical actions. |
| Trials | Select and persist a trial and its eligible branch at issue time; disclose only an assigned instruction. | Recipient reports the observable outcome; any required witness reports separately. |
| Adjudication | Explain the selected card's authored interpretation; present a neutral dispute path. | Possessed player judges release/capture. Base rule violations remain honest reports. |
| Checking | Reconcile delayed events, confirm who is free or still held, count eligible successes and apply the trial exactly once. | Free players confirm return; unresolved players confirm retained possession without exposing private text. |
| Ritual | Move candles, reveal rules in order, announce the result and retain immutable credits. | Group reports prophecy violations. |
| Atmosphere | Coordinate the selected story, music and rare events; reserve a distinct clear voice for mandatory instructions. | Participants choose acceptable intensity. |

No microphone, camera, GPS, continuous phone motion monitoring or runtime language-model subscription is required. The program cannot reliably infer whether a physical action happened, a player was frightened, or a real coalition formed. It must not claim otherwise.

The organizer remains a playing medium. Avoid turning them into an unpaid replacement Master through repeated laptop checks. Permit private phone reports and a returner readiness step; use the laptop for setup, review and exceptional correction. Do not auto-start on a missing captive's readiness, and do not auto-close disputed events on a timeout.

## Proposed round lifecycle

1. Initial setup creates a virtual table order, a selected story, the Dwelling, prophecy cards and seven computer trials. The first-game preset suppresses trial effects.
2. Deal alternating exorcist/possessed cards to the initial human mediums, starting with exorcist. Give time to read privately and request a comfort replacement.
3. Possessed players take allowed positions. Unreleased groups from later rounds stay in their existing positions and keep their task. They may briefly stop acting during checking and preparation, without becoming free.
4. Announce exploration. Freed groups return immediately and cease interacting. Captives copy their captor, stay with the group and lose mission eligibility. A private action report never substitutes for the physical release action.
5. Call the ritual. Free exorcists return. Unreleased groups remain. Pause, emergency stop and party termination still recall everyone when needed; these are separate from an ordinary ritual call.
6. Reconcile offline reports and establish the set of free/returned mediums. Do not equate a missing acknowledgement or disconnected phone with captivity or defeat.
7. If no medium is free/able to return, close the party as lost after resolving material uncertainty. Previously returned freed players count as available.
8. Score newly earned original-group releases, eligible exorcist missions and the computer trial. A release of a retained group scores once in its actual rescue round, never again in later rows. Former captive exorcists do not create additional rescue credits.
9. Move candles and reveal prophecies. End with a clear global recall on victory, defeat or stop.
10. If continuing, deal only to returned mediums; preserve unresolved groups. One returner receives an exorcist card. The initial admission minimum and the original global role ratio do not block this recovery path.

The PDF does not fully formalize partial redealing and later-round captive bookkeeping. The above makes its persistent-possession reading executable. These conventions should be documented and tested, not disguised as verbatim original text.

## Difficulty and horror intensity

Remove the visible mandatory difficulty ladder. It currently increases the length of spoken sequences more than it changes the play experience. Do not replace it with an equally rigid mandatory horror ladder.

Use three independent dimensions:

| Dimension | Purpose | Example values |
| --- | --- | --- |
| Horror intensity | Participants select a ceiling for emotional content. It is an author estimate to validate, not an objective fear measurement. | 1 unsettling and playful; 2 tense and uncanny; 3 sustained oppressive performance. |
| Interaction family | Deal mechanically different experiences. | Rhythm, gesture, observation, dialogue, controlled silence, consented prop interaction, spatial choice, short performance. |
| Practical and personal requirements | Exclude cards that cannot work for this group/place. | Indoors/outdoors, seated-compatible, hearing/vision needs, solo-compatible, optional contact, tagged prop, Dwelling, disliked themes. |

Complexity remains an internal property: number of rules, required memory, ambiguity and expected duration. Optional hard cards resemble the original's extra subset; they are not tied to round number. Intensity 3 can contain a very simple task. A complicated reverse-word task need not be frightening.

Set intensity once before play, allow lowering it privately, and never raise the ceiling automatically. A scenario can intensify delivery within the agreed ceiling. Loudness, screen flashes, isolation duration and startle effects are separate switches, not hidden consequences of the intensity number.

For a prototype standard deck, aim for at least six interaction families and no more than roughly one third pure verbal-response cards. These are authoring targets, not validated balance results. Avoid dealing several mechanically equivalent cards in the same round. Optional props can add variety without becoming prerequisites for the core deck.

## Content audit conclusions

All 60 possessed cards have spoken-answer release conditions. Some ask for a greeting, a known fact or a semantically suitable sentence; others ask for two or three ordered statements. Reordering words and adding a sentence does not create a new interaction family.

The bank has a recognizable radio/archive/return motif, but too many different titles lead to the same play: approach, receive an almost explicit answer, repeat it, report release. This lowers uncertainty without creating a richer decision. Most infection triggers are unlikely conversational suggestions or arbitrary errors, rather than tempting, legible alternatives.

Examples:

- `p19` gives away the one-word answer in its hint. It can teach the controls, but is weak as repeat atmospheric content.
- `p25`, `p39` and `p44` repeat calendar knowledge at different sequence lengths. Keep at most one factual variant outside tutorial material.
- `p26` and `p42` differ mainly in direct versus reversed repetition. They can share one family, not count as two distinct experiences.
- `p27` uses a proposed forbidden-zone visit as infection. Do not turn actual boundary or emergency communication into a scored trap.
- `p29` and `p50` punish offering to bring an object, while most cards prohibit object interaction. This teaches avoidance of interaction rather than dramatic curiosity.
- `e10` makes a response to another person's distress a scored mission. Remove it from scoring and retain its useful advice in the universal briefing.
- `e17`/`e23`, `e09`/`e20`/`e26`, and `e11`/`e19`/`e30` are route-memory, episode-recounting and headline families. Many should move into unscored after-game discussion.

Hints are private help for the possessed performer, not mandatory answers to recite immediately. Write a broad nudge and an optional stronger rescue hint; accept equivalent meaningful actions unless exact rhythm/order is the actual mechanic. Do not punish someone for an emergency stop, a request for consent, a rules question or a technical problem.

## Original prototype possessed cards

These are proposed Russian player-facing texts. They need physical testing before entering the default bank. Captures below are ordinary play errors, never failures to comply with safety communication. A clear emergency stop always overrides the fiction. Every example works without compulsory physical contact.

### The late knock

- **Название:** Последний стук.
- **Поведение:** Негромко отбивайте на собственной ладони два коротких удара и один протяжный. После каждого цикла прислушивайтесь к пустому месту рядом с собой.
- **Освобождение:** Экзорцист повторяет тот же рисунок на собственной ладони и дожидается окончания вашего следующего цикла, не перебивая его.
- **Плен:** Экзорцист пытается продолжать ритм одновременно с вами два цикла подряд вместо ответа в паузе.
- **Подсказка:** «Он слышит только того, кто умеет ждать».
- Authoring note: rhythm and turn-taking; intensity 1-2. Use a visual gesture alternative when auditory imitation is unsuitable. An approximate rhythm is enough; no stopwatch judgment.

### The crooked reflection

- **Название:** Отражение ошибается.
- **Поведение:** Поднимайте ладонь, затем медленно закрывайте ею один глаз. Смотрите на экзорциста так, словно ждёте отражения.
- **Освобождение:** Экзорцист молча повторяет оба жеста как отражение; достаточно понятного сходства.
- **Плен:** Экзорцист вместо попытки отражения дважды приказывает вам повторять его движения.
- **Подсказка:** «В стекле никто не командует первым».
- Authoring note: gesture; intensity 1-2; no mirror, touch or demanding balance. A seated performance is valid.

### The unanswered question

- **Название:** Вопрос без голоса.
- **Поведение:** Беззвучно шевелите губами. На обычные игровые вопросы отвечайте только кивком или покачиванием головы.
- **Освобождение:** Экзорцист выясняет, что вы хотите вернуться к остальным, задавая вопросы с ответом «да» или «нет», и разрешает вам вернуться своими словами.
- **Плен:** В рамках отыгрыша экзорцист требует от вас замолчать навсегда. Просьба прекратить игру или шум никогда не считается пленом.
- **Подсказка:** Укажите в сторону базы, затем на себя.
- Authoring note: dialogue through constraints; intensity 2; reject or adapt for participants for whom the gesture-only exchange is unsuitable.

### The unwanted guest

- **Название:** Чужое место.
- **Поведение:** Обращайтесь к пустому безопасному месту рядом с собой: «Ему здесь не рады». Не занимайте проход и не используйте мебель как барьер.
- **Освобождение:** Экзорцист обращается к невидимому гостю, вежливо прощается с ним и приглашает вас вернуться. Точная формулировка не нужна.
- **Плен:** Экзорцист в рамках сцены приглашает невидимого гостя пойти вместе с ним.
- **Подсказка:** «Попрощайся с тем, кого здесь не должно быть».
- Authoring note: roleplay and a meaningful choice; intensity 2. Distinguish invitation of the unseen guest from offering help to the actual player.

### The watching wall

- **Название:** Стена слушает.
- **Поведение:** Смотрите на разрешённую стену или неподвижный ориентир и шепчите: «При мне она не отвечает».
- **Освобождение:** Экзорцист остаётся рядом на обычной дистанции и вместе с вами спокойно молчит несколько секунд, после чего говорит, что ждать ответа больше не нужно.
- **Плен:** Экзорцист начинает настойчиво задавать вопросы самой стене после вашей фразы «Она отвечает только чужим».
- **Подсказка:** «Побудь здесь. Не зови её».
- Authoring note: controlled silence and presence; intensity 2-3. No requirement to approach the wall, close eyes or turn away from the walking route. Never require a visible fear response.

### The borrowed signature

- **Название:** Чужая подпись.
- **Поведение:** Держите заранее подготовленную карточку с вымышленным знаком и говорите: «Это имя не моё». Не передавайте личные документы или телефоны.
- **Освобождение:** Экзорцист предлагает вам выбрать собственный вымышленный знак и даёт перевернуть карточку чистой стороной вверх.
- **Плен:** Экзорцист берёт карточку себе и объявляет, что теперь это его знак.
- **Подсказка:** «Не забирай чужое. Помоги оставить его здесь».
- Authoring note: optional paper prop, agency and object choice; intensity 2. Enable only if the prop exists before play. Core no-prop deck excludes this card.

### The missing memory

- **Название:** Неверное воспоминание.
- **Поведение:** Рассказывайте один короткий эпизод: «Меня здесь никто не слышал. Никто не пришёл. Я всё ещё один». Повторяйте его, словно заевшую запись.
- **Освобождение:** Экзорцист своими словами сообщает, что сейчас он рядом и слышит вас, а затем предлагает вернуться к остальным. Эквивалентные слова принимаются.
- **Плен:** Экзорцист в рамках истории соглашается остаться здесь навсегда вместо возвращения.
- **Подсказка:** «Исправь то, что уже неправда».
- Authoring note: empathetic performance; intensity 1-2. A thematic filter excludes abandonment content for groups that dislike it.

### The second visitor

- **Название:** Второй посетитель.
- **Поведение:** Каждому новому экзорцисту показывайте два пальца и говорите: «Одного голоса мало». Не зовите людей сопровождать друг друга.
- **Освобождение:** Два разных экзорциста в разное время обращаются к вам с любым добрым пожеланием; после второго обращения вы свободны.
- **Плен:** Экзорцист в рамках отыгрыша настаивает, что никто другой к вам не придёт.
- **Подсказка:** «Пусть следующий скажет своё, а ты продолжай путь».
- Authoring note: sequential encounters, not a coalition. Exclude when fewer than two free exorcists can plausibly encounter the group. If the second exorcist becomes unavailable after issuance, authorize a replacement or one-person fallback without awarding a fictitious success. This is an expansion card, not a basic faithful-deck requirement.

## Exorcist mission redesign

An exorcist needs a secondary reason to take a risk, visit a place or maintain a peculiar behavior. The mission must be achievable before checking, brief enough not to immobilize the player, and compatible with solo movement. It may create a real choice between an optional objective and another rescue; forbidding every detour removes that choice. It must not reward ignoring an available rescue or delaying a released player.

Prototype mission candidates, all optional and worth at most one eligible mission success:

| Russian title | Proposed player-facing objective | Requirements and concern |
| --- | --- | --- |
| Свидетель Обители | «Во время поиска самостоятельно дойдите до Обители духов и оставьте там отметку своей миссии. Затем продолжайте помогать остальным». | Dwelling. Digital mark or prepared paper token, chosen before play. This is a digital replacement for a physical card deposit, not location verification. |
| Путь без ответа | «Посетите две разрешённые зоны поодиночке. В одной из них обратитесь к пустому месту с вопросом, на который не ждёте ответа». | At least two feasible zones. No narration at base required. |
| Тихий наблюдатель | «При одной обычной встрече сначала несколько секунд понаблюдайте за поведением одержимого, затем предложите помощь». | Do not delay an already understood release. Keep as a beginner mission, not a family of many near-identical cards. |
| Ответ тьме | «В разрешённой зоне скажите негромко: “Мы заберём их домой”. После этого начните помогать встреченному одержимому». | No compulsory startle or meeting a specific person. Exact wording can be thematic flavor. |
| Непривычный голос | «В разговорах во время поиска обращайтесь к встречным участникам на “вы”. Выполните хотя бы один такой разговор». | Suppress when a prophecy already imposes the same behavior; otherwise automatic duplicated success. |
| Чужое эхо | «Во время обычной встречи повторите один безвредный жест одержимого, затем попробуйте понять, как его освободить». | Deliberate thematic capture risk; do not combine with an issued card whose trap makes this impossible to approach fairly. |
| Оставленный знак | «На пути поиска оставьте приготовленный бумажный знак у Обители духов, не перекрывая проход и не перемещая чужие вещи». | Optional prop and Dwelling; mechanically similar to the first Dwelling mission, so retain only one in a small deck. |
| Чужая запись | «В одной разрешённой зоне негромко произнесите короткое вымышленное сообщение следующему посетителю: кого здесь ждут и почему». | Creative performance. No real recording or personal data required. |
| Запретное имя | «До сигнала возвращения не называйте игровые имена участников. Для зачёта поговорите хотя бы с одним медиумом». | Conflicts with name-dependent releases. Filter or supply an explicit priority rule before issuing. |
| Последний свидетель | «Если освободите одержимого, поблагодарите его за возвращение, не останавливая и не сопровождая его». | A gentle tutorial mission; do not stock the main deck with repeated gratitude variants. |

These candidates intentionally expose compatibility requirements. Do not enable every mission indiscriminately or treat cosmetic changes as new mechanics. A second visitor, a prop exchange or a mission that shares a trap trigger needs a deliberate composition check, not just sufficient card count.

## Computer trials and story

The first release should include a small set of trials the software can actually support. Each trial stores its selected targets, issued instructions, stage branch, evidence requirement and outcome so reconnection cannot reroll it. Freeze the 0-1 versus 2 prophecy branch when issuing the trial; reveal its result at checking. This is a stated digital convention where original timing is not fully algorithmic.

| Trial concept | Assigned instruction | Evidence | Relationship to original |
| --- | --- | --- | --- |
| A sign from the Dwelling | Privately ask one exorcist to leave a prepared sign at the Dwelling during exploration. | Recipient confirms deposit before the call. | A feasible conversion of a Master-requested errand; exact original card equivalence is unverified. |
| The last frequency | Give one exorcist a short message to address to an encountered possessed player; the performer confirms hearing it. | Two private reports; disagreements go to review. | Authored digital trial with an observable human report. |
| The unspoken command | Privately forbid a chosen exorcist from addressing the computer persona during exploration, then provide one clearly in-fiction temptation to reply. | Participant reports whether they replied. | Inspired by the rulebook's silence-trial structure; safety and technical communication are exempt. |
| Return of the sign | Ask one exorcist to bring a prepared marker to base and, through the computer announcement, return it before checking. | Recipient reports both legs; the programmed request authorizes this specific base visit. | A digital adaptation of the illustrated Master errand, with a small marker instead of moving the whole Dwelling. This is a modification and must be labeled. |
| A borrowed voice | Give an exorcist a short optional line to say in an allowed zone, then have the program answer from the laptop at a known cue. | Recipient reports having delivered the line; do not pretend the laptop heard it. | New digital atmosphere trial; no microphone inference. |

Do not automatically reward the program for playing a sound or delivering its own message. A trial needs a player-dependent condition. Conversely, do not choose an impossible target, such as a currently captive medium, and call that an ordinary failed trial.

Some original trials require a mobile human performer to follow or frighten a medium (pages 12-15). The laptop cannot reproduce this literally. Preserve the dramatic purpose with a disclosed adaptation, or omit that trial. Claiming exact one-to-one replacement without that qualification would be misleading.

Start with three original story packages: an abandoned radio station, a house whose guest never left, and a forest path that repeats. Each needs an environment tag, a short prologue, a coherent vocabulary for compatible cards, and distinct victory/defeat text. The rulebook establishes opening stories, not a branching narrative campaign.

Optional later story expansion: prologue, first prophecy revelation, second revelation and ending form a four-beat arc. Tie a reveal to confirmed ritual progress, never a random interruption during a critical physical exchange. A later line can reinterpret the same place or voice without adding a new task or exposing private release conditions. Do not launch this expansion until the faithful loop has been tested.

## Ritual and prophecy variety

The candle ritual already supplies a clear shared objective; restore its balance before adding several extra rituals. More mandatory base chores can slow the party and lengthen the time unresolved players wait elsewhere.

Build a ten-rule ordinary prophecy bank with distinct speech, response and gesture constraints. Audit all pairs. The current six rules are usable seeds, with these limits:

- `no-names`: retain; the control interface must still permit identity clarification without penalty.
- `formal`: retain; exclude an exorcist mission that would be automatically completed by the same requirement.
- `hand`: retain a seated/limited-mobility alternative; avoid tying every safety utterance to a gesture.
- `over`: retain as a short radio-themed phrase rule.
- `here`: retain if two concurrent phrase rules remain understandable; avoid three nested sentence templates.
- `returned`: retain, but define when one return counts and prevent repeated penalties for the same missed entrance line.
- `door`: retain as the final outcome text; style it to the selected story rather than inventing an additional victory task.

Four new families can cover a collective response to a keyword, an agreed brief pause before ordinary speech, a visible empty place reserved for the entity, and a short shared closing response after the computer's ritual call. Write exceptions and pair compatibility before enabling them. These are proposed families, not claims about the missing original cards.

An optional non-scoring epilogue ritual can give everyone a final short line or sign after victory. It should not add a surprise failure condition after the party already won. Extra multi-step ritual puzzles belong to a separately labeled expansion.

## Implementation sequence and acceptance

| Stage | Scope and owners | Completion evidence |
| --- | --- | --- |
| 0. Rule contract | Record original facts, necessary digital conventions, and optional expansions separately in the owning product requirements. Choose the pending partial-deal, penalty, trial-branch and captive-credit conventions. | Walk through the edge cases below with expected credits and candle positions. No code ambiguity hidden behind flavor text. |
| 1. Persistent game loop | `game.ts`, `dealing.ts`, `search.ts`, `round-sync.ts`, `protocol.ts`, player instructions and result views. Persist unresolved groups and role eligibility across rounds. | Two-round retained-group scenario, one-returner recovery, total-capture loss, late-event reconciliation and no duplicate rescue credit. |
| 2. Digital Master and ritual balance | Trial data and coordinator, story setup, `ritual.ts`, result ledger, saved state and privacy projections. Preserve current module ownership: game owns phases; ritual consumes sealed results. | Original setup for N=5/7/9; trial issue/confirm/restore idempotence; secret branch concealment; no first-game trial points. |
| 3. Catalog schema | Replace mandatory level progression with metadata for intensity, family and requirements; add nullable capture conditions, environment/prop filters and no-repeat family handling. Update editor and import validation. | Existing private catalog migrates without overwriting custom text. Old difficulty is retained as legacy complexity, not converted mechanically into fear. Imported cards remain distinguishable from tested core cards. |
| 4. Minimum viable content | Initially 24 possessed cards across six families, 12 exorcist missions across at least four families, a small feasible trial set, coherent prologues and compatible prophecies. | Every card receives a concrete trigger, accepted equivalents, hint, failure condition, duration estimate and eligibility review. Expand toward original deck breadth after testing, not before. |
| 5. Atmosphere and low-attention phones | Role-appropriate dim view, clear global announcements, sparse optional effects, story vocabulary and quiet mandatory instruction channel. | Real phone screen behavior, speech audibility in every allowed zone, lock/unlock and interruption tests. No emergency or phase cue disguised as fiction. |
| 6. Physical balance | Matched sessions with changed mechanics isolated from changed content where practical. | Session logs for all test conditions; revise only after distinguishing rule failure, card confusion, network loss and deliberate player choice. |

Persistent groups require a new saved-state contract. Do not infer an unresolved cross-round group from a legacy save whose rules explicitly reset possession. Keep an existing party on its original ruleset through completion, or offer an explicit new-party restart. Preserve the edited catalog separately. Reconnection, receipt ordering and pause behavior remain requirements, not optional polish.

Required design updates on implementation: dealing, rounds, search actions, offline reconciliation, ritual, persistence, atmosphere and catalog, plus the glossary and shared consumers. This report itself does not change those authoritative documents. Before implementation delivery, refresh the graph, complete semantic jobs, run graph evaluation, quick/full checks and report according to the project guide.

### Rule walkthroughs

1. Seven mediums start with four exorcists and three possessed players. Two original groups are freed; one holds an additional captive. Five people are available at base; the unresolved two-person group retains its card and zone. Only the five returners are redealt, starting with exorcist. Their aggregate roles need not satisfy the current original-deal ratio.
2. Later only one medium remains free. They receive an exorcist card and can attempt a rescue. Do not fail because the next deal has fewer than four people or fewer than two exorcists.
3. Every searching exorcist is captured, but a previously freed player is at base. End exploration if useful, then continue from that available player. Do not automatically call this total-party defeat.
4. No medium is free, while two phones are disconnected. Distinguish physical captivity from missing network evidence. Reconcile honest local reports before confirming defeat.
5. A group survives two ritual calls and is freed in the third round. Credit one original-group rescue in the third result, not one per elapsed round and not one per freed captive.
6. An exorcist completes their mission and is subsequently captured and freed. Their mission credit remains invalid for that assignment; release does not restore it.
7. A retry/restart happens between a trial report and result confirmation. The same trial, target and branch recover; one confirmation advances its contribution once.
8. A retained captive needs a technical interruption or withdraws. Resolve the participant's situation without converting network failure or an opt-out into a scored release.
9. A prophecy and personal task conflict. Use an authored priority rule consistent with the original card-over-base-rule hierarchy (page 12); safety and system operation always remain possible.
10. Victory/defeat occurs with unreleased people still elsewhere. The final announcement recalls everyone and closes the fiction, rather than leaving a player waiting for an impossible later rescue.

### Physical playtest plan

Use at least two groups unfamiliar with the cards. Begin with short matched rehearsals of the current and restored loop; then test new content on the restored loop. A practical first sample is six to eight full parties across small, seven-medium and larger groups. This is exploratory evidence, not enough to establish a precise population win rate.

Record time to first interaction and release; number and duration of unvisited groups; rounds spent captive; rescue and mission opportunities; capture trigger and whether it felt understandable; trial successes; candle progress by round; rule questions; skipped/replaced cards; physical phone interactions; checking duration; total session duration; individual self-reported intensity and willingness to replay.

Prototype targets to investigate, not established facts: most single encounters should resolve in roughly 20-90 seconds; ordinary ritual checking should generally stay within 60-90 seconds; no player should be abandoned for two full exploration phases without a clear table discussion about why. Persistent waiting is faithful to the original's pressure, but its enjoyment must be measured. Do not silently rescue waiting players to make the metrics look better.

Test a fully free first round, a cascade capture, a retained group, one returning rescuer, a missed trial cue, conflicting prophecies, a Dwelling errand, a late offline release and the final global recall. Separately test every allowed physical setup, actual iOS/Android low-light behavior, audibility, interruption/recovery and network path. Source review and desktop browser checks cannot substitute for these experiences.

## Review verification

Graph status was ready with no changed or deleted source overlay at investigation start. A graph query found the ritual/search/protocol route; final conclusions were checked against current sources. Every seed card was read, and the saved catalog was compared field by field with that bank. No implementation tests were run because this task changes no game implementation. Quick/full gate and physical acceptance remain unperformed for this proposal; no prior passing run is presented as current verification.

Final artifact checks found every card exactly once in the inventory (60 possessed and 30 exorcist), valid relative source links, and the expected candle arithmetic for five, seven and nine mediums. Graph status remained ready without source changes. The tracked Git diff remained empty; the proposal is a new output artifact alongside pre-existing untracked work.

## Card by card disposition

The inventory below covers all 90 current cards. Rework recommendations refer to prototypes, not approved replacements. Similar themes may be retained, but changing only a title, word count or number of remembered events does not count as new mechanical content.

| Card | Current family | Proposed disposition |
| --- | --- | --- |
| p01 Частота пустого дома | Spoken release, legacy level 1 | Keep the radio theme; broaden the accepted acknowledgement and replace an arbitrary flashlight suggestion with a legible in-fiction risk. |
| p02 Лишний пассажир | Spoken release, legacy level 1 | Rework as a performed arrival scene. Asking the obvious destination should not be the sole untelegraphed capture trap. |
| p03 Отсчёт наоборот | Spoken release, legacy level 1 | Keep one rhythm/counting teaching card. Reverse direction alone provides little replay variety. |
| p04 Неназванный гость | Spoken release, legacy level 1 | Keep as a roleplay seed. Replace name-asking capture with a meaningful choice involving the unseen guest. |
| p05 Пустое расписание | Spoken release, legacy level 1 | Move to tutorial or retire. Calendar recall is accessible but has little horror agency. |
| p06 Сторож без смены | Spoken release, legacy level 1 | Keep the guard persona; release through a short change-of-duty performance instead of one exact formula. |
| p07 Три пустых места | Spoken release, legacy level 1 | Retire or combine with another memory card. Four season names are a factual exercise. |
| p08 Незакрытая скобка | Spoken release, legacy level 1 | Move to tutorial or retire. Completing a proverb is a familiar quiz rather than a scene. |
| p09 Хранитель двух цветов | Spoken release, legacy level 1 | Retire the two-color enumeration. It duplicates the naming-and-release pattern. |
| p10 Забытое возвращение | Spoken release, legacy level 1 | Keep the return motif; make release an empathetic exchange with equivalent wording. |
| p11 Архив знакомых слов | Spoken release, legacy level 1 | Retire the household-item list as a distinct standard card. It duplicates other category-naming tasks. |
| p12 Письмо без адреса | Spoken release, legacy level 1 | Rework into an optional prepared-letter interaction; do not require the exact receipt sentence. |
| p13 Радио без приветствия | Spoken release, legacy level 1 | Keep only as a very short controls example. An ordinary greeting is often an accidental instant release. |
| p14 Забытый берег | Spoken release, legacy level 1 | Retire the left/right-bank factual answer. Retain the river motif for a spatial or gesture scene. |
| p15 Потерянное эхо | Spoken release, legacy level 1 | Keep one echo card; convert to timing or turn-taking instead of one repeated noun. |
| p16 Часы без полудня | Spoken release, legacy level 1 | Retire the time-of-day quiz or combine with the calendar tutorial. |
| p17 Добрый сторож | Spoken release, legacy level 1 | Keep as a low-intensity reassuring scene with semantic acceptance, not a memorized goodnight formula. |
| p18 Открытая дверь эфира | Spoken release, legacy level 1 | Rework into an imaginary-threshold scene. Avoid treating real door operation as a tempting core mechanic. |
| p19 Безымянная тишина | Spoken release, legacy level 1 | Move to tutorial. The hint literally supplies the entire one-word answer. |
| p20 Лампа памяти | Spoken release, legacy level 1 | Retire the light-source enumeration; retain the lamp theme for a controlled visual interaction. |
| p21 Два объявления | Spoken release, legacy level 2 | Combine with p02. Two announced phrases are not a new train mechanic. |
| p22 Архив двух полок | Spoken release, legacy level 2 | Combine archive themes; replace item naming plus closing sentence with a meaningful choice. |
| p23 Смена маяка | Spoken release, legacy level 2 | Combine with p06 or a lighthouse scene; a color followed by a formula is cosmetic variation. |
| p24 Письмо к утру | Spoken release, legacy level 2 | Combine with p12 and p45. Keep one letter family with an actual interaction. |
| p25 Разорванный календарь | Spoken release, legacy level 2 | Combine with p05. Adding the season to the weekday is increased memory load, not dramatic variety. |
| p26 Двойное эхо | Spoken release, legacy level 2 | Keep at most one ordered-echo puzzle. Clarify whether imperfect wording is a retry or capture. |
| p27 Комната двух ответов | Spoken release, legacy level 2 | Rework. Remove forbidden-zone suggestions from scored capture; actual boundary communication is exempt. |
| p28 Незавершённая передача | Spoken release, legacy level 2 | Combine with p01/p43. Name plus closing sentence repeats the same radio task. |
| p29 Хранитель пары | Spoken release, legacy level 2 | Rework into a consented prop or empathy choice. Punishing any suggestion to bring something discourages interaction. |
| p30 Билет туда и обратно | Spoken release, legacy level 2 | Combine with p02/p21. A longer travel formula is not a distinct experience. |
| p31 Словарь добрых слов | Spoken release, legacy level 2 | Keep one gentle interaction; accept sincere equivalent wishes and remove sequence policing. |
| p32 Два времени суток | Spoken release, legacy level 2 | Retire as a separate card. It repeats time-of-day factual recall. |
| p33 Приёмная тишины | Spoken release, legacy level 2 | Combine with p19 or a silence performance. Greeting then a keyword is still a verbal code. |
| p34 Невидимая библиотека | Spoken release, legacy level 2 | Keep the imaginary-library motif; use a short creative exchange rather than an exact second sentence. |
| p35 Прогноз пустого дома | Spoken release, legacy level 2 | Combine with p46. Weather naming and closing formula need another interaction dimension. |
| p36 Рамка без картины | Spoken release, legacy level 2 | Rework into a gesture or imaginary-picture performance. No touching actual pictures is needed. |
| p37 Дежурство у окна | Spoken release, legacy level 2 | Combine with p06. Window confirmation plus permission to rest duplicates duty-ending scenes. |
| p38 Сломанный указатель | Spoken release, legacy level 2 | Retire the sky/ground naming task; reuse its theme in a seated gesture card if useful. |
| p39 Запись без даты | Spoken release, legacy level 2 | Combine with p05/p25/p44. Weekday plus signature adds no new core mechanic. |
| p40 Два ключа эфира | Spoken release, legacy level 2 | Combine with p10/p31. Gratitude plus permission to return is another two-sentence release. |
| p41 Три станции | Spoken release, legacy level 3 | Rework the route into a short symbolic gesture or keep as the single ordered-route puzzle. |
| p42 Архив обратного эха | Spoken release, legacy level 3 | Keep at most one reverse-echo card; provide a non-memory alternative when filtering requires it. |
| p43 Три отметки смотрителя | Spoken release, legacy level 3 | Combine with p01/p06/p28. Three formulas should not define the highest intensity tier. |
| p44 Календарь возвращения | Spoken release, legacy level 3 | Combine with p05/p25/p39. Three adjacent weekdays are arithmetic memory, not increased horror. |
| p45 Письмо трёх слов | Spoken release, legacy level 3 | Combine with the single letter family; avoid requiring five verbal components. |
| p46 Последний прогноз | Spoken release, legacy level 3 | Combine with p35. A short weather sequence can become a sound or gesture performance. |
| p47 Книга трёх страниц | Spoken release, legacy level 3 | Combine library/return motifs; name plus two formulas is not a third difficulty family. |
| p48 Частота семи | Spoken release, legacy level 3 | Retire or tutorial-only. Continuing descending odd numbers is a classroom pattern. |
| p49 Три потерянных цвета | Spoken release, legacy level 3 | Retire the color reorder or keep one memory card in an optional harder subset. |
| p50 Опись мирных вещей | Spoken release, legacy level 3 | Retire as a separate card. Category enumeration duplicates p11 and punishes practical interaction. |
| p51 Рассвет по частям | Spoken release, legacy level 3 | Combine with p16/p32. Night/dawn/day naming is another predictable ordered answer. |
| p52 Трёхстрочный пропуск | Spoken release, legacy level 3 | Combine with p04/p10. Greeting, name and permission repeat the same social formula. |
| p53 Память времён года | Spoken release, legacy level 3 | Retire or optional memory subset. Five season names do not justify a dramatic late-game card. |
| p54 Маршрут письма | Spoken release, legacy level 3 | Combine with p12/p24/p45. Sender/recipient/receipt is one letter family. |
| p55 Сигнал через паузу | Spoken release, legacy level 3 | Keep only if choosing whether to omit a word creates a clear thematic decision; otherwise combine with echo cards. |
| p56 Три спокойных обещания | Spoken release, legacy level 3 | Keep the human reassurance seed; accept equivalent empathetic responses and remove rigid three-part order. |
| p57 Голоса старого приёмника | Spoken release, legacy level 3 | Combine with p42/p49. Reordering named elements is one optional memory mechanic. |
| p58 Дежурный по истории | Spoken release, legacy level 3 | Rework as a short improvised ending; exact beginning/middle/end labels are too mechanical. |
| p59 Объявление для дома | Spoken release, legacy level 3 | Combine with p28/p43. Address, news and signature repeat multi-part announcement tasks. |
| p60 Последняя строка эфира | Spoken release, legacy level 3 | Combine with p03/p01. Reverse counting plus closing formula is not a new release family. |
| e01 Свидетель сигнала | Optional mission, legacy level 1 | Move to unscored debrief prompts or make an observable exploration objective; recall is currently checked at base. |
| e02 Карта голосов | Optional mission, legacy level 1 | Rework into an actual short solo route objective, eligible only with sufficient zones; incidental memory is weak agency. |
| e03 Знак возвращения | Optional mission, legacy level 1 | Keep as one beginner mission, not a whole gratitude family. Do not delay or accompany the freed player. |
| e04 Точное наблюдение | Optional mission, legacy level 1 | Move to unscored debrief; observation can support a mission only with a distinct exploration action. |
| e05 Хроника помощи | Optional mission, legacy level 1 | Move to tutorial/debrief. Asking for a retrospective explanation duplicates the main rescue learning loop. |
| e06 Тихая поддержка | Optional mission, legacy level 1 | Keep as a gentle encounter objective only if another exorcist can be encountered naturally; no coalition or deliberate hunt. |
| e07 Один добрый вопрос | Optional mission, legacy level 1 | Keep one beginner conversation mission. Check compatibility with capture triggers and do not reward a redundant delay. |
| e08 Память пространства | Optional mission, legacy level 1 | Move to unscored location recall or replace with a short concrete permitted-zone objective. |
| e09 Надёжный рассказчик | Optional mission, legacy level 1 | Move to debrief. First-person retelling is not a distinct exploration challenge. |
| e10 Слово спокойствия | Optional mission, legacy level 1 | Remove from scoring. Preserve the advice in universal player guidance without making distress an opportunity for points. |
| e11 Собранная история | Optional mission, legacy level 1 | Move to debrief. A headline invented after search has no exploration success condition. |
| e12 Возвращение без потерь | Optional mission, legacy level 1 | Move thanks to an unscored ending or restrict to a gentle tutorial variant; avoid name-rule penalties for required acknowledgements. |
| e13 Две детали записи | Optional mission, legacy level 2 | Combine e01/e08 as a debrief prompt. Remembering two details is not a new mission family. |
| e14 Начало и помощь | Optional mission, legacy level 2 | Move to debrief. Behavior-plus-hint explanation largely repeats e05. |
| e15 Два спокойных эпизода | Optional mission, legacy level 2 | Rework or remove. It can be impossible when only one possessed encounter occurs; do not require a detour for two anecdotes. |
| e16 Слова и ответ | Optional mission, legacy level 2 | Move to debrief. Retelling a question and answer duplicates interaction already needed for rescue. |
| e17 Порядок пути | Optional mission, legacy level 2 | Combine with e02/e23 and turn into one eligible route objective; do not multiply route-memory cards. |
| e18 Две благодарности | Optional mission, legacy level 2 | Combine with e03. Two gratitude occasions add bookkeeping and checking time rather than a new decision. |
| e19 Название и смысл | Optional mission, legacy level 2 | Combine with e11/e30 as one unscored prompt. |
| e20 Тихая хроника | Optional mission, legacy level 2 | Combine with e09/e26 as one unscored episode-recounting prompt. |
| e21 До и после сигнала | Optional mission, legacy level 2 | Retire as a scored card. Recalling before/after a phase cue focuses attention on administration. |
| e22 Три кадра поиска | Optional mission, legacy level 3 | Move to debrief. Three ordered remembered details do not create an advanced exploration mission. |
| e23 Путь рассказчика | Optional mission, legacy level 3 | Combine with e02/e17. Counting up to three zones is the same route-memory family. |
| e24 Причина и разгадка | Optional mission, legacy level 3 | Move to optional debrief. Explaining changed beliefs is useful discussion, not a separate horror objective. |
| e25 Три мирных слова | Optional mission, legacy level 3 | Rework into a brief in-fiction creative message during exploration, or move to an ending prompt. |
| e26 Запись для утра | Optional mission, legacy level 3 | Combine with e09/e20. Three-part recap is repetitive and increases checking duration. |
| e27 Сравнение сигналов | Optional mission, legacy level 3 | Move to debrief. Fallback for one encounter improves feasibility but makes success difficult to distinguish from ordinary play. |
| e28 Обратная хроника | Optional mission, legacy level 3 | Move to debrief or retire. Reverse chronology adds memory load without exploration agency. |
| e29 Память о помощи | Optional mission, legacy level 3 | Move to debrief. Required names can conflict with revealed base rules; clarify exemptions if retained. |
| e30 Последний заголовок | Optional mission, legacy level 3 | Combine with e11/e19. Headline plus details is the same post-search storytelling family. |
