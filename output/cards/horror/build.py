"""Validate archived horror revisions and rebuild the detached selection."""
import hashlib
import json
import re
from collections import Counter
from pathlib import Path

HERE = Path(__file__).resolve().parent
PACK = json.loads((HERE / 'cards.json').read_text())
BASE_PATH = HERE.parent / 'cards.json'
BASE = json.loads(BASE_PATH.read_text())
BASE_BY_ID = {c['id']: c for c in BASE['cards']}
FICTION = {c['id']: c for c in json.loads((HERE.parent / 'fiction-sources.json').read_text())['sources']}
REVISION = json.loads((HERE.parent / 'revision-audit.json').read_text())
CARDS = PACK['cards']
COUNTS = PACK['expectedCounts']
TOTAL = sum(COUNTS.values())
HARDER = sum('harder' in c['sets'] for c in CARDS)
SETS = {'indoor': 'Помещение', 'outdoor': 'Улица', 'contact': 'Физический контакт', 'harder': 'Повышенная сложность'}


def write_json(name, value):
    (HERE / name).write_text(json.dumps(value, ensure_ascii=False, indent=2) + '\n')


def texts(value):
    if isinstance(value, str):
        yield value
    elif isinstance(value, dict):
        for v in value.values():
            yield from texts(v)
    elif isinstance(value, list):
        for v in value:
            yield from texts(v)


def check_keys(value):
    if isinstance(value, dict):
        for k, v in value.items():
            assert k.casefold() not in {'hint', 'hints', 'clue', 'help', 'подсказка', 'подсказки'}
            check_keys(v)
    elif isinstance(value, list):
        for v in value:
            check_keys(v)


def validate():
    assert PACK['requiredExorcistEquipment'] == ['phone']
    assert PACK['taskProps'] == []
    assert PACK['format'] == 'pomekhi.editorial-expansion' and PACK['version'] == 1
    assert PACK['composition'] == 'one_for_one_replacements'
    assert hashlib.sha256(BASE_PATH.read_bytes()).hexdigest() == PACK['base']['sha256']
    assert len(CARDS) == TOTAL
    assert len({c['id'] for c in CARDS}) == len({c['baseCard'] for c in CARDS}) == TOTAL
    assert dict(Counter(c['type'] for c in CARDS)) == COUNTS
    assert len({c['title'].casefold() for c in CARDS}) == TOTAL
    for c in CARDS:
        check_keys(c)
        assert re.fullmatch(r'H[PE]\d{3}', c['id'])
        assert c['title'].strip() and len(c['title']) <= 120
        assert c['baseCard'] in BASE_BY_ID and c['type'] == BASE_BY_ID[c['baseCard']]['type']
        assert c['provenance']['sources'] == ['primary:' + c['baseCard']]
        assert set(c['provenance']['inspirations']) <= set(FICTION)
        requirements = ' '.join(c['requirements'])
        assert not re.search(r'\b(?:кружк|чашк|шнур|монет|платок|коробоч|фигурк|веточк|мелов|ключ|стул)\w*', requirements, re.I), c['id']
        if re.search(r'зеркал', requirements, re.I):
            assert c['id'] in ['HP006', 'HP025']
        assert c['provenance']['adaptation'].strip() and c['fearMechanism'].strip()
        assert len(c['sets']) == len(set(c['sets']))
        assert set(c['sets']) <= set(SETS) and not {'indoor', 'outdoor'} <= set(c['sets'])
        if set(c['sets']) & {'indoor', 'outdoor', 'contact'}:
            assert c['requirements']
        fields = ['behavior', 'infectionCondition', 'releaseCondition'] if c['type'] == 'possessed' else ['mission', 'successCondition']
        for field in fields:
            assert isinstance(c[field], str) and c[field].strip() and len(c[field]) <= 2000
        if c['type'] == 'possessed':
            if c.get('sharedEdition'):
                assert c['id'] in ['HP025', 'HP026']
                assert c['behavior'] == BASE_BY_ID[c['baseCard']]['behavior']
            else:
                assert c['behavior'] != BASE_BY_ID[c['baseCard']]['behavior']
            assert c['infectionCondition'] != c['releaseCondition']
        else:
            assert c['mission'] != BASE_BY_ID[c['baseCard']]['mission']
            assert isinstance(c['depositRequired'], bool)
            if c['depositRequired']:
                assert c['requirements'] and 'Обител' in c['mission']
        playable = ' '.join(texts({k: v for k, v in c.items() if k not in ['provenance', 'fearMechanism']}))
        assert not re.search(r'подсказ', playable, re.I)
        assert not re.search(r'бумаг|бумаж|картон|жетон|конверт|карандаш|фломастер|распечат|чист\w*\s+лист', playable.replace('небумаж', ''), re.I), c['id']
    assert {c['id'] for c in CARDS if 'harder' in c['sets']} == set(PACK['harderCardIds'])
    for field in ['behavior', 'infectionCondition', 'releaseCondition', 'mission']:
        values = [c[field].casefold() for c in CARDS if field in c]
        assert len(values) == len(set(values)), field
    review = json.loads((HERE / 'editorial-review.json').read_text())
    assert {r['id'] for r in review['cards']} == {c['id'] for c in CARDS}
    assert all(r['status'] == 'editorially_reviewed_not_playtested' for r in review['cards'])
    current = {c['id']: c for c in CARDS}
    assert {row['id'] for row in REVISION['variants']} == set(current)
    for contract in REVISION['preservedContracts']:
        if contract['collection'] == 'horror':
            value = {key: current[contract['id']][key] for key in contract['fields']}
            assert hashlib.sha256(json.dumps(value, ensure_ascii=False, sort_keys=True).encode()).hexdigest() == contract['sha256'], contract['id']


def selection():
    replacement = {c['baseCard']: c for c in CARDS}
    combined = [replacement.get(c['id'], c) for c in BASE['cards']]
    assert len(combined) == len({c['id'] for c in combined}) == 147
    assert Counter(c['type'] for c in combined) == Counter(c['type'] for c in BASE['cards'])
    assert not ({c['baseCard'] for c in CARDS} & {c['id'] for c in combined})
    return {
        'format': 'pomekhi.editorial-selection', 'version': 1,
        'status': 'author-review-copy-not-a-runtime-import',
        'baseSha256': PACK['base']['sha256'],
        'counts': dict(Counter(c['type'] for c in combined)),
        'replacementCount': TOTAL,
        'replacements': [{'baseCard': c['baseCard'], 'variantId': c['id']} for c in CARDS],
        'notes': 'A detached 147-card editorial selection. Original base IDs are replaced, never appended. All original nonselected cards are preserved verbatim. No running game or issued assignment is changed.',
        'cards': combined,
    }


def main():
    validate()
    merged = selection()
    write_json('merged-selection.json', merged)
    write_json('validation.json', {
        'status': 'pass', 'cards': TOTAL, 'counts': dict(Counter(c['type'] for c in CARDS)),
        'mergedCards': 147, 'replacements': TOTAL,
        'harder': [c['id'] for c in CARDS if 'harder' in c['sets']],
        'contact': [c['id'] for c in CARDS if 'contact' in c['sets']],
        'checks': ['Every revision has a unique matching base card and preserves its role.',
                   'Every possessed revision has distinct behavior, capture and release text.',
                   'Every exorcist revision has a mission and explicit completion conditions.',
                   'No helper fields, helper blocks or placeholder text.',
                   'Harder membership matches explicit card metadata; fear is collection membership.',
                   'All replacements preserve the 147-card composition; original and variant never coexist.',
                   'No active revision requires paper, printed cards, tokens or cardboard.',
                   'Nonselected cards are copied verbatim; no base or runtime file is written.'],
        'inputs': {name: hashlib.sha256((HERE / name).read_bytes()).hexdigest() for name in ['cards.json', 'editorial-review.json', 'build.py']},
        'baseSha256': PACK['base']['sha256'],
        'limits': ['Editorial checks cannot establish actual fear, discoverability or game balance.',
                   'This is authored content, not runtime integration or a current-game import.'],
    })
    print(f"PASS {TOTAL} paper-free horror revisions; {COUNTS['possessed']} possessed / {COUNTS['exorcist']} exorcist; {HARDER} harder; detached selection remains 147 cards.")


if __name__ == '__main__':
    main()
