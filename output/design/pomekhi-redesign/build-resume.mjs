import fs from 'node:fs';

const dir = new URL('./', import.meta.url);
const read = name => fs.readFileSync(new URL(name, dir), 'utf8');
const state = JSON.parse(read('figma-state.json'));
const hosts = JSON.parse(read('host-screens.json'));
const phones = JSON.parse(read('phone-screens.json'));
const coverage = JSON.parse(read('state-coverage.json'));
const audit = JSON.parse(read('card-audit.json'));
const links = JSON.parse(read('prototype-links.json'));
const helper = read('figma-helpers.js.txt').replace('DESIGN_STATE', JSON.stringify(state.design));
const builders = read('screen-builders.js.txt');
const remaining = phones.filter(s=>!state.nodes[s.id]);
const header = '// Pending Figma construction. Execute inside use_figma for the existing file, then inspect and persist its returned ledger.\n';
const resume = header + helper + '\nconst QR_SVG='+JSON.stringify(read('invitation-demo.svg'))+';\n' + builders + `
Object.assign(nodes,${JSON.stringify(state.nodes)});
Object.assign(actions,${JSON.stringify(state.actions)});
const phoneSpecs=${JSON.stringify(phones)};
for(const s of ${JSON.stringify(remaining)}) {
 const existing=page.children.find(n=>n.name.startsWith(s.id+' · '));
 if(existing) {nodes[s.id]=existing.id;continue;}
 await phone(s,phoneSpecs.findIndex(x=>x.id===s.id));
}
const adaptive=[
 {...${JSON.stringify(phones.find(s=>s.id==='P14'))},id:'A01',width:320},
 {...${JSON.stringify(phones.find(s=>s.id==='P14'))},id:'A02',width:430},
 {...${JSON.stringify(phones.find(s=>s.id==='P15'))},id:'A03',width:320},
 {...${JSON.stringify(phones.find(s=>s.id==='P15'))},id:'A04',width:430}
];
for(const [i,s]of adaptive.entries())if(!page.children.some(n=>n.name.startsWith(s.id+' · ')))await phone(s,phoneSpecs.length+i);
for(const [i,origin]of ['H11','X01','H10'].entries()){
 const source=${JSON.stringify(hosts)}.find(s=>s.id===origin);
 const s={...source,id:'A0'+(i+5),width:1366,height:768,...(i===2?{players:12}:{} )};
 if(!page.children.some(n=>n.name.startsWith(s.id+' · ')))await host(s,${hosts.length}+i);
}
for(const id of ['H03','H11','X01']) {
 const frame=await figma.getNodeByIdAsync(nodes[id]);const board=frame?.findOne(n=>n.name==='Shared ritual');
 if(!board)continue;
 const ts=board.findAll(n=>n.type==='TEXT');
 for(const t of ts){await Promise.all(t.getStyledTextSegments(['fontName']).map(s=>figma.loadFontAsync(s.fontName)));if(t.characters==='24')t.characters='28';}
 const amounts=ts.filter(t=>t.characters.startsWith('◉ '));for(const [i,t]of amounts.entries())t.characters='◉ '+['7','2','3'][i];
}
const extra=await figma.getNodeByIdAsync(nodes.A07);
if(extra)for(const row of extra.findAll(n=>n.type==='INSTANCE'&&n.name.includes('Player row'))){row.paddingTop=row.paddingBottom=4;row.itemSpacing=0;for(const t of row.findAll(n=>n.type==='TEXT')){await Promise.all(t.getStyledTextSegments(['fontName']).map(s=>figma.loadFontAsync(s.fontName)));t.fontSize=12;t.lineHeight={unit:'PIXELS',value:16};t.maxLines=1;t.textTruncation='ENDING';}}
const allLinks=${JSON.stringify(links)};
let connectionCount=0;
for(const [id,frameId]of Object.entries(nodes)){
 const frame=await figma.getNodeByIdAsync(frameId);if(!frame)continue;
 const mobile=id.startsWith('P')||['A01','A02','A03','A04'].includes(id);
 const selected=actions[id]??{};
 async function link(action,target){if(!selected[action]||!nodes[target])return;const n=await figma.getNodeByIdAsync(selected[action]);if(n){await connect(n,nodes[target]);created.push(n.id);connectionCount++;}}
 await link('room',mobile?'PX04':'H06');await link('settings',mobile?'P31':'H08');await link('help',mobile?'PX05':'X06');
 await link('ritual','X07');await link('replace','X08');await link('sound','X04');await link('openBank','E02');await link('new','E06');
 const target=allLinks[id];if(target){await link('primary',target);await link('submit',target);}
 await link('reveal',id==='P11'?'P07':id==='P33'?'P30':'P07');await link('hide','P06');await link('withdraw','PX08');await link('leave','PX09');
 if(selected.close){const n=await figma.getNodeByIdAsync(selected.close);await n.setReactionsAsync([{trigger:{type:'ON_CLICK'},actions:[{type:'BACK'}]}]);created.push(n.id);connectionCount++;}
 if(selected.fullscreen){const n=await figma.getNodeByIdAsync(selected.fullscreen);await n.setReactionsAsync([{trigger:{type:'ON_CLICK'},actions:[{type:'NODE',destinationId:frameId,navigation:'NAVIGATE',transition:null}]}]);created.push(n.id);}
 for(const who of ['Никита','Оля','Саша'])await link(who,'PX02');
 for(const card of ['p01','p02','p03','p04'])await link(card,'E04');
 if(mobile){await link('secondary',['P14','P17','P18','P30','P24'].includes(id)?'PX01':['P15','P16'].includes(id)?'P40':id==='PX08'?'P30':id==='PX09'?'PX04':'P30');}
 else await link('secondary',id==='X01'||id==='H23'?'X02':id==='H14'?'X09':id==='H17'?'H15':id==='H19'||id==='H22'?'H20':'H11');
}
for(const id of ['H12','X02']){
 const frame=await figma.getNodeByIdAsync(nodes[id]);const to=id==='H12'?'X01':'H14';
 await frame.setReactionsAsync([{trigger:{type:'AFTER_TIMEOUT',timeout:8},actions:[{type:'NODE',destinationId:nodes[to],navigation:'NAVIGATE',transition:null}]}]);created.push(frame.id);
}
page.flowStartingPoints=[{nodeId:nodes.H03,name:'Organizer · first session'},{nodeId:nodes.P03,name:'Player · possessed'},{nodeId:nodes.P08,name:'Player · exorcist'},{nodeId:nodes.G03,name:'Recovery'},{nodeId:nodes.E01,name:'Catalog editor'}];
figma.viewport.scrollAndZoomIntoView([await figma.getNodeByIdAsync(nodes.X01)]);
return {nodes,actions,connectionCount,created,remainingReview:['Validate every flow in Safari','Confirm adaptive containment and long content','Replace same-frame fullscreen simulation with documented browser acceptance','Persist the returned IDs into figma-state.json']};
`;
fs.writeFileSync(new URL('resume-figma.js.txt',dir),resume);

const research=header+helper+`
const page=await figma.getNodeByIdAsync(D.pages.research);await figma.setCurrentPageAsync(page);
const summary=box('Research / design decisions',1400,1120,'canvas','VERTICAL',48,24);page.appendChild(summary);summary.x=80;summary.y=80;
await sectionTitle(summary,'POMEKHI / UX REDESIGN','One room. One clear next action.','Design proposal · 2026-11-02 · source b66f871');
for(const [a,b]of [
 ['01 / Persistent room','Merge host control and shared display. Keep participants, phase, timer and next action visible.'],
 ['02 / Private task','Publish initial roles; keep card content and live captured/released status private.'],
 ['03 / Learn by phase','Separate settings from help. Explain primary rescue, optional mission and shared ritual with examples.'],
 ['04 / Honest confirmation','Show local-save, server-accepted, review-needed and rejected states. Seal results only after synchronization.'],
 ['05 / Focused editing','Catalog editing is a modal workflow. Retain drafts and preserve issued assignments.'],
 ['Reference / Jackbox','Host lobby and room-code entry: https://www.jackboxgames.com/how-to-play'],
 ['Reference / AirConsole','Personalized contextual phone controls: https://documentation.airconsole.com/smartphones-as-controllers'],
 ['Reference / Hantise','Public preparation groups, privately read tasks. GRRRE Games rules; do not copy commercial tasks.']
])await rule(summary,a,b);
const flows=box('Scenario paths',1400,720,'surface','VERTICAL',40,24);page.appendChild(flows);flows.x=1560;flows.y=80;
for(const [a,b]of [['Organizer','Authorize → Create → Invite → Configure → Deal → Reading → Start → Placement → Search → Return → Sync → Review → Confirm → Ritual → Next deal'],['Possessed','Join → Concealed card → Read → Ready → Position → Behavior → Infection or group release → Return → Result'],['Exorcist','Join → Read → Ready → Wait → Search/rescue → Optional mission → Return → Provisional result'],['Recovery','Disconnect → Keep private card → Save provisional action → Reconnect identity → Send journal → Receipt or explicit review'],['Editor','Settings → Explicitly open bank → Filter → Open card → Edit → Validate → Save; stale version preserves draft']])await rule(flows,a,b);
const items=${JSON.stringify(coverage.map(r=>({id:r.id,original:r.original,decision:r.decision,target:r.target})))};
for(let i=0;i<items.length;i+=26){const b=box('State coverage / '+(i+1)+'–'+Math.min(i+26,items.length),1400,1900,'surface','VERTICAL',32,12);page.appendChild(b);b.x=80+(i/26)*1480;b.y=1320;await text(b,'104-state coverage / part '+(i/26+1),'Heading');for(const r of items.slice(i,i+26))await text(b,r.id+' → '+r.target+' · '+r.decision+'\\n'+r.original,'Small','text');}
const decisions=${JSON.stringify(audit.cards.map(c=>({id:c.id,title:c.final.title,decision:c.decision,rationale:c.rationale})))};
for(let i=0;i<decisions.length;i+=15){const b=box('Card audit / '+(i+1)+'–'+Math.min(i+15,decisions.length),1400,2000,'surface','VERTICAL',32,16);page.appendChild(b);b.x=80+(i/15%3)*1480;b.y=3400+Math.floor(i/45)*2140;await text(b,'Card audit / '+(i+1)+'–'+Math.min(i+15,decisions.length),'Heading');for(const c of decisions.slice(i,i+15)){await text(b,c.id+' · '+c.title+' · '+c.decision,'Label','amber');await text(b,c.rationale,'Small','muted');}}
return {created,boardCount:page.children.length};
`;
fs.writeFileSync(new URL('research-figma.js.txt',dir),research);
const AsyncFunction = Object.getPrototypeOf(async function(){}).constructor;
new AsyncFunction(resume);
new AsyncFunction(research);
console.log(JSON.stringify({pendingNativeScreens:remaining.length,screenScriptBytes:resume.length,researchScriptBytes:research.length,syntax:'PASS'}));
