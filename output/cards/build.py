# coding: utf-8
"""Validate the authored editorial inputs and rebuild the offline review catalog."""
import argparse
import csv
import hashlib
import itertools
import json
import re
from collections import Counter
from html import escape
from pathlib import Path

HERE = Path(__file__).resolve().parent
PACK = json.loads((HERE / 'cards.json').read_text())
AUDIT = json.loads((HERE / 'source-audit.json').read_text())
FICTION = json.loads((HERE / 'fiction-sources.json').read_text())
FICTION_BY_ID = {source['id']: source for source in FICTION['sources']}
REVISION = json.loads((HERE / 'revision-audit.json').read_text())
CARDS = PACK['cards']
BY_ID = {card['id']: card for card in CARDS}
TYPE_LABELS = {
    'possessed': 'Одержимые', 'exorcist': 'Экзорцисты',
    'prophecy': 'Прорицания', 'story': 'Истории', 'reference': 'Памятки',
}
SET_LABELS = {
    'indoor': 'Помещение', 'outdoor': 'Улица', 'contact': 'Физический контакт',
    'harder': 'Повышенная сложность',
}
FAMILY_LABELS = {
    'voice': 'Речь', 'objects': 'Предметы', 'contact': 'Прикосновение',
    'movement': 'Движение', 'space': 'Пространство', 'sound': 'Звук',
    'acting': 'Актёрская игра', 'observation': 'Наблюдение', 'rhythm': 'Ритм',
    'gesture': 'Жест', 'pantomime': 'Пантомима', 'posture': 'Поза',
    'light': 'Свет', 'memory': 'Память',
    'release': 'Освобождение', 'social': 'Взаимодействие',
    'ritual': 'Ритуал', 'story': 'Сюжет', 'reference': 'Правила',
}
EXPECTED = {'possessed': 75, 'exorcist': 42, 'prophecy': 11, 'story': 6, 'reference': 2}


def save(name, value):
    (HERE / name).write_text(json.dumps(value, ensure_ascii=False, indent=2) + '\n')


def strings(value):
    if isinstance(value, str):
        yield value
    elif isinstance(value, list):
        for item in value:
            yield from strings(item)
    elif isinstance(value, dict):
        for item in value.values():
            yield from strings(item)


def validate():
    assert PACK['format'] == 'pomekhi.editorial-card-set'
    assert PACK['version'] == 1
    assert dict(Counter(c['type'] for c in CARDS)) == EXPECTED
    assert len(CARDS) == len(BY_ID) == 136
    assert len({c['title'].casefold() for c in CARDS}) == 136
    source_ids = {row['sourceId'] for row in AUDIT['entries']}
    assert len(source_ids) == len(AUDIT['entries']) == sum(AUDIT['coverage'].values())
    assert Counter(row['sourceId'].split(':')[0] for row in AUDIT['entries']) == {
        'pdf': AUDIT['coverage']['fanPdf'],
        'runtime': AUDIT['coverage']['currentPersonalCards'] + AUDIT['coverage']['currentPropheciesIncludingFinal'],
        'original': AUDIT['coverage']['visibleOriginalExamples'], 'user': AUDIT['coverage']['userRequests'],
    }
    review = json.loads((HERE / 'editorial-review.json').read_text())
    assert {r['id'] for r in review['possessed']} == {f'P{n:03}' for n in range(1, 76)}
    assert len({r['mechanic'] for r in review['possessed']}) == 75
    assert all(all(i in BY_ID for i in group['cards']) for group in review['similarityReviews'])
    for c in CARDS:
        assert re.fullmatch(r'[PERSM]\d{3}', c['id'])
        assert c['title'].strip() and c['family'] in FAMILY_LABELS
        assert isinstance(c['requirements'], list)
        assert len(c['sets']) == len(set(c['sets']))
        assert set(c['sets']) <= set(SET_LABELS)
        assert not {'indoor', 'outdoor'} <= set(c['sets'])
        assert c['provenance']['adaptation'].strip()
        assert set(c['provenance']['sources']) <= source_ids
        assert set(c['provenance']['inspirations']) <= set(FICTION_BY_ID)
        assert c['provenance']['classification'] == ('adaptation' if c['provenance']['sources'] else 'new')
        if set(c['sets']) & {'indoor', 'outdoor', 'contact'}:
            assert c['requirements'] or c['type'] == 'story'
        if c['type'] == 'possessed':
            for key in ['behavior', 'infectionCondition', 'releaseCondition']:
                assert c[key].strip() and len(c[key]) <= 2000
            assert c['infectionCondition'] != c['releaseCondition']
        if c['type'] == 'exorcist':
            assert c['mission'].strip() and c['successCondition'].strip()
            assert 'depositRequired' not in c and 'обител' not in ' '.join(strings({k: v for k, v in c.items() if k != 'provenance'})).lower()
        if c['type'] == 'prophecy':
            assert c['rule'].strip() and c['trigger'].strip() and c['action'].strip()
            assert c['scope'] == ('ritual_end' if c['final'] else 'ritual_table')
        if c['type'] == 'story':
            assert c['readAt'] == 'before_first_exorcism'
            assert 900 <= len(c['prologue']) <= 1400
            assert not re.search(r'гостиниц|театр|сторож|поисковик|поляна', c['prologue'], re.I)
        if c['type'] == 'reference':
            assert len(c['sections']) == 7
            assert all(s['title'].strip() and s['text'].strip() for s in c['sections'])
        # No dormant helper field or disguised question/answer block can enter the pack.
        def inspect_keys(value):
            if isinstance(value, dict):
                for key, item in value.items():
                    assert key.casefold() not in {'clue', 'hint', 'hints', 'help', 'подсказка', 'подсказки'}
                    inspect_keys(item)
            elif isinstance(value, list):
                for item in value:
                    inspect_keys(item)
        inspect_keys(c)
        visible = {k: v for k, v in c.items() if k not in ['provenance', 'family', 'requirements']}
        assert not re.search(r'подсказ|скажите\s+[«\"]?проверка', ' '.join(strings(visible)), re.I)
        if c['type'] not in ['story', 'reference']:
            # Fictional documents in prologues are not physical props. Current cards need none.
            active = ' '.join(strings({k: v for k, v in c.items() if k not in ['provenance', 'family']}))
            active = active.replace('небумаж', '')
            assert not re.search(r'бумаг|бумаж|картон|жетон|конверт|карандаш|фломастер|распечат|чист\w*\s+лист', active, re.I), c['id']
    for key, kind in [('behavior', 'possessed'), ('infectionCondition', 'possessed'),
                      ('releaseCondition', 'possessed'), ('mission', 'exorcist')]:
        texts = [re.sub(r'\s+', ' ', c[key]).strip().casefold() for c in CARDS if c['type'] == kind]
        assert len(texts) == len(set(texts)), ('Duplicate playable text', key)
    assert sum(c['type'] == 'prophecy' and c['final'] for c in CARDS) == 1
    assert BY_ID['R011']['final']
    for row in AUDIT['entries']:
        assert row['decision'] in AUDIT['decisions']
        assert row['sourceTitle'].strip() and row['sourceObservation'].strip() and row['reason'].strip()
        assert row['targetIds'] and all(t in BY_ID for t in row['targetIds'])
    # Every credited inspiration is traceable back to that exact target in the audit.
    rows = {r['sourceId']: r for r in AUDIT['entries']}
    for c in CARDS:
        for source in c['provenance']['sources']:
            assert c['id'] in rows[source]['targetIds']
    validate_revision()


def validate_revision():
    assert PACK['requiredExorcistEquipment'] == ['phone']
    assert PACK['taskProps'] == []
    assert len(FICTION['sources']) == len(FICTION_BY_ID) == 12
    assert Counter(source['kind'] for source in FICTION['sources'])['film'] == 3
    for source in FICTION['sources']:
        assert source['urls'] and all(url.startswith('https://') for url in source['urls'])
        assert all(source[k] for k in ['creator', 'setting', 'plot', 'fearActions', 'adaptationBoundary'])
    assert {row['id'] for row in REVISION['primary']} == set(BY_ID)
    assert len(REVISION['primary']) == 136
    for kind, counts in [('possessed', {'retain_core': 31, 'adapt': 18, 'replace': 26}),
                         ('exorcist', {'retain_core': 20, 'adapt': 14, 'replace': 8})]:
        assert Counter(row['decision'] for row in REVISION['primary'] if row['type'] == kind) == counts
    assert len(REVISION['variants']) == len({row['id'] for row in REVISION['variants']}) == 38
    assert Counter(row['decision'] for row in REVISION['variants']) == {'retain_core': 27, 'adapt': 9, 'replace': 2}
    for row in REVISION['primary'] + REVISION['variants']:
        assert row['entityIntent'].strip() and row['causalLink'].strip()
        assert row['acceptance'] == 'editorially_reviewed_not_playtested'
        assert set(row['inspirations']) <= set(FICTION_BY_ID)
    for c in CARDS:
        active = ' '.join(strings({k: v for k, v in c.items() if k != 'provenance'}))
        assert not re.search(r'\b(?:P|E|S|HP|HE)\d{3}\b', active.replace(c['id'], '')), c['id']
        if c['type'] == 'exorcist':
            assert not re.search(r'возьмите\s+(?:собственн|с\s+базы)|на\s+собственном\s+шнуре|собственн\w*\s+(?:платок|шнур|вещь)|пронесите|свободный\s+карман', active, re.I), c['id']
        requirements = ' '.join(c['requirements'])
        assert not re.search(r'\b(?:кружк|чашк|шнур|монет|платок|коробоч|фигурк|веточк|мелов|ключ|стул)\w*', requirements, re.I), c['id']
        if re.search(r'зеркал', requirements, re.I):
            assert c['id'] in ['P026', 'P039']
    for contract in REVISION['preservedContracts']:
        if contract['collection'] != 'primary':
            continue
        value = {key: BY_ID[contract['id']][key] for key in contract['fields']}
        assert hashlib.sha256(json.dumps(value, ensure_ascii=False, sort_keys=True).encode()).hexdigest() == contract['sha256'], contract['id']


def witness(pair, event):
    """Construct a finite witness, rather than claim to solve arbitrary natural language."""
    utterance = {
        'ordinary': 'Вы можете начинать.', 'answer': 'Да, всё готово.',
        'heard_exorcist': 'Уходи.', 'arrival': 'Я вернулся.', 'candles': '',
    }[event]
    if event in ['answer', 'heard_exorcist'] and 'R007' in pair:
        utterance = 'Я здесь. ' + utterance
    if utterance and 'R003' in pair:
        utterance = utterance.rstrip('.') + '. Помоги нам.'
    before, during, after = [], [], []
    if utterance:
        if 'R004' in pair:
            before.append('raise_then_lower_hand')
        if 'R001' in pair:
            during.append('cover_mouth_with_one_hand')
        if 'R008' in pair:
            during.append('look_at_ritual_board')
    if event == 'candles' and 'R009' in pair:
        after.append('touch_own_chest_once')
    return {'event': event, 'utterance': utterance,
            'before': before, 'during': during, 'after': after,
            'volume': 'whisper' if event == 'heard_exorcist' and 'R002' in pair else 'ordinary'}


def check_witness(pair, sample):
    event, text = sample['event'], sample['utterance']
    if not text:
        assert event == 'candles'
    if 'R001' in pair and text:
        assert 'cover_mouth_with_one_hand' in sample['during']
    if 'R002' in pair and event == 'heard_exorcist':
        assert 'Уходи' in text and sample['volume'] == 'whisper'
        assert not re.search(r'\bэкзорцист\b', text, re.I)
    if 'R003' in pair and text:
        assert text.endswith('Помоги нам.')
    if 'R004' in pair and text:
        assert sample['before'] == ['raise_then_lower_hand']
    if 'R005' in pair and text:
        assert not re.search(r'\b(?:Анна|Маша|Петя|Саша|Миша)\b', text, re.I)
    if 'R006' in pair and event == 'ordinary':
        assert text.startswith('Вы ')
    if 'R007' in pair and event in ['answer', 'heard_exorcist']:
        assert text.startswith('Я здесь.')
    if 'R008' in pair and text:
        assert 'look_at_ritual_board' in sample['during']
    if 'R009' in pair and event == 'candles':
        assert sample['after'] == ['touch_own_chest_once']
    if 'R010' in pair and event == 'arrival':
        assert text.startswith('Я вернулся.')


def compatibility():
    rows = []
    for pair in itertools.combinations([f'R{n:03}' for n in range(1, 11)], 2):
        samples = [witness(pair, e) for e in ['ordinary', 'answer', 'heard_exorcist', 'arrival', 'candles']]
        for sample in samples:
            check_witness(pair, sample)
        notes = []
        if set(pair) == {'R001', 'R004'}:
            notes.append('Raise the same hand first, then use it to cover the mouth; no third hand is needed.')
        if 'R002' in pair:
            notes.append('The whispered response addresses a spirit. It may take the other rule’s prefix or suffix; it never repeats the trigger word.')
        if 'R003' in pair and 'R006' in pair:
            notes.append('The singular closing appeal addresses a spirit, while formal address applies only to mediums.')
        if 'R010' in pair:
            notes.append('The arrival declaration is made before ordinary conversation and obeys the other speech condition.')
        if 'R009' in pair:
            notes.append('The chest gesture follows the candle batch; speech gestures occur at a different trigger.')
        if not notes:
            notes.append('Both obligations can be satisfied: positional/gesture conditions and speech clauses use independent channels or nonconflicting phrase positions.')
        rows.append({'left': pair[0], 'right': pair[1], 'status': 'compatible_in_bounded_editorial_model',
                     'notes': notes, 'witnesses': samples})
    assert len(rows) == 45
    assert len({tuple([r['left'], r['right']]) for r in rows}) == 45
    return dict(format='pomekhi.prophecy-pair-review', version=1, pairCount=45,
                scenarioCount=225,
                limit='All 45 ordinary pairs have explicit witnesses in five scenarios. This checks the authored trigger model, not every possible utterance, accessibility need or physical table arrangement. The model must be reviewed with future wording changes.',
                pairs=rows)


def paragraph(label, text, cls=''):
    return '<div class="field ' + cls + '"><h4>' + escape(label) + '</h4>' + ''.join(
        '<p>' + escape(p) + '</p>' for p in text.split('\n\n')) + '</div>'


def card_html(c, *, editorial=True, collection=None, answers=None):
    labels = c['sets'] or ['ordinary']
    badges = ''.join('<span class="tag">' + escape(SET_LABELS.get(s, 'Обычная')) + '</span>' for s in labels)
    content = ''
    kind = c['type']
    if answers is not None:
        content = ''.join(paragraph(question, answer, style) for question, answer, style in answers)
    elif kind == 'possessed':
        content += paragraph('Поведение', c['behavior'])
        content += '<div class="outcomes">'
        content += paragraph('Заражение', c['infectionCondition'], 'capture outcome')
        content += paragraph('Освобождение', c['releaseCondition'], 'release outcome') + '</div>'
    elif kind == 'exorcist':
        content += paragraph('Миссия', c['mission'])
        content += paragraph('Условие выполнения', c['successCondition'], 'release outcome')
    elif kind == 'prophecy':
        content += paragraph('Финал' if c['final'] else 'Условие у ритуального стола', c['rule'])
        content += paragraph('Когда действует', c['trigger'])
    elif kind == 'story':
        content += paragraph('Прочитать перед первым экзорцизмом', c['prologue'], 'prologue')
    else:
        for section in c['sections']:
            content += paragraph(section['title'], section['text'])
    if c['requirements']:
        content += '<div class="requirements"><h4>До включения в колоду</h4><ul>' + ''.join('<li>' + escape(x) + '</li>' for x in c['requirements']) + '</ul></div>'
    if editorial:
        provenance = c['provenance']
        provenance_label = 'Авторская карта' if provenance['classification'] == 'new' else 'Адаптация / переработка'
        refs = ', '.join(provenance['sources']) or 'new authored content'
        content += '<details class="editorial"><summary>' + provenance_label + ' · источники и изменения</summary><p lang="en">' + escape(refs) + '</p><p lang="en">' + escape(provenance['adaptation']) + '</p></details>'
        inspiration = ', '.join('<a href="#fiction-' + key + '">' + escape(FICTION_BY_ID[key]['titleRu']) + '</a>' for key in provenance['inspirations'])
        if inspiration:
            content += '<p class="private">Художественные мотивы: ' + inspiration + '</p>'
    edition = f' data-collection="{collection}"' if collection else ''
    if collection == 'comedy':
        badges += '<span class="tag comedy-tag">Смешная колода</span>'
    searchable = {key: value for key, value in c.items() if key not in ('provenance', 'fearMechanism')}
    search_text = strings(searchable) if answers is None else [c['id'], c['title'], *(answer for _, answer, _ in answers)]
    text = ' '.join(search_text).casefold().replace('ё', 'е')
    return f'<article class="card" id="{c["id"]}" data-type="{kind}" data-sets="{" ".join(c["sets"])}" data-search="{escape(text, quote=True)}"{edition}>' + \
        f'<header><span class="card-id">{c["id"]}</span><span class="family">{escape(FAMILY_LABELS[c["family"]])}</span><h3>{escape(c["title"])}</h3><div class="tags">{badges}</div></header>' + content + '</article>'


STYLE = """
:root{color-scheme:light;--ink:#242720;--paper:#f3f0e8;--line:#d4d2c7;--blood:#803f36;--moss:#3f5844}
*{box-sizing:border-box}body{margin:0;background:var(--paper);color:var(--ink);font:16px/1.6 -apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif}
a{color:var(--moss);text-underline-offset:3px}button,input,select{font:inherit}button,select,input{border:1px solid #b8bcaf;border-radius:5px;background:#fffdf7;color:var(--ink);padding:10px 12px;min-height:44px;max-width:100%}
button{cursor:pointer}button:hover{background:#e7eadf}button:focus-visible,a:focus-visible,summary:focus-visible,input:focus-visible,select:focus-visible{outline:3px solid #9b682c;outline-offset:3px}
.hero{background:#232a24;color:#f5f1e5;padding:52px max(22px,calc((100vw - 1180px)/2));border-bottom:5px solid #8b604b}.eyebrow{font-size:12px;letter-spacing:.2em;color:#d1b295;font-weight:700}.hero h1{font:normal clamp(34px,6vw,62px)/1.1 Georgia,serif;margin:18px 0}.hero p{max-width:780px;color:#d8dcd2}.hero a{color:#e8ccb0}.hero-links{display:flex;gap:12px;flex-wrap:wrap}.hero-links a{padding:7px 0}
main{max-width:1224px;padding:26px 22px 64px;margin:auto}.intro{max-width:940px;margin-bottom:22px}.intro summary{font-weight:600;cursor:pointer}.notice{border-left:3px solid var(--blood);padding:10px 16px;background:#e9e4d8}.toolbar{position:sticky;top:0;z-index:2;background:var(--paper);padding:12px 0;border-bottom:1px solid var(--line);margin-bottom:24px;box-shadow:0 10px 12px -12px #0007}.filters{display:grid;grid-template-columns:minmax(150px,1fr) minmax(140px,.8fr) minmax(180px,1.2fr) auto;gap:10px;align-items:end}label{font-size:12px;font-weight:600;display:block}label input,label select{display:block;width:100%;font-size:14px;margin-top:4px}.status{font-size:13px;color:#545f50;margin:10px 0 0}.grid{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:22px;align-items:start}
.card{min-width:0;background:#fffdf8;border:1px solid var(--line);border-top:3px solid #56634f;border-radius:4px;padding:24px;scroll-margin-top:145px}.card[hidden]{display:none}.card header{border-bottom:1px solid var(--line);padding-bottom:16px}.card-id{font-size:13px;font-weight:700;letter-spacing:.13em;color:#6d4638}.family{font-size:12px;float:right;color:#62705b}.card h3{font:normal 28px/1.2 Georgia,serif;margin:10px 0 12px}.tag{display:inline-block;background:#edf0e8;border:1px solid #d5dacb;border-radius:3px;padding:2px 7px;font-size:11px;margin:2px 5px 0 0}.field{margin:18px 0}.field h4,.requirements h4{font-size:11px;letter-spacing:.09em;text-transform:uppercase;margin:0 0 6px;color:#5c6756}.field p{margin:0 0 10px;font-size:15px;line-height:1.65}.outcomes .field{padding:12px 14px;border-left:3px solid}.capture{border-color:#a25b4e;background:#f5e9e3}.release{border-color:#61825d;background:#edf2e9}.capture h4{color:#854538}.release h4{color:#46653c}.requirements{margin-top:20px;border-top:1px dashed var(--line);padding-top:14px}.requirements li{font-size:13px;margin:5px 0}ul{padding-left:20px}.private{font-size:12px;font-weight:600;color:#714c39}.editorial{border-top:1px solid var(--line);padding-top:12px;margin-top:18px;color:#65705c;font-size:12px;overflow-wrap:anywhere}.editorial summary{cursor:pointer}.editorial p{line-height:1.5}.prologue p{font-family:Georgia,serif;font-size:17px}.conditions-hidden .outcome{display:none}.empty{padding:30px;border:1px dashed var(--line);text-align:center}.supplement{margin-top:48px;border-top:2px solid #5c6756;padding-top:24px}.supplement h2{font:normal 28px Georgia,serif}.scroll{overflow:auto;max-height:580px;border:1px solid var(--line)}table{border-collapse:collapse;width:100%;font-size:12px;background:#fffdf8}th,td{text-align:left;vertical-align:top;padding:12px;border-bottom:1px solid var(--line);min-width:100px}th{background:#e3e7db;position:sticky;top:0}td:last-child{min-width:260px}.legend{display:flex;flex-wrap:wrap;gap:7px;margin:16px 0}.pair{border-bottom:1px solid var(--line);padding:10px 0}.pair summary{cursor:pointer}.pair p{font-size:13px}.pair pre{white-space:pre-wrap;font-size:12px;overflow-wrap:anywhere}.footer{font-size:13px;color:#626e5b;margin-top:32px}code{overflow-wrap:anywhere}
@media(min-width:1000px){.card[data-type=story],.card[data-type=reference]{grid-column:span 2}.card[data-type=story] .prologue{max-width:780px}.card[data-type=reference] .field{max-width:880px}}
@media(max-width:760px){.filters{grid-template-columns:1fr 1fr}.filters label:nth-child(3){grid-column:1/-1}.filters button{grid-column:1/-1}.grid{grid-template-columns:1fr}.hero{padding-top:30px;padding-bottom:28px}.toolbar{position:relative}.card{padding:18px;scroll-margin-top:20px}.card h3{font-size:25px}.family{float:none;display:block;margin-top:4px}main{padding-inline:14px}}
@media print{body{background:white;font-size:11px}.hero{background:white;color:#111;padding:0 0 14px;border-color:#111}.hero p{color:#333}.hero-links,.toolbar,.intro,.supplement,.editorial,.footer,.empty{display:none!important}.hero h1{font-size:30px}.hero .eyebrow{color:#333}main{padding:14px 0}.grid{display:block}.card{break-inside:avoid;page-break-inside:avoid;box-shadow:none;margin:0 0 14px;padding:14px}.card[hidden]{display:none}.card h3{font-size:20px}.field p{font-size:11px;line-height:1.45}.field{margin:10px 0}.prologue p{font-size:13px}.tag{font-size:9px}.conditions-hidden .outcome{display:block}}
.outcomes .capture{border-left-color:#a25b4e}.outcomes .release{border-left-color:#61825d}
.comedy-tag{background:#f7edcb;border-color:#d8c68c;color:#554518}
"""

SCRIPT = """
const cards = [...document.querySelectorAll('.card')];
const type = document.querySelector('#type'), subset = document.querySelector('#subset'), search = document.querySelector('#search');
function filter() {
  const q = search.value.trim().toLocaleLowerCase('ru').replaceAll('ё','е');
  let shown = 0;
  for (const c of cards) {
    const tags = c.dataset.sets.split(' ').filter(Boolean);
    const matchesSubset = !subset.value || (subset.value === 'ordinary' && !tags.length) ||
      c.dataset.collection === subset.value || tags.includes(subset.value);
    const fits = (!type.value || c.dataset.type === type.value) && matchesSubset &&
      (!q || c.dataset.search.includes(q));
    c.hidden = !fits; shown += Number(fits);
  }
  document.querySelector('#count').textContent = `Показано ${shown} из ${cards.length} карт`;
  document.querySelector('#empty').hidden = shown !== 0;
}
for (const el of [type, subset]) el.addEventListener('change', filter);
search.addEventListener('input', filter);
document.querySelector('#visibility').addEventListener('click', function () {
  const hidden = document.body.classList.toggle('conditions-hidden');
  this.textContent = hidden ? 'Показать условия' : 'Скрыть условия';
  this.setAttribute('aria-pressed', String(hidden));
});
function followHash() {
  const id = decodeURIComponent(location.hash.slice(1));
  if (id === 'comedy' && subset.querySelector('option[value="comedy"]')) {
    type.value = ''; subset.value = 'comedy'; search.value = ''; filter();
    subset.scrollIntoView();
    return;
  }
  const card = cards.find(c => c.id === id);
  if (!card) return;
  type.value = ''; subset.value = ''; search.value = ''; filter();
  card.scrollIntoView();
}
window.addEventListener('hashchange', followHash);
document.querySelector('a[href="#comedy"]')?.addEventListener('click', () => {
  if (location.hash === '#comedy') followHash();
});
filter(); if (location.hash) followHash();
"""


def toolbar(cards, *, collections=False):
    counts = Counter(card['type'] for card in cards)
    options = ''.join(f'<option value="{kind}">{label} · {counts[kind]}</option>' for kind, label in TYPE_LABELS.items())
    subsets = ''.join(f'<option value="{key}">{label}</option>' for key, label in SET_LABELS.items())
    if collections:
        subsets += '<option value="comedy">Смешная колода</option>'
    total = len(cards)
    return f'''<section class="toolbar" aria-label="Фильтры каталога"><div class="filters">
<label for="type">Колода<select id="type"><option value="">Все {total} карт</option>{options}</select></label>
<label for="subset">Набор<select id="subset"><option value="">Все наборы</option><option value="ordinary">Без дополнительных отметок</option>{subsets}</select></label>
<label for="search">Поиск<input id="search" type="search" placeholder="Название, действие или ID" autocomplete="off"></label>
<button id="visibility" type="button" aria-pressed="false">Скрыть условия</button></div>
<p class="status" id="count" role="status" aria-live="polite">Показано {total} из {total} карт</p></section>'''


def quick_answers(cards):
    source = HERE.parents[1] / 'src' / 'server' / 'short-card-copy.ts'
    copy = json.loads(source.read_text().strip().removeprefix('export default ').removesuffix(';'))['answers']
    assert set(copy) == {card['id'] for card in cards}
    questions = {
        'possessed': [('Кто вы и чего хотите?', ''), ('Как заразить экзорциста?', 'capture outcome'),
                      ('Как экзорцисту освободить одержимого?', 'release outcome')],
        'exorcist': [('Как выполнить личную миссию?', '')],
        'prophecy': [('Как соблюдать прорицание?', '')],
        'story': [('С чего начинается история?', '')],
        'reference': [('Что делать в этой роли?', '')],
    }
    result = {}
    for card in cards:
        id = card['id']
        kind = card['type']
        prompts = questions[kind]
        if card.get('final'):
            prompts = [('Как заканчивается ритуал?', '')]
        assert len(copy[id]) == len(prompts), id
        answers = []
        for index, (question, style) in enumerate(prompts):
            text = copy[id][index]
            assert text and not text.endswith('.'), id
            answers.append((question, text + '.', style))
        if kind == 'possessed':
            answers.insert(1, ('Что сделать, заняв своё место?', 'Войдя в игровую локацию и заняв выбранное место, выключите свой источник освещения.', ''))
        if kind == 'exorcist':
            answers.append(('Как освободить одержимого?', 'Поймите, чего добивается одержимый, выполните условие его карты и подтвердите освобождение на телефоне.', ''))
        result[id] = answers
    return result


def build_all_html():
    comedy_source = HERE.parents[1] / 'src' / 'server' / 'comedy-cards.ts'
    comedy_by_role = json.loads(comedy_source.read_text().strip().removeprefix('export default ').removesuffix(';'))
    comedy = [dict(card, type=role) for role, missions in comedy_by_role.items() for card in missions]
    cards = CARDS + comedy
    assert len(CARDS) == 136
    assert len({card['id'] for card in cards}) == len(cards)
    assert Counter(card['type'] for card in comedy) == {'possessed': 24, 'exorcist': 16}
    answers = quick_answers(cards)
    rendered = (
        ''.join(card_html(card, editorial=False, answers=answers[card['id']]) for card in CARDS)
        + ''.join(card_html(card, editorial=False, collection='comedy', answers=answers[card['id']]) for card in comedy)
    )
    return f'''<!doctype html>
<html lang="ru"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>Одержимые — все карты</title><style>{STYLE}</style></head>
<body><header class="hero"><div class="eyebrow">ОДЕРЖИМЫЕ / КАТАЛОГ</div>
<h1>Все карты игры</h1>
<p>{len(CARDS)} карт из текущего авторского банка и {len(comedy)} смешных карт. Смешные карты можно добавить в настройках партии.</p>
<nav class="hero-links" aria-label="Подборки"><a href="#comedy">Смешная колода</a></nav>
</header><main>
<section class="intro" aria-label="Общие правила">
<h2>Как понять, что человек заражён?</h2>
<p>Заражённый остаётся с группой одержимого и играет ту же ситуацию, а на своём телефоне видит «Вы заражены».</p>
<h2>Что не считается заражением?</h2>
<p>Случайный испуг, обсуждение согласия, просьба о помощи или остановке вне роли не считаются заражением.</p>
<h2>Когда делать личную миссию?</h2>
<p>Выполните её до призыва и отметьте результат на телефоне.</p>
</section>
{toolbar(cards, collections=True)}
<div class="grid">{rendered}</div>
<p class="empty" id="empty" hidden>По этим условиям карт нет. Измените поиск или набор.</p>
</main><script>{SCRIPT}</script></body></html>'''


def build_html(pair_review):
    rules = ''.join('<p>' + escape(text) + '</p>' for text in PACK['playerRules'].values())
    rows = ''
    for row in AUDIT['entries']:
        targets = ', '.join(f'<a href="#{t}">{t}</a>' for t in row['targetIds'])
        page = f' · стр. {row["page"]}' if row['page'] else ''
        decision = {'keep_basis': 'Сохранить основу', 'rework': 'Переработать', 'replace': 'Заменить'}[row['decision']]
        original = '<details><summary>' + escape(row['sourceTitle']) + '</summary><p>' + escape(row['sourceObservation']) + '</p></details>'
        rows += '<tr><td>' + escape(row['sourceId'] + page) + '</td><td>' + original + '</td><td>' + decision + '</td><td>' + targets + '</td><td lang="en">' + escape(row['reason']) + '</td></tr>'
    pairs = ''
    for row in pair_review['pairs']:
        left, right = row['left'], row['right']
        pairs += f'<details class="pair"><summary>{left} + {right} · ' + escape(BY_ID[left]['title'] + ' / ' + BY_ID[right]['title']) + '</summary>'
        pairs += ''.join('<p lang="en">' + escape(note) + '</p>' for note in row['notes'])
        pairs += '<pre lang="en">' + escape(json.dumps(row['witnesses'], ensure_ascii=False, indent=2)) + '</pre></details>'
    revision_rows = ''
    decision_labels = {'retain_core': 'Сохранена основа', 'adapt': 'Адаптировано', 'replace': 'Заменено', 'adapt_no_props': 'Без реквизита', 'adapt_observable_scene': 'Сцена для других игроков', 'existing_house_mirror': 'Зеркало дома'}
    for row in REVISION['primary']:
        target = '#' + row['id']
        revision_rows += '<tr><td><a href="' + target + '">' + row['id'] + '</a></td><td>' + escape(row['title']) + '</td><td>' + decision_labels[row.get('currentDecision', row['decision'])] + '</td><td lang="en">' + escape(row['entityIntent']) + '</td><td lang="en">' + escape(row['causalLink']) + '</td></tr>'
    fiction_rows = ''
    for source in FICTION['sources']:
        links = ' · '.join('<a href="' + escape(url, quote=True) + '">Источник ' + str(n + 1) + '</a>' for n, url in enumerate(source['urls']))
        actions = '<ul lang="en">' + ''.join('<li>' + escape(action) + '</li>' for action in source['fearActions']) + '</ul>'
        fiction_rows += '<details class="pair" id="fiction-' + source['id'] + '"><summary>' + escape(source['titleRu']) + ' · ' + str(source['year']) + '</summary><p lang="en">' + escape(source['creator'] + '. ' + source['setting']) + '</p><p lang="en">' + escape(source['plot']) + '</p>' + actions + '<p lang="en">' + escape(source['adaptationBoundary']) + '</p><p>' + links + '</p></details>'
    css_hash = hashlib.sha256(STYLE.encode()).hexdigest()
    return f'''<!doctype html>
<html lang="ru"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<meta name="description" content="Полный авторский набор из 136 карт для игры с компьютерным Мастером.">
<title>Помехи — 136 карт</title><style>{STYLE}</style></head>
<body><header class="hero"><div class="eyebrow">ПОМЕХИ / АВТОРСКАЯ КОЛОДА / 03.11.2026</div>
<h1>Кто-то остался<br>по ту сторону света.</h1>
<p>136 карт: одержимые, миссии экзорцистов, прорицания, истории и памятки. Здесь открыт полный текст для авторского просмотра. Этот каталог нельзя показывать игрокам на общем экране во время партии.</p>
<nav class="hero-links" aria-label="Материалы набора"><a href="all.html">Все карты на одной странице</a><a href="cards.json" download>Полный JSON</a><a href="#domestic-review">Что изменено в 136 картах</a><a href="#fiction-review">12 произведений</a><a href="#source-review">{len(AUDIT['entries'])} исходных записей</a><a href="#pair-review">45 пар прорицаний</a></nav></header>
<main><div class="intro"><p class="notice">Авторская адаптация оригинальных правил «Одержимых» с компьютерным Мастером. Набор подготовлен отдельно от приложения: текущий импорт игры его не поддерживает. Проверка текстов выполнена; живой игровой тест ещё не проводился.</p>
<details><summary>Как читать набор и выбирать дополнительные карты</summary><p>Обычные карты не имеют дополнительных отметок. Карты помещения и улицы выбирают по месту игры, физический контакт — по согласию группы, повышенную сложность — по желанию. Совместные отметки действуют одновременно. Все необходимые условия места и реквизит указаны на карточках.</p>{rules}</details></div>
{toolbar(CARDS)}
<div class="grid">{''.join(card_html(c) for c in CARDS)}</div><p class="empty" id="empty" hidden>По этим условиям карт нет. Измените поиск или набор.</p>
<section class="supplement" id="domestic-review"><h2>Домашний хоррор: решения по всем картам</h2><p>Первая домашняя редакция: у одержимых 31 сохранённая основа, 18 адаптаций и 26 замен; у экзорцистов — 20, 14 и 8. Последующая правка убирает весь реквизит: в таблице она отмечена отдельно. Ангел видит себя в уже имеющемся зеркале дома. Вступления свободно сочетаются с колодой. Широкую таблицу можно прокручивать в сторону.</p><p><a href="revision-audit.json">Полный реестр JSON</a> · <a href="revision-audit.csv" download>Таблица CSV</a> · <a href="research.md">Исследование</a></p><div class="scroll" tabindex="0" role="region" aria-label="Решения по 136 картам"><table><thead><tr><th>Карта</th><th>Название</th><th>Решение</th><th>Entity intention</th><th>Why the actions fit</th></tr></thead><tbody>{revision_rows}</tbody></table></div></section>
<section class="supplement" id="fiction-review"><h2>Произведения и художественные мотивы</h2><p>Литературные тексты, материалы изданий фильмов и авторские свидетельства использованы как источники мотивов. Условия заражения и освобождения написаны для нашей игры. Это не восстановленные коммерческие карточки и не утверждения о настоящих духах.</p>{fiction_rows}</section>
<section class="supplement" id="source-review"><h2>Что изменено в исходных картах</h2><p>136 карт авторского PDF, 90 действующих личных карт, 7 действующих прорицаний, 19 оригинальных примеров ; явных запросов пользователя: {AUDIT['coverage']['userRequests']}. Упоминания реквизита в исторических источниках не являются требованиями текущих карточек. «Заменить» связывает исходную запись с заменой. Пояснения для последующего внедрения оставлены на английском.</p>
<div class="scroll" tabindex="0" role="region" aria-label="Таблица переработок"><table><thead><tr><th>Источник</th><th>Название</th><th>Решение</th><th>Новые карты</th><th>Причина / адаптация</th></tr></thead><tbody>{rows}</tbody></table></div></section>
<section class="supplement" id="pair-review"><h2>Все 45 пар прорицаний</h2><p>Для каждой пары проверены обычная речь, ответ, отклик на слово-триггер, возвращение и завершение перемещения свечей. Это проверка описанных условий, а не доказательство удобства за настоящим столом.</p>{pairs}</section>
<footer class="footer">Все карты — адаптации или новый авторский текст. Полная коммерческая колода по книге правил не восстановлена. Реквизит, свет, контакт, сложность разгадки, страх и баланс требуют проверки с участниками. Тексты и источники: <a href="cards.json">cards.json</a> · <a href="source-audit.json">source-audit.json</a> · <a href="prophecy-pairs.json">prophecy-pairs.json</a>.</footer></main><script>{SCRIPT}</script>
<!-- Offline artifact. No network assets or runtime connection. Style fingerprint: {css_hash} -->
</body></html>'''


def main():
    validate()
    pair_review = compatibility()
    save('prophecy-pairs.json', pair_review)
    with (HERE / 'source-audit.csv').open('w', newline='', encoding='utf-8-sig') as file:
        fields = ['sourceId', 'sourceTitle', 'type', 'page', 'sourceObservation', 'decision', 'targetIds', 'reason']
        writer = csv.DictWriter(file, fieldnames=fields)
        writer.writeheader()
        for row in AUDIT['entries']:
            writer.writerow({key: '; '.join(row[key]) if key == 'targetIds' else row[key] for key in fields})
    with (HERE / 'revision-audit.csv').open('w', newline='', encoding='utf-8-sig') as file:
        fields = ['id', 'type', 'baseCard', 'title', 'decision', 'currentDecision', 'entityIntent', 'causalLink', 'inspirations', 'acceptance']
        writer = csv.DictWriter(file, fieldnames=fields)
        writer.writeheader()
        for row in REVISION['primary'] + REVISION['variants']:
            writer.writerow({key: '; '.join(row[key]) if key == 'inspirations' else row.get(key, '') for key in fields})
    (HERE / 'index.html').write_text(build_html(pair_review))
    (HERE / 'all.html').write_text(build_all_html())
    summary = dict(status='pass', cardCount=136, counts=EXPECTED,
        sourceEntryCount=len(AUDIT['entries']), pairCount=45, witnessCount=225,
        perPossessedFamily=dict(Counter(c['family'] for c in CARDS if c['type'] == 'possessed')),
        perSubset={s: sum(s in c['sets'] for c in CARDS) for s in SET_LABELS},
        fictionSourceCount=len(FICTION_BY_ID), revisionRecordCount=len(REVISION['primary']) + len(REVISION['variants']),
        inputs={name: hashlib.sha256((HERE / name).read_bytes()).hexdigest() for name in ['cards.json', 'source-audit.json', 'editorial-review.json', 'build.py', 'fiction-sources.json', 'revision-audit.json', 'research.md']},
        checks=['Exact 136-card count and five category counts.', 'Stable unique IDs and titles.',
            '75 distinct behavior/capture/release records; no missing conditions.',
            'No helper fields or helper commands in playable content.',
            'No exact duplicate behavior, capture, release or mission text.',
            f"Source inventory covers {len(AUDIT['entries'])} credited entries, {AUDIT['coverage']['userRequests']} user requests and every credited target.",
            'No carried or staged task props; existing house mirrors are the explicit natural-scene exception.',
            'All 174 revision decisions link intention, causal action and one of 12 fiction sources where applicable.',
            'Approved 31/18/26 and 20/14/8 primary decisions and 27/9/2 variant decisions are complete.',
            'Retained outcome contracts and movement editions match baseline hashes or explicit user-authorized card amendments; prophecy mechanics are unchanged.',
            'Paper-free active missions: no printed card, token, cardboard, envelope or drawing sheet is required.',
            'Optional subset prerequisites. No Dwelling offering fields or instructions.',
            'Exactly 10 ordinary prophecies and one final door.',
            '45 unique ordinary-prophecy pairs with 225 bounded executable witnesses.'],
        limitations=['Text uniqueness is not proof of semantic diversity; see editorial-review.json.',
            'Finite prophecy witnesses do not cover every utterance or accessibility requirement.',
            'No live playtest, no physical phone, no LAN/Tuna scenario and no runtime integration.'])
    save('validation.json', summary)
    print(f"PASS 136 paper-free cards; {len(AUDIT['entries'])} source entries; 45 prophecy pairs / 225 witnesses; offline HTML rebuilt.")


if __name__ == '__main__':
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--all', action='store_true', help='Build only the standalone catalog.')
    if parser.parse_args().all:
        (HERE / 'all.html').write_text(build_all_html())
    else:
        main()
