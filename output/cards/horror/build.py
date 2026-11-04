"""Validate and render the user-requested horror revisions without changing the base set."""
import hashlib
import json
import re
from collections import Counter
from html import escape
from html.parser import HTMLParser
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
KINDS = {'possessed': 'Одержимые', 'exorcist': 'Миссии экзорцистов'}


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


class Styles(HTMLParser):
    def __init__(self):
        super().__init__()
        self.inside = False
        self.parts = []

    def handle_starttag(self, tag, attrs):
        if tag == 'style':
            self.inside = True

    def handle_endtag(self, tag):
        if tag == 'style':
            self.inside = False

    def handle_data(self, data):
        if self.inside:
            self.parts.append(data)


def field(label, text, cls=''):
    return f'<div class="field {cls}"><h4>{escape(label)}</h4><p>{escape(text)}</p></div>'


def card(c):
    badges = ['<span class="tag">Сложность: ' + ('повышенная' if 'harder' in c['sets'] else 'обычная') + '</span>']
    badges += ['<span class="tag">' + SETS[s] + '</span>' for s in c['sets'] if s != 'harder']
    base_id = c['baseCard']
    body = '<p class="replacement">Вместо <a href="../index.html#' + base_id + '">' + base_id + ' · ' + escape(BASE_BY_ID[base_id]['title']) + '</a></p>'
    if c['type'] == 'possessed':
        body += field('Поведение', c['behavior'])
        body += '<div class="outcomes">' + field('Заражение', c['infectionCondition'], 'outcome capture')
        body += field('Освобождение', c['releaseCondition'], 'outcome release') + '</div>'
    else:
        body += field('Миссия', c['mission'])
        body += field('Условие выполнения', c['successCondition'], 'outcome release')
        if c['depositRequired']:
            body += '<p class="deposit">Лично посетите Обитель и выполните указанное подношение жестом или голосом. Телефон остаётся у вас.</p>'
    if c['requirements']:
        body += '<div class="requirements"><h4>До включения в колоду</h4><ul>' + ''.join('<li>' + escape(x) + '</li>' for x in c['requirements']) + '</ul></div>'
    body += '<details class="editorial"><summary>Авторская переработка · что изменено</summary>'
    body += '<p lang="en">' + escape(c['provenance']['adaptation']) + '</p><p lang="en">' + escape(c['fearMechanism']) + '</p></details>'
    inspiration = ', '.join('<a href="../index.html#fiction-' + key + '">' + escape(FICTION[key]['titleRu']) + '</a>' for key in c['provenance']['inspirations'])
    if inspiration:
        body += '<p class="private">Художественные мотивы: ' + inspiration + '</p>'
    searchable = ' '.join(texts({k: v for k, v in c.items() if k not in ['provenance', 'fearMechanism']})).casefold().replace('ё', 'е')
    return f'<article class="card" id="{c["id"]}" data-type="{c["type"]}" data-sets="{" ".join(c["sets"])}" data-search="{escape(searchable, quote=True)}"><header>' + \
        f'<span class="card-id">{c["id"]}</span><span class="family">{KINDS[c["type"]]}</span><h3>{escape(c["title"])}</h3><div class="tags">{"".join(badges)}</div></header>' + body + '</article>'


SCRIPT = """
const cards = [...document.querySelectorAll('.card')];
const type = document.querySelector('#type'), subset = document.querySelector('#subset'), search = document.querySelector('#search');
function filter() {
 const q = search.value.trim().toLocaleLowerCase('ru').replaceAll('ё','е');let shown=0;
 for (const c of cards) {
  const tags=c.dataset.sets.split(' ').filter(Boolean);
  const normal = !tags.includes('harder');
  const setFits = !subset.value || (subset.value==='normal' ? normal : tags.includes(subset.value));
  const fits=(!type.value || c.dataset.type===type.value) && setFits && (!q || c.dataset.search.includes(q));
  c.hidden=!fits;shown+=Number(fits);
 }
 document.querySelector('#count').textContent=`Показано ${shown} из ${cards.length} карт`;
 document.querySelector('#empty').hidden=shown!==0;
}
for(const e of [type,subset])e.addEventListener('change',filter);
search.addEventListener('input',filter);
document.querySelector('#visibility').addEventListener('click',function(){
 const hidden=document.body.classList.toggle('conditions-hidden');
 this.textContent=hidden?'Показать условия':'Скрыть условия';this.setAttribute('aria-pressed',String(hidden));
});
function followHash(){const target=cards.find(c=>c.id===decodeURIComponent(location.hash.slice(1)));if(!target)return;type.value='';subset.value='';search.value='';filter();target.scrollIntoView();}
window.addEventListener('hashchange',followHash);filter();if(location.hash)followHash();
"""


def html():
    styles = Styles()
    styles.feed((HERE.parent / 'index.html').read_text())
    assert styles.parts
    css = '\n'.join(styles.parts)
    css += """
.hero{background:#292321;border-bottom-color:#8b4e3f}.hero h1{max-width:850px}.hero-links a{min-height:44px}
.field p,.requirements li,.rules p{font-size:16px}.field h4,.requirements h4{font-size:12px}.filters input,.filters select{font-size:16px}.tag{font-size:12px}.replacement{font-size:13px;color:#606854;margin:16px 0 0}.caption{font-size:14px;max-width:850px}.notice{font-size:16px}.rules h3{font-size:16px;margin-bottom:4px}.rules p{margin-top:4px}.card{border-top-color:#805648}.outcomes .capture{border-left-color:#a25b4e}.outcomes .release{border-left-color:#61825d}
@media print{.replacement{font-size:10px}.field p{font-size:11px}.hero{background:white;color:#111}}
"""
    rules = ''.join('<h3>' + title + '</h3><p>' + escape(PACK['playerRules'][key]) + '</p>' for key, title in [
        ('selection', 'Как добавлять версии'), ('difficulty', 'Страх и сложность'),
        ('privacy', 'Личные карты'), ('outsideFiction', 'Вне роли'),
        ('physicalPlay', 'Исполнение'), ('continuity', 'Пленение и следующий раунд'), ('preparation', 'Подготовка')])
    rows = ''.join(f'<tr><td><a href="#{c["id"]}">{c["id"]}</a></td><td>{escape(c["title"])}</td><td><a href="../index.html#{c["baseCard"]}">{c["baseCard"]}</a></td><td>{escape(BASE_BY_ID[c["baseCard"]]["title"])}</td></tr>' for c in CARDS)
    return f'''<!doctype html><html lang="ru"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>За спиной — {TOTAL} страшных карт для «Помех»</title><style>{css}</style></head><body>
<header class="hero"><div class="eyebrow">ПОМЕХИ / СТРАШНЫЕ ВЕРСИИ / 03.11.2026</div>
<h1>За спиной.</h1><p>Ты смотришь на знакомого человека. Но он отвечает не своим голосом. А потом смотрит на пустое место у твоего плеча.</p>
<p class="caption">{COUNTS['possessed']} карт одержимых и {COUNTS['exorcist']} миссий экзорцистов. Все версии рассчитаны на тревогу и страх. Повышенная сложность отмечена отдельно: таких карт {HARDER}. Печатных материалов и бумажных подношений не требуется.</p>
<nav class="hero-links" aria-label="Материалы"><a href="cards.json" download>{TOTAL} страшных версий · JSON</a><a href="merged-selection.json" download>Колода с заменами · 147 карт</a><a href="../index.html">Основной каталог</a><a href="#replacements">Какие карты заменены</a></nav></header>
<main><div class="intro"><p class="notice">Авторское дополнение к адаптации оригинальных правил «Одержимых» с компьютерным Мастером. Выбранная страшная версия заменяет исходную карту. Это каталог для подготовки: в приложение набор пока не внедрён, живой игровой тест не проводился.</p>
<details class="rules"><summary>Исполнение, контакт и подбор колоды</summary>{rules}</details></div>
<section class="toolbar" aria-label="Фильтры"><div class="filters">
<label for="type">Колода<select id="type"><option value="">Все {TOTAL} версий</option><option value="possessed">Одержимые · {COUNTS['possessed']}</option><option value="exorcist">Миссии экзорцистов · {COUNTS['exorcist']}</option></select></label>
<label for="subset">Условия<select id="subset"><option value="">Все условия</option><option value="normal">Обычная сложность · {TOTAL-HARDER}</option><option value="harder">Повышенная сложность · {HARDER}</option><option value="contact">Физический контакт</option><option value="indoor">Помещение</option><option value="outdoor">Улица</option></select></label>
<label for="search">Поиск<input id="search" type="search" placeholder="Название, действие или ID" autocomplete="off"></label>
<button id="visibility" type="button" aria-pressed="false">Скрыть условия</button></div><p class="status" id="count" role="status" aria-live="polite">Показано {TOTAL} из {TOTAL} карт</p></section>
<div class="grid">{''.join(card(c) for c in CARDS)}</div><p class="empty" id="empty" hidden>Таких карт нет. Измените поиск или фильтр.</p>
<section class="supplement" id="replacements"><h2>Одна версия вместо одной карты</h2><p>Можно выбрать часть страшных версий. Для каждой уберите её исходную карту перед раздачей. В готовой копии на 147 карт выбраны все {TOTAL} замен; при сборке исходные файлы не перезаписываются.</p><div class="scroll" tabindex="0" role="region" aria-label="Таблица замен"><table><thead><tr><th>Версия</th><th>Название</th><th>Вместо</th><th>Исходная карта</th></tr></thead><tbody>{rows}</tbody></table></div></section>
<footer class="footer">Подсказок нет. Испуг не требуется изображать ради зачёта: там, где он является целью, его подтверждает сам участник. Новых прорицаний, испытаний Мастера или правил ритуала в дополнении нет. Редакционная проверка: <a href="editorial-review.json">JSON</a>. Проверка структуры: <a href="validation.json">JSON</a>.</footer></main><script>{SCRIPT}</script></body></html>'''


def main():
    validate()
    merged = selection()
    write_json('merged-selection.json', merged)
    (HERE / 'index.html').write_text(html())
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
        'styleSourceSha256': hashlib.sha256((HERE.parent / 'index.html').read_bytes()).hexdigest(),
        'limits': ['Editorial checks cannot establish actual fear, discoverability or game balance.',
                   'This is authored content, not runtime integration or a current-game import.'],
    })
    print(f"PASS {TOTAL} paper-free horror revisions; {COUNTS['possessed']} possessed / {COUNTS['exorcist']} exorcist; {HARDER} harder; detached selection remains 147 cards.")


if __name__ == '__main__':
    main()
