import json
from pathlib import Path
p=Path(__file__).parent;r={'nodes':{},'actions':{}}
for file in ['etalon','hosts','phones','modals','extras','motion']:
 d=json.loads((p/(file+'-result.json')).read_text())
 if not d.get('ok'):raise ValueError(file)
 for k in r:r[k].update(d['result'].get(k,{}))
for x in json.loads((p/'audit-first.json').read_text())['result']['frames']:r['nodes'][x['key']]=x['id']
(p/'registry.json').write_text(json.dumps(r,ensure_ascii=False,indent=2)+'\n');print(len(r['nodes']))
