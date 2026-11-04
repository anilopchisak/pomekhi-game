"""Build the design handoff and full legacy-state disposition table."""
import csv,json,re
from pathlib import Path
p=Path(__file__).parent;old=p.parent/'pomekhi-redesign';reg=json.loads((old/'figma-state.json').read_text());R=json.loads((p/'registry.json').read_text());known={}
for f in old.glob('*.json'):
 if f.stat().st_size>2_000_000:continue
 try:d=json.loads(f.read_text())
 except (ValueError,UnicodeDecodeError):continue
 if isinstance(d,dict):d=d.get('screens',[])
 if isinstance(d,list):
  for x in d:
   if isinstance(x,dict)and'id'in x and'title'in x:known[x['id']]=x
mapping={}
def many(prefix,targets,start=1):
 for i,t in enumerate(targets,start):mapping[prefix+str(i).zfill(2)]=t
many('H',['L30','L31','L02','L03','M01','L04','M01','M02','M02','L04','L07','L08','L20','L10','M25','L26','L12','M04','L16','L39','L19','L17','L01','L39','L14'])
many('P',['P03','P04','P03','P05','P06','P07','P09','P08','P11','P07','P41','P14','P13','P02','P01','P20','P15','P16','P45','P18','P28','P34','P33','P24','P17','P29','P26','P27','P51','P01','M07P','P25','P07','P36','P39','P51','P49','P46','P35','P54'])
many('X',['L01','L09','A08','M07','L19','M03','M04','M05','M26','M06','L35','L39','L14','L19','L09','L19','M08','L23','M16','M18','M14','L39','L07','L07'])
many('E',['M18','M18','M19','M18','M20','M18','M19','M20','M16','M18','M17'])
many('PX',['P21','M12','P22','M01P','M03P','P47','M11','M09','M10','P54','P20','M27','M27','P36','P10','P07','P40','P53','P40','P50','P29'])
mapping.update({'G02':'L21','G03':'L21','G04':'L20','G05':'L23','G06':'L25','G08':'L22','G09':'L36','G10':'L20','H11R':'L07R00','X12L':'L17','P09C':'P12','PX15C':'P52','L01':'P09W320'})
many('A',['P01W320','P01W430','P02W320','P09W320','L01W1440','L01','L01'])
mapping.update({'PXT02':'M12O','PXT03':'P21','PXC01':'P21','PXC02':'M12','PXC03':'M12O','PXC04':'P21','PXC10':'P54'})
for i in range(1,6):mapping['PXS0'+str(i)]='M27'
removed={'H09':'Arbitrary/endless party configuration is removed; the target keeps seven rounds.','H16':'The separate tutorial round is replaced by seven-round first-game trial suppression.','H20':'Post-outcome freeplay cannot revise a finished target party.','H25':'An extra scored round is removed; only the next of seven rounds remains.','X13':'Global reshuffling is removed; retained assignments and groups persist.','X14':'A discretionary score-free round cancellation is removed; technical stop remains distinct.','X15':'Manual public countdown/finish control is replaced by the computer recall.','X18':'Destructive saved-party reset is outside this design scope. Recovery remains explicit.','X20':'Replacing the bank implicitly is removed; use explicit import and preserved drafts.','X22':'Free continuation is removed from the original-rules party.','X23':'Issued assignments cannot be reset with a global redeal.','X24':'Starting before everyone is ready is removed.'}
rows=[]
for key,native in reg['nodes'].items():
 if key not in mapping:raise ValueError('Unmapped legacy state '+key)
 target=mapping[key]
 if target not in R['nodes']:raise ValueError('Missing new target '+target)
 reason=removed.get(key,'Reworked for the target rules, purple system and stable private/public information boundary.')
 if key.startswith(('PXT','PXC')):reason='Capture is a physical report; only eligible active exorcists can be selected, with a current-target confirmation.'
 if key.startswith('PXS'):reason='Self-capture reports retain causal group attribution and never create extra release credit.'
 if key in ['P09C','PX15C','PX17','PX18','PX19']:reason='Concealment preserves assignment, role and readiness; the toggle stays outside task scrolling.'
 rows.append(dict(source_id=key,source_title=known.get(key,{}).get('title',key+' supporting variant'),source_node=native,decision='remove-and-replace' if key in removed else 'rework-or-merge',target_id=target,target_node=R['nodes'][target],reason=reason))
(p/'state-coverage.json').write_text(json.dumps(rows,ensure_ascii=False,indent=2)+'\n')
with (p/'state-coverage.csv').open('w')as f:
 writer=csv.DictWriter(f,fieldnames=rows[0]);writer.writeheader();writer.writerows(rows)
cards=json.loads((old/'cards-proposed.json').read_text());cards.update(status='design-reference-not-imported',source='Authored Pomekhi proposals, not the commercial Oderzhimye deck',original_deck_verified=False);cards['notes']=['Preserve all 90 identifiers. No runtime import performed.','The prototype uses authored specimens p03 and e06, visibly identified.','Original missions, stories, prophecies and trial adaptations require source-by-source verification.']
(p/'cards-reference.json').write_text(json.dumps(cards,ensure_ascii=False,indent=2)+'\n')
scenes=json.loads((p/'screens.json').read_text());copy=[{k:s.get(k)for k in ['id','kind','title','body','primary','secondary']}for s in scenes];(p/'interface-copy.json').write_text(json.dumps(copy,ensure_ascii=False,indent=2)+'\n')
print('Mapped',len(rows),'source screens; preserved',len(cards['cards']),'authored card IDs')
