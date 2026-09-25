/* TTS Deck Forge — browser-only application */
const $ = (s) => document.querySelector(s);
const $$ = (s) => [...document.querySelectorAll(s)];
const els = {
  input: $('#deckInput'), resolve: $('#resolveBtn'), demo: $('#demoBtn'), name: $('#deckName'),
  paste: $('#pasteBtn'), clear: $('#clearBtn'), deckFile: $('#deckFile'),
  format: $('#deckFormat'), provider: $('#provider'), fallback: $('#fallback'), backMode: $('#backMode'), customBackField: $('#customBackField'), back: $('#backUrl'), backPreview: $('#backPreview'),
  backStatus: $('#backStatus'), backHelp: $('#backHelp'), manualTokens: $('#manualTokens'), includeSide: $('#includeSide'),
  includeMaybe: $('#includeMaybe'), retest: $('#retestBtn'), fresh: $('#freshBtn'), metrics: $('#metrics'),
  pill: $('#validationPill'), progress: $('#progressBar'), progressText: $('#progressText'), grid: $('#cardGrid'),
  log: $('#logView'), stats: $('#statsView'), errorsView: $('#errorsView'), topCount: $('#topCount'), parseSummary: $('#parseSummary'), exportState: $('#exportState'),
  exportReason: $('#exportReason'), jsonBtn: $('#jsonBtn'), pngBtn: $('#pngBtn'), zipBtn: $('#zipBtn'),
  folderBtn: $('#folderBtn'), selectFolderBtn: $('#selectFolderBtn'), folderStatus: $('#folderStatus'), jsonViewBtn: $('#jsonViewBtn'), thumbUpload: $('#thumbUpload'),
  detail: $('#detailDialog'), detailContent: $('#detailContent'), jsonDialog: $('#jsonDialog'), jsonCode: $('#jsonCode'),
  toast: $('#toast')
};

const state = {
  parsed: [], cards: [], tokens: [], unresolved: [], logs: [], activeTab: 'deck', busy: false,
  backOk: false, backTested: false, backTesting: false, customBackUrl: '', validated: false, session: '', customThumb: null, generated: null,
  fetchCache: new Map(), imageCache: new Map(), errors: [], warnings: [], exact: 0, fallback: 0
};

const DEMO = `Commander
1x Omnath, Locus of Mana (CMM) 680

Mainboard
1x Sol Ring (CMM) 703
1x Beast Within (SLD) 323
1x Arcane Signet
1x Emerald Medallion
1x Nature's Lore
1x Three Visits
1x Cultivate
1x Kodama's Reach
1x Skyshroud Claim
1x Harrow
1x Bala Ged Recovery // Bala Ged Sanctuary
1x Heroic Intervention
1x Beast Whisperer
1x Guardian Project
1x Greater Good
1x The Great Henge
1x Return of the Wildspeaker
1x Rishkar's Expertise
1x Up the Beanstalk
1x Mystic Forge
1x Endless Atlas
1x Kozilek, Butcher of Truth
1x Kozilek, the Great Distortion
1x Ulamog, the Ceaseless Hunger
1x Ulamog, the Infinite Gyre
1x Zhulodok, Void Gorger
1x Void Winnower
1x Artisan of Kozilek
1x Pathrazer of Ulamog
1x It That Betrays
1x Desolation Twin
1x Triplicate Titan
1x Cityscape Leveler
1x Stonecoil Serpent
1x Walking Ballista
1x Hangarback Walker
1x Steel Hellkite
1x Wurmcoil Engine
1x Meteor Golem
1x Liberator, Urza's Battlethopter
1x Forsaken Monument
1x Lithoform Engine
1x Unwinding Clock
1x Eye of Ugin
1x Sanctum of Ugin
1x Shrine of the Forsaken Gods
1x War Room
1x Myriad Landscape
1x Blighted Woodland
1x Bonders' Enclave
1x Rogue's Passage
1x Reliquary Tower
1x Homeward Path
1x Mosswort Bridge
1x Oran-Rief, the Vastwood
1x Yavimaya, Cradle of Growth
1x Boseiju, Who Endures
1x Nykthos, Shrine to Nyx
1x Castle Garenbrig
1x Ancient Tomb
1x Temple of the False God
1x Scavenger Grounds
1x Karn's Bastion
36x Forest`;

const HEADERS = new Map([
  ['commander','commander'],['commanders','commander'],['command zone','commander'],['background','commander'],['mainboard','deck'],['deck','deck'],
  ['oathbreaker','oathbreaker'],['oathbreakers','oathbreaker'],['signature spell','signature'],['signature spells','signature'],
  ['sideboard','sideboard'],['tokens','tokens'],['token','tokens'],['maybeboard','maybeboard']
]);

const STANDARD_CARD_BACK='https://steamusercontent-a.akamaihd.net/ugc/1647720103762682461/35EF6E87970E2A5D6581E7D96A99F8A575B7A15F/';

function esc(v='') { return String(v).replace(/[&<>'"]/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;',"'":'&#39;','"':'&quot;'}[c])); }
function normalizeName(v='') { return v.toLowerCase().replace(/[’']/g,"'").replace(/\s+/g,' ').trim(); }
function displayName(card) { return card?.name || card?.card_faces?.map(f=>f.name).join(' // ') || 'Unknown card'; }
function imgSource(card, face=0) { return card?.card_faces?.[face]?.image_uris?.normal || card?.image_uris?.normal || ''; }
function addLog(message, type='info') { state.logs.push({time:new Date().toLocaleTimeString(),message,type}); if (state.activeTab==='log') renderLog(); }
function toast(message) { els.toast.textContent=message; els.toast.classList.add('show'); clearTimeout(toast.timer); toast.timer=setTimeout(()=>els.toast.classList.remove('show'),2600); }
function sleep(ms){return new Promise(r=>setTimeout(r,ms));}
function safeFilename(v) { return (v || 'Commander Deck').replace(/[\\/:*?"<>|]/g,'-').trim() || 'Commander Deck'; }
function guid(){let v='';do{v=Math.random().toString(16).slice(2,8).padEnd(6,'0')}while(state._guids?.has(v));(state._guids ||= new Set()).add(v);return v;}

const SUPPORTED_FORMATS=new Set(['commander','oathbreaker','oathbreaker100','constructed','standard','pioneer','modern','legacy','vintage','pauper']);
function selectedFormat(){return els.format.value;}
function isCommander(){return selectedFormat()==='commander';}
function isOathbreaker(){return selectedFormat()==='oathbreaker'||selectedFormat()==='oathbreaker100';}
function oathbreakerDeckSize(){return selectedFormat()==='oathbreaker100'?100:60;}
function inferFormat(text,format=''){
  const value=String(format||'').toLowerCase().replace(/[^a-z0-9]/g,'');
  if(SUPPORTED_FORMATS.has(value)&&value!=='constructed'&&value!=='oathbreaker')return value;
  if(value==='oathbreaker'||/^\s*(oathbreakers?|signature spells?)\s*:?\s*$/im.test(text)){
    const total=parseDecklist(text).entries.filter(e=>['deck','oathbreaker','commander','signature'].includes(e.section)).reduce((n,e)=>n+e.qty,0);
    return total===100?'oathbreaker100':'oathbreaker';
  }
  return /^\s*(commander|commanders|command zone)\s*:?\s*$/im.test(text)?'commander':'constructed';
}
let deckUrlTimer, deckUrlGeneration=0;
function deckUrlFromText(text){
  const raw=String(text||'').trim();
  if(!raw||/\s/.test(raw))return null;
  const candidate=/^(?:www\.)?(?:moxfield\.com|archidekt\.com)\//i.test(raw)?`https://${raw}`:raw;
  try{
    const url=new URL(candidate), host=url.hostname.toLowerCase().replace(/^www\./,'');
    if(url.protocol!=='https:')return null;
    if(host==='moxfield.com'&&/^\/decks\/[A-Za-z0-9_-]+(?:\/|$)/i.test(url.pathname))return url.href;
    if(host==='archidekt.com'&&/^\/decks\/\d+(?:\/|$)/i.test(url.pathname))return url.href;
  }catch{}
  return null;
}
function looksLikeDeckUrl(text){return /^\s*(?:https?:\/\/|www\.|(?:moxfield|archidekt)\.com\/)/i.test(String(text||''))&&!/\s/.test(String(text||'').trim());}
function cancelDeckUrlImport(){clearTimeout(deckUrlTimer);deckUrlGeneration++;els.resolve.disabled=false;}
function setDeckSource(text,name='',format=''){
  cancelDeckUrlImport();
  els.input.value=String(text||'').replace(/\r\n/g,'\n').trim();
  if(name)els.name.value=String(name).trim().slice(0,120);
  els.format.value=inferFormat(els.input.value,format);
  els.includeSide.checked=!isCommander()&&!isOathbreaker()&&/^\s*sideboard\s*:?\s*$/im.test(els.input.value);
  resetResolution();updateParsePreview();
}

function importedCardLine(entry,fallbackName=''){
  const card=entry?.card||entry||{};const quantity=Number(entry?.quantity??entry?.qty??card.quantity??1)||1;
  const name=card.name||card.cardName||card.displayName||card.oracleCard?.name||card.oracle_card?.name||fallbackName;if(!name)return '';
  const set=card.set||card.setCode||card.edition?.editioncode||card.edition?.editionCode||'';const collector=card.cn||card.collectorNumber||card.collector_number||'';
  return `${quantity}x ${name}${set&&collector?` (${String(set).toUpperCase()}) ${collector}`:''}`;
}

function boardLines(board){if(Array.isArray(board))return board.map(entry=>importedCardLine(entry)).filter(Boolean);return Object.entries(board?.cards||board||{}).map(([name,entry])=>importedCardLine(entry,name)).filter(Boolean);}
function sectionsToText(zones){return [['Oathbreaker',zones.oathbreaker],['Signature Spell',zones.signature],['Commander',zones.commander],['Mainboard',zones.deck],['Sideboard',zones.sideboard],['Maybeboard',zones.maybeboard]].filter(([,lines])=>lines?.length).map(([label,lines])=>`${label}\n${lines.join('\n')}`).join('\n\n');}
function archidektJsonToDecklist(data){
  const categoryState=new Map((data.categories||[]).map(category=>[category.name,category.includedInDeck!==false]));const zones={oathbreaker:[],signature:[],commander:[],deck:[],sideboard:[],maybeboard:[]};
  const format=typeof data.format==='string'?data.format:data.format?.name||'';
  for(const entry of data.cards||[]){const categories=entry.categories||[];const joined=categories.join(' ');let zone=/signature spell/i.test(joined)?'signature':/oathbreaker/i.test(joined)?'oathbreaker':/commander|command zone/i.test(joined)?(/oathbreaker/i.test(format)?'oathbreaker':'commander'):/sideboard/i.test(joined)?'sideboard':/maybeboard|considering/i.test(joined)?'maybeboard':'deck';if(zone==='deck'&&categories.length&&categoryState.size&&!categories.some(name=>categoryState.get(name)!==false))continue;const line=importedCardLine(entry);if(line)zones[zone].push(line);}
  return sectionsToText(zones);
}
function decklistFromJson(data){
  if(typeof data?.decklist==='string')return {text:data.decklist,name:data.name||'',format:data.format||''};
  if(Array.isArray(data?.cards)&&data.cards.some(entry=>entry?.card?.oracleCard||entry?.card?.oracle_card))return {text:archidektJsonToDecklist(data),name:data.name||'',format:typeof data.format==='string'?data.format:data.format?.name||''};
  const boards=data?.boards||data||{};const oath=/oathbreaker/i.test(String(data.format?.name||data.format||''));const zones={oathbreaker:boardLines(boards.oathbreakers||boards.oathbreaker||data.oathbreakers||(oath?boards.commanders||data.commanders:null)),signature:boardLines(boards.signatureSpells||boards.signatureSpell||data.signatureSpells||data.signatureSpell),commander:oath?[]:boardLines(boards.commanders||data.commanders),deck:boardLines(boards.mainboard||data.mainboard),sideboard:boardLines(boards.sideboard||data.sideboard),maybeboard:boardLines(boards.maybeboard||data.maybeboard)};const text=sectionsToText(zones);if(!text)throw new Error('No recognizable deck cards were found in this JSON file.');return {text,name:data.name||data.deckName||'',format:data.format||''};
}
function splitCsvRow(row){const cells=[];let cell='',quoted=false;for(let i=0;i<row.length;i++){const char=row[i];if(char==='"'&&row[i+1]==='"'){cell+='"';i++;}else if(char==='"')quoted=!quoted;else if(char===','&&!quoted){cells.push(cell.trim());cell='';}else cell+=char;}cells.push(cell.trim());return cells;}
function csvToDecklist(text){
  const rows=text.split(/\r?\n/).filter(row=>row.trim()).map(splitCsvRow);if(!rows.length)return '';const headers=rows[0].map(value=>value.toLowerCase().replace(/[^a-z0-9]/g,''));const q=headers.findIndex(value=>['quantity','qty','count'].includes(value));const n=headers.findIndex(value=>['name','card','cardname'].includes(value));const s=headers.findIndex(value=>['set','setcode','edition'].includes(value));const c=headers.findIndex(value=>['collector','collectornumber','cn'].includes(value));const start=q>=0&&n>=0?1:0;
  return rows.slice(start).map(row=>{const qty=row[q>=0?q:0]||1;const name=row[n>=0?n:1]||'';const set=s>=0?row[s]:'';const collector=c>=0?row[c]:'';return name?`${qty}x ${name}${set&&collector?` (${set.toUpperCase()}) ${collector}`:''}`:''}).filter(Boolean).join('\n');
}
async function importDeckFile(file){
  const raw=await file.text();let result={text:raw,name:file.name.replace(/\.[^.]+$/,'')};if(/\.json$/i.test(file.name)||/^\s*[\[{]/.test(raw))result=decklistFromJson(JSON.parse(raw));else if(/\.csv$/i.test(file.name)||/^\s*(quantity|qty|count)\s*,/i.test(raw))result={text:csvToDecklist(raw),name:result.name};if(!result.text.trim())throw new Error('The selected file did not contain a readable decklist.');setDeckSource(result.text,result.name,result.format);toast(`Loaded ${file.name}.`);
}
async function importDeckUrl(url){
  if(!url)return;
  const generation=++deckUrlGeneration;
  els.resolve.disabled=true;els.parseSummary.textContent='Importing deck from link…';
  try{
    const response=await fetch('/api/import-deck',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({url})});
    const data=await response.json().catch(()=>({}));
    if(generation!==deckUrlGeneration)return;
    if(!response.ok)throw new Error(data.error||`Import failed (${response.status}).`);
    setDeckSource(data.decklist,data.name,data.format);
    toast(`Imported ${data.source} deck. Format: ${els.format.selectedOptions[0].text}.`);
  }catch(error){if(generation===deckUrlGeneration){els.parseSummary.textContent=error.message||'The deck could not be imported.';toast(error.message||'The deck could not be imported.');}}
  finally{if(generation===deckUrlGeneration)els.resolve.disabled=false;}
}
function onDeckInput(event){
  clearTimeout(deckUrlTimer);deckUrlGeneration++;
  if(state.cards.length)resetResolution();
  const url=deckUrlFromText(els.input.value);
  els.resolve.disabled=Boolean(url)||looksLikeDeckUrl(els.input.value);
  if(url){
    els.parseSummary.textContent='Loading deck from link…';
    if(event?.inputType==='insertFromPaste'||event?.inputType==='insertFromDrop')return importDeckUrl(url);
    deckUrlTimer=setTimeout(()=>importDeckUrl(url),400);
  }
  else if(looksLikeDeckUrl(els.input.value))els.parseSummary.textContent='Paste a public Moxfield or Archidekt deck URL.';
  else updateParsePreview();
}

function parseDecklist(text) {
  let section='deck'; const out=[]; const ignored=[];
  text.split(/\r?\n/).forEach((raw, index) => {
    const line=raw.trim(); if(!line || /^\/\//.test(line) || /^#/.test(line)) return;
    const normalized=line.replace(/:$/,'').replace(/\s*\(\d+\)$/,'').toLowerCase();
    if(HEADERS.has(normalized)){section=HEADERS.get(normalized);return;}
    const m=line.match(/^\s*(\d+)\s*x?\s+(.+?)(?:\s+\(([A-Za-z0-9]+)\)\s+([^\s]+))?\s*$/i);
    if(!m){ignored.push({line:index+1,raw});return;}
    let name=m[2].trim(); let set=m[3]?.toLowerCase()||''; let collector=m[4]||'';
    // Avoid swallowing a printing suffix into the name when optional groups are skipped.
    const suffix=name.match(/^(.*?)\s+\(([A-Za-z0-9]+)\)\s+([^\s]+)$/);
    if(suffix){name=suffix[1].trim();set=suffix[2].toLowerCase();collector=suffix[3];}
    out.push({qty:Number(m[1]),name,set,collector,section,line:index+1,key:`${section}|${normalizeName(name)}|${set}|${collector}`});
  });
  return {entries:out,ignored};
}

function included(entry){if(entry.section==='sideboard')return els.includeSide.checked;if(entry.section==='maybeboard')return els.includeMaybe.checked;return entry.section!=='tokens';}

function updateParsePreview(){
  const {entries,ignored}=parseDecklist(els.input.value);const main=entries.filter(e=>isCommander()?(e.section==='commander'||(e.section!=='tokens'&&included(e))):isOathbreaker()?['deck','oathbreaker','commander','signature'].includes(e.section):e.section==='deck').reduce((n,e)=>n+e.qty,0);const side=entries.filter(e=>e.section==='sideboard').reduce((n,e)=>n+e.qty,0);
  els.parseSummary.textContent=entries.length?`${entries.length} lines · ${main} main deck cards${!isCommander()&&side?` · ${side} sideboard`:''}${ignored.length?` · ${ignored.length} unread`:''}`:'Paste a list to begin.';
}

async function scryfallCollection(identifiers){
  const results=[]; const missing=[];
  for(let i=0;i<identifiers.length;i+=75){
    const chunk=identifiers.slice(i,i+75); const response=await fetch('https://api.scryfall.com/cards/collection',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({identifiers:chunk.map(x=>x.id)})});
    if(!response.ok) throw new Error(`Scryfall collection request failed (${response.status})`);
    const data=await response.json(); results.push(...data.data); missing.push(...(data.not_found||[])); if(i+75<identifiers.length)await sleep(90);
  }
  return {results,missing};
}

async function resolveEntries(entries){
  const unique=[...new Map(entries.map(e=>[`${normalizeName(e.name)}|${e.set}|${e.collector}`,e])).values()];
  const requested=unique.map((entry,i)=>({entry,i,id:entry.set&&entry.collector?{set:entry.set,collector_number:entry.collector}:{name:entry.name}}));
  const {results,missing}=await scryfallCollection(requested);
  const exactMap=new Map();
  results.forEach(card=>{
    const key=card.set&&card.collector_number?`${card.set}|${card.collector_number}`:`name|${normalizeName(card.name)}`;
    exactMap.set(key,card);
    exactMap.set(`name|${normalizeName(card.name)}`,card);
  });
  const resolved=[]; const needsFallback=[];
  for(const req of requested){
    let card=req.entry.set?exactMap.get(`${req.entry.set}|${req.entry.collector}`):exactMap.get(`name|${normalizeName(req.entry.name)}`);
    const nameMatches=card && (normalizeName(card.name)===normalizeName(req.entry.name) || normalizeName(card.name.split(' // ')[0])===normalizeName(req.entry.name.split(' // ')[0]));
    if(card && nameMatches){resolved.push({lookup:req.entry,card,mode:req.entry.set?'exact':'name'});}
    else needsFallback.push(req.entry);
  }
  if(needsFallback.length && els.fallback.value==='auto'){
    const fb=await scryfallCollection(needsFallback.map((entry,i)=>({entry,i,id:{name:entry.name}})));
    const byName=new Map(fb.results.map(c=>[normalizeName(c.name),c]));
    needsFallback.forEach(entry=>{const card=byName.get(normalizeName(entry.name))||byName.get(normalizeName(entry.name.split(' // ')[0]));if(card)resolved.push({lookup:entry,card,mode:'fallback'});});
  }
  const map=new Map(resolved.map(r=>[`${normalizeName(r.lookup.name)}|${r.lookup.set}|${r.lookup.collector}`,r]));
  return entries.map(entry=>{
    const r=map.get(`${normalizeName(entry.name)}|${entry.set}|${entry.collector}`);
    return r?{...entry,...r,status:'resolved',imageStatus:'untested'}:{...entry,status:'unresolved',reason:entry.set?`Exact printing ${entry.set.toUpperCase()} ${entry.collector} was not found or the name did not match.`:'Card name was not found.'};
  });
}

async function fetchCardUri(uri){
  if(state.fetchCache.has(uri))return state.fetchCache.get(uri);
  const p=fetch(uri).then(r=>{if(!r.ok)throw new Error(`Card-part request failed (${r.status})`);return r.json()});state.fetchCache.set(uri,p);return p;
}

function tokenQueries(card){
  const text=[card.oracle_text,...(card.card_faces||[]).map(f=>f.oracle_text)].filter(Boolean).join(' '); const q=[];
  if(/3\/3 green Beast creature token/i.test(text))q.push('t:token name:"Beast" pow=3 tou=3');
  if(/Construct artifact creature token/i.test(text))q.push('t:token name:"Construct"');
  if(/0\/1 colorless Eldrazi Spawn/i.test(text))q.push('t:token name:"Eldrazi Spawn"');
  if(/1\/1 colorless Eldrazi Scion/i.test(text))q.push('t:token name:"Eldrazi Scion"');
  if(/Powerstone token/i.test(text))q.push('t:token name:"Powerstone"');
  if(/Treasure token/i.test(text))q.push('t:token name:"Treasure"');
  if(/Food token/i.test(text))q.push('t:token name:"Food"');
  if(/Clue token/i.test(text))q.push('t:token name:"Clue"');
  if(/create an emblem/i.test(text))q.push(`t:emblem name:"${card.name}"`);
  return q;
}

async function searchFirst(query){
  const url=`https://api.scryfall.com/cards/search?order=released&dir=desc&unique=cards&q=${encodeURIComponent(query)}`;
  try{const r=await fetch(url);if(!r.ok)return null;const d=await r.json();return d.data?.[0]||null}catch{return null}
}

async function resolveTokens(cards, explicit){
  const found=new Map(); const sources=new Map();
  const deckCardIds=new Set(cards.flatMap(entry=>[entry.card?.id,entry.card?.oracle_id]).filter(Boolean).map(String));
  const add=(card,source)=>{if(!card)return;const key=card.oracle_id||card.id;if(!found.has(key)){found.set(key,card);sources.set(key,new Set())}sources.get(key).add(source)};
  const uris=[];
  cards.forEach(entry=>{(entry.card?.all_parts||[]).filter(p=>['token','emblem','meld_result'].includes(p.component)).forEach(p=>uris.push({uri:p.uri,source:entry.card.name}));});
  for(let i=0;i<uris.length;i+=6){await Promise.all(uris.slice(i,i+6).map(async p=>{try{add(await fetchCardUri(p.uri),p.source)}catch(e){addLog(`${p.source}: ${e.message}`,'warn')}}));if(i+6<uris.length)await sleep(80);}
  const inferred=[]; cards.forEach(e=>tokenQueries(e.card||{}).forEach(q=>inferred.push({q,source:e.card.name})));
  for(const item of inferred){const card=await searchFirst(item.q);if(card)add(card,`${item.source} (rules-text inference)`);else addLog(`Token inference failed for ${item.source}: ${item.q}`,'warn');await sleep(55);}
  for(const name of explicit){const card=await searchFirst(`(t:token OR t:emblem) name:"${name.replace(/"/g,'')}"`);if(card)add(card,'Manual addition');else addLog(`Manual token not found: ${name}`,'error');await sleep(55);}
  return [...found].filter(([,card])=>!deckCardIds.has(String(card.id||''))&&!deckCardIds.has(String(card.oracle_id||''))).map(([key,card])=>({card,source:[...sources.get(key)].join(', '),qty:1,status:'resolved',mode:'token',imageStatus:'untested',name:card.name,section:'tokens'}));
}

function providerUrl(source,index=0){
  if(!source)return '';
  let url=source;
  if(els.provider.value==='alpowell')url=source.replace(/^https:\/\/cards\.scryfall\.io\//,'https://mtg-image-cache.alpowell81.workers.dev/');
  if(els.provider.value==='universal')url=`https://wsrv.nl?url=${encodeURIComponent(source)}`;
  if(els.provider.value==='tts')url=source.replace('cards.scryfall.io','img.klrmngr.com');
  if(state.session)url += `${url.includes('?')?'&':'?'}ttsdeckforge=${encodeURIComponent(state.session)}-${index}`;
  return url;
}

function facesFor(entry){
  if(!entry.card)return [];
  const raw=[]; const count=entry.card.card_faces?.length>1?entry.card.card_faces.length:1;
  for(let i=0;i<count;i++){const source=imgSource(entry.card,i);if(source)raw.push({source,face:i,url:providerUrl(source,i),label:i?'back':'front'});}
  return raw;
}

function loadImage(url){
  return new Promise(resolve=>{const img=new Image();let done=false;const finish=ok=>{if(done)return;done=true;clearTimeout(timer);resolve(ok)};const timer=setTimeout(()=>finish(false),15000);img.onload=()=>finish(img.naturalWidth>20&&img.naturalHeight>20);img.onerror=()=>finish(false);img.referrerPolicy='no-referrer';img.src=url;});
}

function fixDropboxCardBackLink(value){
  try{
    const url=new URL(value);
    if(['dropbox.com','www.dropbox.com'].includes(url.hostname.toLowerCase())&&url.searchParams.get('dl')==='0'){
      url.searchParams.set('dl','1');
      return url.href;
    }
  }catch{}
  return value;
}

function normalizedCardBackUrl(value=els.back.value.trim()){
  if(!value)return '';
  try{
    return new URL(fixDropboxCardBackLink(value)).href;
  }catch{return value}
}

function cardBackFailureHelp(){
  const value=els.back.value.trim();
  try{
    const host=new URL(value).hostname.toLowerCase();
    if(host==='dropbox.com'||host==='www.dropbox.com'||host==='dl.dropboxusercontent.com'){
      return 'Dropbox did not return a public image. Confirm the file is shared with anyone who has the link, then retest.';
    }
  }catch{}
  return 'The address did not return a loadable public image. Use a direct HTTPS link ending in an image file.';
}

async function runPreflight(){
  if(state.busy||!state.cards.length)return;state.busy=true;state.validated=false;setPill('working','Testing images');setProgress(5,'Testing card back');
  state.backTesting=true;state.backTested=false;renderBack();state.backOk=await loadImage(normalizedCardBackUrl());state.backTesting=false;state.backTested=true;renderBack();
  const entries=[...state.cards.filter(c=>c.status==='resolved'),...state.tokens]; const tests=[];
  entries.forEach(entry=>facesFor(entry).forEach(face=>tests.push({entry,face})));
  let complete=0;
  for(let i=0;i<tests.length;i+=8){
    await Promise.all(tests.slice(i,i+8).map(async t=>{const ok=await loadImage(t.face.url);t.entry.faceResults ||= {};t.entry.faceResults[t.face.face]={ok,url:t.face.url};complete++;setProgress(5+Math.round(90*complete/Math.max(1,tests.length)),`Testing ${complete} / ${tests.length} images`);}));
  }
  entries.forEach(e=>e.imageStatus=Object.values(e.faceResults||{}).every(x=>x.ok)?'ok':'failed');
  validateAll();state.busy=false;renderAll();
}

function countPhysical(list){return list.reduce((n,e)=>n+(included(e)?e.qty:0),0)}
function commanderEntries(){return state.cards.filter(c=>c.section==='commander'&&c.status==='resolved')}
function oathbreakerEntries(){return state.cards.filter(c=>['oathbreaker','commander'].includes(c.section)&&c.status==='resolved')}
function signatureEntries(){return state.cards.filter(c=>c.section==='signature'&&c.status==='resolved')}
function sideboardEntries(){return state.cards.filter(c=>c.section==='sideboard'&&c.status==='resolved')}
function maybeboardEntries(){return state.cards.filter(c=>c.section==='maybeboard'&&c.status==='resolved')}
function libraryEntries(){return state.cards.filter(c=>isCommander()?(['deck','sideboard','maybeboard'].includes(c.section)&&included(c)&&c.status==='resolved'):(c.section==='deck'&&c.status==='resolved'))}
function expectedLibrary(){return Math.max(0,100-commanderEntries().reduce((n,e)=>n+e.qty,0))}

function legalMultiplicity(entry){
  if(entry.qty<=1)return true; const c=entry.card;if(!c)return false;
  const supertypes=(c.type_line||'').split(/[—-]/,1)[0];
  if(/\bBasic\b/i.test(supertypes)&&/\bLand\b/i.test(supertypes))return true;
  return /A deck can have (any number|up to \w+|up to \d+) of cards named/i.test(c.oracle_text||'');
}

function maximumCopies(card){
  const supertype=(card.type_line||'').split(/[—-]/,1)[0];
  if(/\bBasic\b/i.test(supertype)&&/\bLand\b/i.test(supertype))return Infinity;
  const rule=card.oracle_text||'';
  if(/A deck can have any number of cards named/i.test(rule))return Infinity;
  const limit=rule.match(/A deck can have up to (\d+|one|two|three|four|five|six|seven|eight|nine|ten) cards named/i);
  const words={one:1,two:2,three:3,four:4,five:5,six:6,seven:7,eight:8,nine:9,ten:10};
  return limit?Number(limit[1])||words[limit[1].toLowerCase()]||4:4;
}

function oathbreakerErrors(entries){
  const errors=[];const leaders=entries.filter(e=>['oathbreaker','commander'].includes(e.section));const spells=entries.filter(e=>e.section==='signature');
  const main=entries.filter(e=>e.section==='deck');const total=[...leaders,...spells,...main].reduce((n,e)=>n+e.qty,0);
  const required=oathbreakerDeckSize();
  if(total!==required)errors.push(`Oathbreaker requires exactly ${required} cards including the Oathbreaker and Signature Spell; found ${total}.`);
  if(leaders.length<1||leaders.length>2||leaders.some(e=>e.qty!==1))errors.push('Use one Oathbreaker, or two partners, with one copy of each.');
  if(spells.length!==leaders.length||spells.some(e=>e.qty!==1))errors.push('Provide one Signature Spell for each Oathbreaker.');
  if(leaders.length===2&&leaders.some(e=>!/(?:^|\n)Partner(?:\s|\n|$)/i.test(e.card.oracle_text||'')))errors.push('Two Oathbreakers must both have Partner.');
  if(entries.some(e=>e.section==='sideboard'))errors.push('Oathbreaker has no sideboard.');
  leaders.forEach(e=>{if(!/\bPlaneswalker\b/i.test(e.card.card_faces?.[0]?.type_line||e.card.type_line||''))errors.push(`${e.card.name} must be a planeswalker to be an Oathbreaker.`)});
  spells.forEach(e=>{if(!/\b(Instant|Sorcery)\b/i.test(e.card.card_faces?.[0]?.type_line||e.card.type_line||''))errors.push(`${e.card.name} must be an instant or sorcery Signature Spell.`)});
  const identity=new Set(leaders.flatMap(e=>e.card.color_identity||[]));
  [...leaders,...spells,...main].forEach(e=>{
    if(!Array.isArray(e.card.color_identity))errors.push(`Could not verify color identity for ${e.card.name}.`);
    else if(e.card.color_identity.some(color=>!identity.has(color)))errors.push(`${e.card.name} is outside the Oathbreaker's color identity.`);
    const status=e.card.legalities?.oathbreaker;
    if(!status)errors.push(`Could not verify Oathbreaker legality for ${e.card.name}.`);
    else if(status!=='legal'&&status!=='restricted')errors.push(`${e.card.name} is ${status.replace('_',' ')} in Oathbreaker.`);
  });
  spells.forEach((spell,index)=>{if(leaders[index]&&Array.isArray(spell.card.color_identity)&&spell.card.color_identity.some(color=>!(leaders[index].card.color_identity||[]).includes(color)))errors.push(`${spell.card.name} is outside ${leaders[index].card.name}'s color identity.`)});
  const counts=new Map();[...leaders,...spells,...main].forEach(e=>{const name=normalizeName(e.card.name);counts.set(name,{card:e.card,qty:(counts.get(name)?.qty||0)+e.qty})});
  counts.forEach(({card,qty})=>{const basic=/\bBasic\b.*\bLand\b/i.test((card.type_line||'').split(/[—-]/,1)[0]);if(qty>1&&!basic)errors.push(`${card.name}: Oathbreaker allows one copy across all deck zones.`)});
  return errors;
}

function validateAll(){
  state.errors=[];state.warnings=[];
  const commanders=commanderEntries();const library=libraryEntries();const physical=commanders.reduce((n,e)=>n+e.qty,0)+library.reduce((n,e)=>n+e.qty,0);
  if(state.cards.some(c=>c.status==='unresolved'))state.errors.push(`${state.cards.filter(c=>c.status==='unresolved').length} card line(s) unresolved.`);
  if(isCommander()){
    if(state.cards.some(c=>['oathbreaker','signature'].includes(c.section)))state.errors.push('Oathbreaker and Signature Spell sections require Oathbreaker format.');
    if(!commanders.length)state.errors.push('No commander is identified. Use a Commander section header.');
    if(physical!==100)state.errors.push(`Physical deck count is ${physical}; Commander requires 100.`);
    if(library.reduce((n,e)=>n+e.qty,0)!==expectedLibrary())state.errors.push(`Library count does not match ${expectedLibrary()} for ${commanders.reduce((n,e)=>n+e.qty,0)} commander(s).`);
    state.cards.filter(c=>c.status==='resolved'&&!legalMultiplicity(c)).forEach(c=>state.errors.push(`Singleton violation: ${c.qty}× ${c.card.name}.`));
  }else if(isOathbreaker()){
    state.errors.push(...oathbreakerErrors(state.cards.filter(c=>c.status==='resolved')));
  }else{
    if(commanders.length)state.errors.push('This list has a Commander section. Select Commander format or move those cards into Mainboard.');
    if(state.cards.some(c=>['oathbreaker','signature'].includes(c.section)))state.errors.push('Oathbreaker and Signature Spell sections require Oathbreaker format.');
    if(physical<60)state.errors.push(`Main deck has ${physical} cards; ${els.format.selectedOptions[0].text} needs at least 60.`);
    const side=sideboardEntries().reduce((n,e)=>n+e.qty,0);
    if(side>15)state.errors.push(`Sideboard has ${side} cards; maximum is 15.`);
    const copies=new Map();
    state.cards.filter(c=>c.status==='resolved'&&['deck','sideboard'].includes(c.section)).forEach(entry=>{
      const key=entry.card.oracle_id||normalizeName(entry.card.name);const previous=copies.get(key);
      copies.set(key,{card:entry.card,qty:(previous?.qty||0)+entry.qty});
    });
    copies.forEach(({card,qty})=>{const max=maximumCopies(card);if(qty>max)state.errors.push(`${card.name}: ${qty} copies across main deck and sideboard; maximum is ${max}.`);});
    if(selectedFormat()!=='constructed')copies.forEach(({card,qty})=>{
      const status=card.legalities?.[selectedFormat()];
      if(!status)state.errors.push(`Could not verify ${selectedFormat()} legality for ${card.name}.`);
      else if(status==='restricted'&&qty>1)state.errors.push(`${card.name} is restricted to one copy in ${selectedFormat()}.`);
      else if(status!=='legal'&&status!=='restricted')state.errors.push(`${card.name} is ${status.replace('_',' ')} in ${selectedFormat()}.`);
    });
  }
  const failedCards=state.cards.filter(c=>c.status==='resolved'&&c.imageStatus==='failed');const failedTokens=state.tokens.filter(c=>c.imageStatus==='failed');
  if(failedCards.length)state.errors.push(`${failedCards.length} card printing(s) have failed images.`);
  if(failedTokens.length)state.errors.push(`${failedTokens.length} token/helper image(s) failed.`);
  if(!state.backOk)state.errors.push('Card back image failed or has not been tested.');
  const untested=[...state.cards.filter(c=>c.status==='resolved'),...state.tokens].filter(c=>c.imageStatus==='untested');if(untested.length)state.errors.push(`${untested.length} resolved item(s) have not been image-tested.`);
  const idReport=previewIdAllocation();if(idReport.conflicts.length)state.errors.push(`${idReport.conflicts.length} TTS ID conflict(s) detected.`);
  state.validated=state.errors.length===0;state.errors.forEach(e=>addLog(e,'error'));
  if(state.validated){addLog('Preflight passed. Export state locked to current resolved cards and image URLs.','ok');setPill('good','Validated');setProgress(100,'All checks passed');}
  else{setPill('bad',`${state.errors.length} blocking issue${state.errors.length===1?'':'s'}`);setProgress(100,'Preflight finished with errors');}
}

function previewIdAllocation(){
  const seen=new Map(),conflicts=[];let next=900001;
  [...state.cards.filter(c=>c.status==='resolved'&&included(c)),...state.tokens].forEach(e=>facesFor(e).forEach(f=>{const key=String(next++);if(seen.has(key)&&seen.get(key)!==f.url)conflicts.push(key);seen.set(key,f.url)}));return{definitions:seen.size,conflicts};
}

function setPill(cls,text){els.pill.className=`validation-pill ${cls}`;els.pill.querySelector('span').textContent=text;}
function setProgress(value,text){els.progress.style.width=`${value}%`;els.progressText.textContent=text;}

function metric(label,value,status=''){return `<div class="metric ${status}"><span>${esc(label)}</span><strong>${esc(value)}</strong></div>`}
function dashboardData(){
  const cmd=(isOathbreaker()?oathbreakerEntries():commanderEntries()).reduce((n,e)=>n+e.qty,0), sig=signatureEntries().reduce((n,e)=>n+e.qty,0), lib=libraryEntries().reduce((n,e)=>n+e.qty,0), side=sideboardEntries().reduce((n,e)=>n+e.qty,0), physical=cmd+lib+(isOathbreaker()?sig:0);
  const resolved=state.cards.filter(c=>c.status==='resolved').reduce((n,e)=>n+(included(e)?e.qty:0),0);
  const exact=state.cards.filter(c=>c.mode==='exact').reduce((n,e)=>n+e.qty,0);const fallback=state.cards.filter(c=>c.mode==='fallback').reduce((n,e)=>n+e.qty,0);
  const brokenFaces=state.cards.filter(c=>c.status==='resolved'&&c.imageStatus==='failed').reduce((n,e)=>n+facesFor(e).filter(f=>!e.faceResults?.[f.face]?.ok).length,0);
  const brokenTokens=state.tokens.filter(c=>c.imageStatus==='failed').length;const dfc=state.cards.filter(c=>facesFor(c).length>1).reduce((n,e)=>n+e.qty,0);const ids=previewIdAllocation();
  return {cmd,sig,lib,side,physical,resolved,exact,fallback,brokenFaces,brokenTokens,dfc,ids};
}

function renderMetrics(){const d=dashboardData(),commander=isCommander(),oath=isOathbreaker(),singleton=commander||oath;els.metrics.innerHTML=[metric('Library cards',d.lib,commander?(d.lib===expectedLibrary()?'good':'bad'):(oath?(d.lib===oathbreakerDeckSize()-d.cmd-d.sig?'good':'bad'):(d.lib>=60?'good':'bad'))),metric(commander?'Commander':oath?'Oathbreaker':'Sideboard',commander||oath?d.cmd:`${d.side} / 15`,singleton?(d.cmd?'good':'bad'):(d.side<=15?'good':'bad')),metric(oath?'Total cards':'Main deck',commander?`${d.physical} / 100`:oath?`${d.physical} / ${oathbreakerDeckSize()}`:`${d.lib} / 60+`,singleton?(d.physical===(oath?oathbreakerDeckSize():100)?'good':'bad'):(d.lib>=60?'good':'bad')),metric(oath?'Signature spell':'Tokens / helpers',oath?d.sig:state.tokens.length),metric('Resolved cards',d.resolved,d.resolved===state.cards.filter(c=>included(c)).reduce((n,e)=>n+e.qty,0)?'good':'bad'),metric('Exact printings',d.exact,'good'),metric('Fallback printings',d.fallback,d.fallback?'warn':''),metric('Broken face images',d.brokenFaces,d.brokenFaces?'bad':'good'),metric('Broken token images',d.brokenTokens,d.brokenTokens?'bad':'good'),metric('Broken card backs',state.backOk?0:1,state.backOk?'good':'bad'),metric('DFC states',d.dfc),metric('TTS ID conflicts',d.ids.conflicts.length,d.ids.conflicts.length?'bad':'good')].join('');els.topCount.innerHTML=`<strong>${singleton?d.physical:d.lib}</strong><span>${oath?'total cards':commander?'physical cards':'main deck cards'}</span>`;}

function renderBack(){
  const standard=els.backMode.value==='standard',label=standard?'Standard card back':'Custom card back',url=normalizedCardBackUrl();
  els.backPreview.src=url;
  if(state.backTesting){els.backStatus.textContent='Testing card back…';els.backStatus.style.color='var(--gold)';els.backHelp.textContent='Checking that the URL returns a public image.';}
  else if(state.backOk){els.backStatus.textContent=`${label} ready`;els.backStatus.style.color='var(--green)';els.backHelp.textContent=url!==els.back.value.trim()?'Dropbox share link converted to a direct image URL for preview and export.':'Validated independently from the Saved Object thumbnail.';}
  else if(state.backTested){els.backStatus.textContent=`${label} failed`;els.backStatus.style.color='var(--red)';els.backHelp.textContent=cardBackFailureHelp();}
  else{els.backStatus.textContent=`${label} not tested`;els.backStatus.style.color='var(--muted)';els.backHelp.textContent='Validated independently from the Saved Object thumbnail.';}
}
async function testCardBackOnly(){
  const url=normalizedCardBackUrl();state.backOk=false;state.backTested=false;
  if(!url){renderBack();return;}
  state.backTesting=true;renderBack();state.backOk=await loadImage(url);state.backTesting=false;state.backTested=true;renderBack();renderExport();
}
function changeCardBackMode(){
  if(els.backMode.value==='standard'){
    if(els.customBackField.hidden===false)state.customBackUrl=els.back.value.trim();
    els.customBackField.hidden=true;els.back.value=STANDARD_CARD_BACK;
  }else{
    els.customBackField.hidden=false;els.back.value=state.customBackUrl;setTimeout(()=>els.back.focus(),50);
  }
  state.backOk=false;state.backTested=false;state.validated=false;renderAll();
  if(els.back.value.trim()){if(state.cards.length)runPreflight();else testCardBackOnly();}
}
function visibleEntries(){if(state.activeTab==='deck')return libraryEntries();if(state.activeTab==='commander')return isOathbreaker()?oathbreakerEntries():commanderEntries();if(state.activeTab==='signature')return signatureEntries();if(state.activeTab==='sideboard')return sideboardEntries();if(state.activeTab==='tokens')return state.tokens;if(state.activeTab==='errors')return [...state.cards.filter(c=>c.status==='unresolved'||c.imageStatus==='failed'),...state.tokens.filter(c=>c.imageStatus==='failed')];return[];}
function statEntries(){return isCommander()?state.cards.filter(e=>e.status==='resolved'&&included(e)&&e.section!=='tokens'):isOathbreaker()?[...oathbreakerEntries(),...signatureEntries(),...libraryEntries()]:libraryEntries();}
function cardManaCost(card){return card.mana_cost||card.card_faces?.[0]?.mana_cost||'';}
function deckStats(){
  const entries=statEntries();let total=0,lands=0,nonlands=0,totalMana=0;const curve=Array(8).fill(0);
  const types={Creatures:0,Instants:0,Sorceries:0,Artifacts:0,Enchantments:0,Planeswalkers:0,Lands:0,Battles:0};
  const pips={W:0,U:0,B:0,R:0,G:0,C:0},sources={W:0,U:0,B:0,R:0,G:0,C:0};
  entries.forEach(e=>{const c=e.card,q=e.qty,line=c.type_line||'';total+=q;
    if(/\bLand\b/.test(line)){lands+=q}else{nonlands+=q;const mv=Number(c.cmc)||0;totalMana+=mv*q;curve[Math.min(7,Math.max(0,Math.floor(mv)))]+=q;}
    Object.keys(types).forEach(label=>{const singular=label==='Creatures'?'Creature':label==='Sorceries'?'Sorcery':label.slice(0,-1);if(new RegExp(`\\b${singular}\\b`).test(line))types[label]+=q;});
    for(const symbol of cardManaCost(c).matchAll(/\{([^}]+)\}/g)){const parts=symbol[1].toUpperCase().split('/');Object.keys(pips).forEach(k=>{if(parts.includes(k))pips[k]+=q;});}
    (c.produced_mana||[]).forEach(k=>{if(k in sources)sources[k]+=q;});
  });
  return{entries,total,lands,nonlands,totalMana,avg:nonlands?totalMana/nonlands:0,curve,types,pips,sources};
}
function renderStats(){
  const s=deckStats();if(!s.entries.length){els.stats.innerHTML='<div class="empty-state"><div class="empty-glyph">▥</div><strong>No deck statistics yet</strong><span>Resolve a deck to calculate its mana curve, card types, and color requirements.</span></div>';return;}
  const peak=Math.max(1,...s.curve),curveLabels=['0','1','2','3','4','5','6','7+'];
  const typeRows=Object.entries(s.types).filter(([,count])=>count>0),typePeak=Math.max(1,...typeRows.map(([,n])=>n));
  const colors=[['W','White','mana-white'],['U','Blue','mana-blue'],['B','Black','mana-black'],['R','Red','mana-red'],['G','Green','mana-green'],['C','Colorless','mana-colorless']];
  const symbolTotal=Object.values(s.pips).reduce((a,b)=>a+b,0);
  els.stats.innerHTML=`<div class="stat-summary"><div><strong>${s.total}</strong><span>Total cards</span></div><div><strong>${s.nonlands}</strong><span>Nonland cards</span></div><div><strong>${s.lands}</strong><span>Lands</span></div><div><strong>${s.avg.toFixed(2)}</strong><span>Avg nonland MV</span></div><div><strong>${Number.isInteger(s.totalMana)?s.totalMana:s.totalMana.toFixed(1)}</strong><span>Total mana value</span></div></div>
  <section class="stats-block"><h3><span>▥</span> Mana Curve <small>nonland distribution</small></h3><div class="curve-chart">${s.curve.map((n,i)=>`<div class="curve-col"><strong>${n}</strong><div class="curve-track"><i style="height:${n?Math.max(5,Math.round(n/peak*100)):0}%"></i></div><span>${curveLabels[i]}</span></div>`).join('')}</div><p class="stats-note">Excludes ${s.lands} land${s.lands===1?'':'s'} from mana-value calculations.</p></section>
  <section class="stats-block"><h3><span>♧</span> Card Types <small>multi-type cards appear in each matching category</small></h3><div class="type-grid">${typeRows.map(([label,n])=>`<div class="type-stat"><div><strong>${label}</strong><span>${n} (${s.total?Math.round(n/s.total*100):0}%)</span></div><i><b style="width:${Math.round(n/typePeak*100)}%"></b></i></div>`).join('')}</div></section>
  <section class="stats-block"><h3><span>◉</span> Mana Symbols & Sources</h3><div class="mana-grid">${colors.map(([key,label,cls])=>`<div class="mana-stat"><i class="mana-orb ${cls}">${key}</i><div><strong>${s.pips[key]} pip${s.pips[key]===1?'':'s'} <small>${symbolTotal?`(${Math.round(s.pips[key]/symbolTotal*100)}%)`:''}</small></strong><span>${s.sources[key]} source${s.sources[key]===1?'':'s'} can produce ${label.toLowerCase()}</span></div></div>`).join('')}</div><p class="stats-note">Sources use Scryfall's produced-mana data and include lands, rocks, and other resolved cards.</p></section>`;
}
function errorGuidance(message){
  if(/Scryfall|request failed|fetch/i.test(message))return ['The card service did not finish the lookup. Your decklist is still here, so you can safely try again.','retry-resolution','Retry resolution'];
  if(/Physical deck count|Library count/i.test(message))return ['Adjust the quantity or add the missing card in the decklist, then resolve it again.','focus-deck','Edit decklist'];
  if(/No commander/i.test(message))return ['Put the commander under a Commander section heading, then resolve the deck again.','focus-deck','Edit decklist'];
  if(/Card back/i.test(message))return ['Check the Card Back URL in Export settings, then retest the images.','focus-back','Check card back'];
  if(/unresolved/i.test(message))return ['Review the unresolved card listed below. You can retry it by card name.','',''];
  if(/failed images|image-tested/i.test(message))return ['Retest the image provider, then review any cards that still fail.','retest-images','Retest images'];
  if(/Singleton violation/i.test(message))return ['Reduce this nonbasic card to one copy in the decklist, then resolve again.','focus-deck','Edit decklist'];
  if(/TTS ID conflict/i.test(message))return ['Resolve the deck again to rebuild its Tabletop Simulator identifiers.','retry-resolution','Rebuild deck'];
  return ['Correct this issue and run validation again.','',''];
}
function renderErrors(){
  const problemEntries=[...state.cards.filter(c=>c.status==='unresolved'||c.imageStatus==='failed'),...state.tokens.filter(c=>c.imageStatus==='failed')];
  if(!state.errors.length&&!problemEntries.length){els.errorsView.innerHTML='<div class="empty-state"><div class="empty-glyph">✓</div><strong>No blocking errors</strong><span>This deck has no unresolved validation issues.</span></div>';return;}
  const summary=state.errors.map((message,index)=>{const [help,action,label]=errorGuidance(message);return `<article class="error-report"><span class="error-mark">!</span><div><strong>${esc(message)}</strong><p>${esc(help)}</p></div>${action?`<button class="button secondary small" data-error-action="${action}">${esc(label)}</button>`:''}</article>`}).join('');
  const details=problemEntries.length?`<section class="error-details"><h3>Items requiring attention <span>${problemEntries.length}</span></h3>${problemEntries.map((entry,index)=>{const unresolved=entry.status==='unresolved';const name=entry.card?displayName(entry.card):entry.name;const reason=unresolved?(entry.reason||'This card could not be resolved.'):'One or more images for this printing did not load.';return `<article class="error-entry"><div><span>${unresolved?'CARD LOOKUP':'IMAGE CHECK'}</span><strong>${esc(name)}</strong><p>${esc(reason)}</p></div><button class="button primary small" data-error-entry="${index}">${unresolved?'Review card':'Repair image'}</button></article>`}).join('')}</section>`:'';
  els.errorsView.innerHTML=`<div class="errors-head"><div><span class="eyebrow">BLOCKING ISSUES</span><h3>${state.errors.length} validation error${state.errors.length===1?'':'s'}</h3></div><p>Fix every issue below to unlock export.</p></div><div class="error-list">${summary}</div>${details}`;
  els.errorsView.querySelectorAll('[data-error-action]').forEach(button=>button.onclick=()=>{
    const action=button.dataset.errorAction;
    if(action==='retry-resolution')resolveDeck();
    if(action==='retest-images')runPreflight();
    if(action==='focus-deck'){els.input.scrollIntoView({behavior:'smooth',block:'center'});setTimeout(()=>els.input.focus(),350);}
    if(action==='focus-back'){els.backMode.scrollIntoView({behavior:'smooth',block:'center'});setTimeout(()=>els.backMode.focus(),350);}
  });
  els.errorsView.querySelectorAll('[data-error-entry]').forEach(button=>button.onclick=()=>openDetail(problemEntries[Number(button.dataset.errorEntry)]));
}
function renderCards(){
  els.log.hidden=state.activeTab!=='log';els.stats.hidden=state.activeTab!=='stats';els.errorsView.hidden=state.activeTab!=='errors';els.grid.hidden=['log','stats','errors'].includes(state.activeTab);if(state.activeTab==='log'){renderLog();return;}if(state.activeTab==='stats'){renderStats();return;}if(state.activeTab==='errors'){renderErrors();return;}
  const entries=visibleEntries(); if(!entries.length){els.grid.innerHTML=`<div class="empty-state"><div class="empty-glyph">⌁</div><strong>No ${esc(state.activeTab)} items</strong><span>${state.activeTab==='errors'?'Nothing is currently failing in this view.':'Resolve a deck to populate this view.'}</span></div>`;return;}
  els.grid.innerHTML=entries.map((e)=>{
    const card=e.card;const url=card?providerUrl(imgSource(card,0),0):'';const fail=e.status==='unresolved'||e.imageStatus==='failed';
    const name=card?displayName(card):e.name;const status=e.status==='unresolved'?'UNRESOLVED':e.mode==='fallback'?'FALLBACK':e.mode==='token'?'TOKEN':'EXACT';
    const meta=card?`${card.set.toUpperCase()} · ${card.collector_number}`:e.reason;const mana=cardManaCost(card);
    return `<button class="card-tile ${fail?'failed':''}" data-key="${esc(e.key||card?.id)}" aria-label="Open ${esc(name)} details">${url?`<img class="card-art" loading="lazy" src="${esc(url)}" alt="">`:''}<span class="card-status ${status.toLowerCase()}">${status}</span><span class="card-copy"><strong>${esc(name)}</strong><small>${esc(meta)}</small></span>${mana?`<span class="card-mana">${esc(mana)}</span>`:''}<span class="card-quantity">${e.qty}×</span>${fail?`<span class="card-failure">${e.status==='unresolved'?'LOOKUP FAILED':'IMAGE FAILED'}</span>`:''}</button>`;
  }).join('');
}
function renderLog(){els.log.innerHTML=state.logs.length?state.logs.slice().reverse().map(x=>`<div class="log-line ${x.type}">[${esc(x.time)}] ${esc(x.message)}</div>`).join(''):'<div class="empty-state"><strong>No log entries</strong></div>';}
function renderTabs(){const d=dashboardData(),oath=isOathbreaker();$('#deckTabCount').textContent=d.lib;$('#commanderTabCount').textContent=d.cmd;$('#signatureTabCount').textContent=d.sig;$('#sideboardTabCount').textContent=d.side;const leaderTab=$('.tabs button[data-tab="commander"]');leaderTab.hidden=!(isCommander()||oath);leaderTab.firstChild.textContent=oath?'Oathbreaker ':'Commander ';$('.tabs button[data-tab="signature"]').hidden=!oath;$('.tabs button[data-tab="sideboard"]').hidden=isCommander()||oath;if((state.activeTab==='commander'&&leaderTab.hidden)||(state.activeTab==='signature'&&!oath)||(state.activeTab==='sideboard'&&(isCommander()||oath)))state.activeTab='deck';$('#tokenTabCount').textContent=state.tokens.length;$('#errorTabCount').textContent=state.errors.length+state.cards.filter(c=>c.status==='unresolved').length;$$('.tabs button').forEach(b=>b.classList.toggle('active',b.dataset.tab===state.activeTab));els.includeSide.closest('label').hidden=oath;$('#formatNote').textContent=oath?`Exactly ${oathbreakerDeckSize()} cards: 1 Oathbreaker + 1 Signature Spell + ${oathbreakerDeckSize()-2} library cards, or 2 partner Oathbreakers + 2 Signature Spells + ${oathbreakerDeckSize()-4} library cards.${selectedFormat()==='oathbreaker100'?' Homebrew starting life: 40; set your TTS life counter to 40.':''}`:'Named formats check card legality using current Scryfall data. Other constructed checks deck size and copies only.';}
function renderExport(){const buttons=[els.jsonBtn,els.pngBtn,els.zipBtn,els.jsonViewBtn];buttons.forEach(b=>b.disabled=!state.validated);els.folderBtn.disabled=!state.validated||!ttsFolder;els.folderBtn.title=ttsFolder?'':'Choose a TTS folder in Export settings first.';if(state.validated){els.exportState.textContent='Export ready';els.exportReason.textContent='All live image and structure checks passed.';$('.status-light').style.background='var(--green)';}else{els.exportState.textContent='Export locked';els.exportReason.textContent=state.errors[0]||'Resolve and validate a deck first.';$('.status-light').style.background='var(--red)';}}
function renderAll(){renderMetrics();renderTabs();renderCards();renderExport();renderBack();}

function resetResolution(){state.cards=[];state.tokens=[];state.unresolved=[];state.logs=[];state.errors=[];state.warnings=[];state.backOk=false;state.backTested=false;state.backTesting=false;state.validated=false;state.generated=null;state._guids=new Set();setPill('idle','Not validated');setProgress(0,'Waiting for resolution');renderAll();}

async function resolveDeck(){
  if(state.busy)return;const parsed=parseDecklist(els.input.value);if(!parsed.entries.length){toast('No readable card lines found.');return;}
  if(isCommander()&&parsed.entries.some(e=>e.section==='oathbreaker'||e.section==='signature')){els.format.value='oathbreaker';els.includeSide.checked=false;updateParsePreview();}
  if(isCommander()&&!parsed.entries.some(e=>e.section==='commander')&&parsed.entries.filter(e=>e.section==='deck').reduce((n,e)=>n+e.qty,0)>=60){els.format.value='constructed';els.includeSide.checked=parsed.entries.some(e=>e.section==='sideboard');updateParsePreview();}
  resetResolution();state.busy=true;state.parsed=parsed.entries;setPill('working','Resolving');setProgress(8,'Querying Scryfall');addLog(`Parsed ${parsed.entries.length} unique deck lines.`,'ok');parsed.ignored.forEach(i=>addLog(`Line ${i.line} was not understood: ${i.raw}`,'warn'));
  try{
    state.cards=await resolveEntries(parsed.entries.filter(e=>e.section!=='tokens'));
    const unresolved=state.cards.filter(e=>e.status==='unresolved');unresolved.forEach(e=>addLog(`${e.name}: ${e.reason}`,'error'));
    state.cards.filter(e=>e.mode==='fallback').forEach(e=>addLog(`${e.name}: substituted ${e.card.set.toUpperCase()} ${e.card.collector_number} by name.`,'warn'));
    const namedCommander=state.cards.find(e=>['commander','oathbreaker'].includes(e.section)&&e.card);if(namedCommander&&els.name.value==='Commander Deck')els.name.value=namedCommander.card.name;
    setProgress(38,'Discovering tokens');
    const manual=els.manualTokens.value.split(/\r?\n|,/).map(x=>x.trim()).filter(Boolean);
    const listed=parsed.entries.filter(e=>e.section==='tokens').map(e=>e.name);state.tokens=await resolveTokens(state.cards.filter(e=>e.status==='resolved'),[...listed,...manual]);
    addLog(`Resolved ${state.cards.filter(e=>e.status==='resolved').length} card lines and ${state.tokens.length} tokens/helpers.`,'ok');state.busy=false;renderAll();await runPreflight();
  }catch(e){state.busy=false;state.errors=[e.message];addLog(e.message,'error');setPill('bad','Resolution failed');setProgress(100,'Scryfall request failed');renderAll();}
}

function transform(pos={x:0,y:1,z:0},rotZ=0){return {posX:pos.x,posY:pos.y,posZ:pos.z,rotX:0,rotY:0,rotZ,scaleX:1,scaleY:1,scaleZ:1};}
function cardIdentity(card){
  const oracleId=String(card?.oracle_id||'');
  const tokenIds=[...new Set((card?.all_parts||[]).filter(part=>['token','emblem'].includes(part.component)&&part.id).map(part=>String(part.id)))];
  const memo=oracleId+(tokenIds.length?`|tokens:${tokenIds.join(',')}`:'');
  const tags=oracleId?[`oid:${oracleId}`]:[];
  const footer=oracleId?`[mtg:oid=${oracleId}${tokenIds.length?`;tok=${tokenIds.join(',')}`:''}]`:'';
  return{memo,tags,footer};
}
function cardFace(card,faceIndex=0){return card?.card_faces?.[faceIndex]||card||{};}
function cardEncoderNickname(card,faceIndex=0,displayName=''){
  const face=cardFace(card,faceIndex);const name=String(displayName||face.name||card?.name||'Card').replaceAll('"',"'");const typeLine=String(face.type_line||card?.type_line||'');const manaValue=face.cmc??card?.cmc??0;
  return[name,typeLine,`${manaValue}CMC`].filter(Boolean).join('\n');
}
function cardEncoderDescription(card,faceIndex=0){
  const face=cardFace(card,faceIndex);const identity=cardIdentity(card);const oracle=String(face.oracle_text??card?.oracle_text??'').replaceAll('"',"'");let stats='';
  if(face.power!=null&&face.toughness!=null)stats=`${face.power}/${face.toughness}`;else if(face.loyalty!=null)stats=String(face.loyalty);else if(face.defense!=null)stats=String(face.defense);
  return[oracle,identity.footer,stats?`[b]${stats}[/b]`:''].filter(Boolean).join('\n');
}
function cardNeedsEncoderRebuild(card){const faces=card?.card_faces?.length?card.card_faces:[card];return faces.some(face=>face?.loyalty!=null||/\bPlaneswalker\b/.test(String(face?.type_line||'')));}
const CARD_ENCODER_LUA=`function onLoad()\n  Wait.frames(function()\n    local ok, encoder = pcall(function() return Global.getVar("Encoder") end)\n    if ok and encoder then pcall(function() encoder.call("APIrebuildButtons", {obj = self}) end) end\n  end, 2)\nend`;
function cardObject(entry, key, pos, rotZ=0, nickname=''){
  const card=entry.card;const fronts=facesFor(entry);const custom={};const identity=cardIdentity(card);const frontKey=String(key);custom[frontKey]={FaceURL:fronts[0].url,BackURL:normalizedCardBackUrl(),NumWidth:1,NumHeight:1,BackIsHidden:true,UniqueBack:false,Type:0};
  const encoderLua=cardNeedsEncoderRebuild(card)?CARD_ENCODER_LUA:'';const obj={Name:'CardCustom',Transform:transform(pos,rotZ),Nickname:cardEncoderNickname(card,0,nickname),Description:cardEncoderDescription(card,0),Memo:identity.memo,Tags:identity.tags,GMNotes:'',AltLookAngle:{x:0,y:0,z:0},ColorDiffuse:{r:1,g:1,b:1},LayoutGroupSortIndex:0,Value:0,Locked:false,Grid:true,Snap:true,IgnoreFoW:false,MeasureMovement:false,DragSelectable:true,Autoraise:true,Sticky:true,Tooltip:true,GridProjection:false,HideWhenFaceDown:true,Hands:true,CardID:Number(key)*100,SidewaysCard:false,CustomDeck:custom,LuaScript:encoderLua,LuaScriptState:'',XmlUI:'',GUID:guid()};
  if(fronts.length>1){const backKey=String(Number(key)+1);const backCustom={};backCustom[backKey]={FaceURL:fronts[1].url,BackURL:normalizedCardBackUrl(),NumWidth:1,NumHeight:1,BackIsHidden:true,UniqueBack:false,Type:0};obj.States={'2':{...obj,Transform:transform(pos,rotZ),Nickname:cardEncoderNickname(card,1),Description:cardEncoderDescription(card,1),CardID:Number(backKey)*100,CustomDeck:backCustom,GUID:guid()}};}
  return {obj,nextKey:Number(key)+(fronts.length>1?2:1)};
}

function deckObject(entries,name,pos,faceUp=false,startKey=900001){
  const contained=[];const ids=[];const custom={};let key=startKey;
  entries.forEach(entry=>{for(let q=0;q<entry.qty;q++){const made=cardObject(entry,key,pos,faceUp?0:180);contained.push(made.obj);ids.push(made.obj.CardID);Object.assign(custom,made.obj.CustomDeck);if(made.obj.States)Object.values(made.obj.States).forEach(s=>Object.assign(custom,s.CustomDeck));key=made.nextKey;}});
  const obj={Name:'DeckCustom',Transform:transform(pos,faceUp?0:180),Nickname:name,Description:'',GMNotes:'',AltLookAngle:{x:0,y:0,z:0},ColorDiffuse:{r:1,g:1,b:1},LayoutGroupSortIndex:0,Value:0,Locked:false,Grid:true,Snap:true,IgnoreFoW:false,MeasureMovement:false,DragSelectable:true,Autoraise:true,Sticky:true,Tooltip:true,GridProjection:false,HideWhenFaceDown:true,Hands:true,SidewaysCard:false,DeckIDs:ids,CustomDeck:custom,LuaScript:'',LuaScriptState:'',XmlUI:'',ContainedObjects:contained,GUID:guid()};
  return {obj,nextKey:key,count:contained.length};
}

function generateSavedObject(){
  if(!state.validated)throw new Error('Export is locked until preflight passes.');state._guids=new Set();let key=900001;const objects=[];
  const library=deckObject(libraryEntries(),els.name.value,{x:0,y:1.2,z:0},false,key);objects.push(library.obj);key=library.nextKey;
  let cx=4;for(const entry of (isOathbreaker()?oathbreakerEntries():commanderEntries())){for(let q=0;q<entry.qty;q++){const made=cardObject(entry,key,{x:cx,y:1.1,z:0},0,`${isOathbreaker()?'Oathbreaker':'Commander'} — ${entry.card.name}`);objects.push(made.obj);key=made.nextKey;cx+=2.8;}}
  if(isOathbreaker()){let sx=8;for(const entry of signatureEntries()){const made=cardObject(entry,key,{x:sx,y:1.1,z:0},0,'Signature Spell — '+entry.card.name);objects.push(made.obj);key=made.nextKey;sx+=2.8;}}
  if(!isCommander()&&!isOathbreaker()&&els.includeSide.checked){const side=sideboardEntries();if(side.length){const sideCount=side.reduce((n,e)=>n+e.qty,0);const made=sideCount===1?cardObject(side[0],key,{x:6,y:1.1,z:0},0,'Sideboard — '+side[0].card.name):deckObject(side,'Sideboard',{x:6,y:1.1,z:0},false,key);objects.push(made.obj);key=made.nextKey;}}
  if(!isCommander()&&!isOathbreaker()&&els.includeMaybe.checked){const maybe=maybeboardEntries();if(maybe.length){const maybeCount=maybe.reduce((n,e)=>n+e.qty,0);const made=maybeCount===1?cardObject(maybe[0],key,{x:9,y:1.1,z:0},0,'Maybeboard — '+maybe[0].card.name):deckObject(maybe,'Maybeboard',{x:9,y:1.1,z:0},false,key);objects.push(made.obj);key=made.nextKey;}}
  if(state.tokens.length){const tokenDeck=deckObject(state.tokens,'Tokens',{x:-4,y:1.1,z:0},true,key);objects.push(tokenDeck.obj);key=tokenDeck.nextKey;}
  const save={SaveName:'',Date:new Date().toISOString(),VersionNumber:'',GameMode:'',GameType:'',GameComplexity:'',Tags:[],Gravity:0.5,PlayArea:0.5,Table:'',Sky:'',Note:`Generated by TTS Deck Forge — ${els.name.value} (${els.format.selectedOptions[0].text})`,TabStates:{},LuaScript:'',LuaScriptState:'',XmlUI:'',ObjectStates:objects};
  const mappings=[];objects.forEach(o=>{if(o.CustomDeck)Object.entries(o.CustomDeck).forEach(([k,v])=>mappings.push({key:k,cardId:Number(k)*100,url:v.FaceURL}));(o.ContainedObjects||[]).forEach(c=>Object.entries(c.CustomDeck||{}).forEach(([k,v])=>{if(!mappings.some(m=>m.key===k))mappings.push({key:k,cardId:c.CardID,url:v.FaceURL})}))});
  state.generated={save,report:{objectStates:objects.length,mainDeckCount:library.count,commanderCount:(isOathbreaker()?oathbreakerEntries():commanderEntries()).reduce((n,e)=>n+e.qty,0),signatureCount:signatureEntries().reduce((n,e)=>n+e.qty,0),tokenCount:state.tokens.length,customDeckDefinitions:mappings.length,cardIdMappings:mappings,dfcStateCount:state.cards.filter(e=>facesFor(e).length>1).reduce((n,e)=>n+e.qty,0)}};return state.generated;
}

function thumbnailBlob(){
  return new Promise((resolve,reject)=>{if(state.customThumb){resolve(state.customThumb);return;}const c=document.createElement('canvas');c.width=c.height=256;const x=c.getContext('2d');const g=x.createLinearGradient(0,0,256,256);g.addColorStop(0,'#0b1012');g.addColorStop(1,'#1d3025');x.fillStyle=g;x.fillRect(0,0,256,256);x.strokeStyle='#d8ac55';x.lineWidth=3;x.strokeRect(18,18,220,220);x.strokeStyle='rgba(104,187,135,.55)';x.lineWidth=1;x.strokeRect(25,25,206,206);x.fillStyle='#d8ac55';x.font='700 11px system-ui';x.letterSpacing='2px';x.fillText('TTS DECK FORGE',34,52);x.fillStyle='#f1f2ec';x.font='800 24px system-ui';wrapCanvas(x,els.name.value,34,94,188,28,3);x.fillStyle='#8f9b9a';x.font='600 11px system-ui';x.fillText('SAVED OBJECT',34,211);x.beginPath();x.arc(202,203,12,0,Math.PI*2);x.strokeStyle='#68bb87';x.lineWidth=3;x.stroke();c.toBlob(b=>b?resolve(b):reject(new Error('PNG generation failed.')),'image/png');});
}
function wrapCanvas(ctx,text,x,y,max,line,maxLines){const words=text.split(/\s+/);let row='',lineNo=0;for(const word of words){const next=row?row+' '+word:word;if(ctx.measureText(next).width>max&&row){ctx.fillText(row,x,y+lineNo*line);lineNo++;row=word;if(lineNo>=maxLines-1)break}else row=next}if(row&&lineNo<maxLines)ctx.fillText(row,x,y+lineNo*line);}
function download(blob,name){const a=document.createElement('a');a.href=URL.createObjectURL(blob);a.download=name;document.body.append(a);a.click();setTimeout(()=>{URL.revokeObjectURL(a.href);a.remove()},1000);}
function jsonBlob(){const g=generateSavedObject();return new Blob([JSON.stringify(g.save,null,2)],{type:'application/json'});}
async function downloadJson(){download(jsonBlob(),`${safeFilename(els.name.value)}.json`)}
async function downloadPng(){download(await thumbnailBlob(),`${safeFilename(els.name.value)}.png`)}
async function downloadZip(){if(!window.JSZip){toast('ZIP library failed to load. Use the individual downloads.');return;}const zip=new JSZip();const base=safeFilename(els.name.value);zip.file(`${base}.json`,jsonBlob());zip.file(`${base}.png`,await thumbnailBlob());download(await zip.generateAsync({type:'blob'}),`${base}.zip`);}
let ttsFolder=null;
function openFolderSettings(){
  return new Promise((resolve,reject)=>{
    const request=indexedDB.open('commander-tts-deck-forge',1);
    request.onupgradeneeded=()=>request.result.createObjectStore('settings');
    request.onsuccess=()=>resolve(request.result);
    request.onerror=()=>reject(request.error);
  });
}
async function storedFolder(handle){
  const db=await openFolderSettings();
  try{
    await new Promise((resolve,reject)=>{
      const tx=db.transaction('settings','readwrite');
      tx.objectStore('settings').put(handle,'ttsFolder');
      tx.oncomplete=resolve;tx.onerror=()=>reject(tx.error);tx.onabort=()=>reject(tx.error);
    });
  }finally{db.close()}
}
async function restoreFolder(){
  if(!window.showDirectoryPicker||!window.indexedDB){els.selectFolderBtn.disabled=true;els.folderStatus.textContent='Folder access is unavailable in this browser';return;}
  try{
    const db=await openFolderSettings();
    try{ttsFolder=await new Promise((resolve,reject)=>{const request=db.transaction('settings').objectStore('settings').get('ttsFolder');request.onsuccess=()=>resolve(request.result||null);request.onerror=()=>reject(request.error)})}finally{db.close()}
    if(ttsFolder){els.folderStatus.textContent=`Selected: ${ttsFolder.name}`;els.selectFolderBtn.textContent='Change folder';renderExport()}
  }catch{els.folderStatus.textContent='No saved folder; choose one to begin'}
}
async function chooseFolder(){
  if(!window.showDirectoryPicker){toast('Direct folder access is unavailable in this browser. Download the files instead.');return;}
  try{
    const folder=await window.showDirectoryPicker({mode:'readwrite'});
    ttsFolder=folder;els.folderStatus.textContent=`Selected: ${folder.name}`;els.selectFolderBtn.textContent='Change folder';renderExport();
    try{await storedFolder(folder);toast(`TTS folder saved: ${folder.name}`)}
    catch{els.folderStatus.textContent=`Selected for this tab: ${folder.name}`;toast('Browser storage is unavailable. Choose the folder again after reloading.')}
  }catch(error){if(error.name!=='AbortError')toast(`Could not choose a folder: ${error.message}`)}
}
async function sendToFolder(){
  if(!ttsFolder)return toast('Choose a TTS folder in Export settings first.');
  try{
    let permission=await ttsFolder.queryPermission({mode:'readwrite'});
    if(permission!=='granted')permission=await ttsFolder.requestPermission({mode:'readwrite'});
    if(permission!=='granted')return toast('Allow access to the selected TTS folder to send the files.');
    const base=safeFilename(els.name.value);
    for(const [name,blob] of [[`${base}.json`,jsonBlob()],[`${base}.png`,await thumbnailBlob()]]){
      const handle=await ttsFolder.getFileHandle(name,{create:true});const writable=await handle.createWritable();await writable.write(blob);await writable.close();
    }
    toast(`Saved ${base}.json and ${base}.png to ${ttsFolder.name}`);
  }catch(error){toast(`Could not save to ${ttsFolder.name}: ${error.message}. Change the folder in Export settings if it moved.`)}
}

async function openDetail(entry){
  if(!entry)return;const c=entry.card;if(!c){els.detailContent.innerHTML=`<h2>${esc(entry.name)}</h2><p>${esc(entry.reason)}</p><button class="button primary fallback-one">Find by card name</button>`;els.detailContent.querySelector('.fallback-one').onclick=()=>fallbackOne(entry);els.detail.showModal();return;}
  const url=providerUrl(imgSource(c,0),0);els.detailContent.innerHTML=`<div class="detail-layout"><img src="${esc(url)}" alt="${esc(c.name)}"><div><span class="eyebrow">${esc(entry.mode.toUpperCase())} PRINTING</span><h2>${esc(c.name)}</h2><dl class="detail-meta"><dt>Requested</dt><dd>${esc(entry.name)}${entry.set?` · ${esc(entry.set.toUpperCase())} ${esc(entry.collector)}`:''}</dd><dt>Resolved</dt><dd>${esc(c.set.toUpperCase())} ${esc(c.collector_number)}</dd><dt>Released</dt><dd>${esc(c.released_at)}</dd><dt>Provider</dt><dd>${esc(els.provider.options[els.provider.selectedIndex].text)}</dd><dt>Image status</dt><dd>${esc(entry.imageStatus)}</dd></dl><div class="url-box">${esc(url)}</div><div style="display:flex;gap:8px"><button class="button secondary retry-one">Retry image</button><button class="button primary printings">Change printing</button></div><div id="printingResults"></div></div></div>`;
  els.detailContent.querySelector('.retry-one').onclick=async()=>{entry.imageStatus='untested';entry.faceResults={};els.detail.close();await runPreflight()};els.detailContent.querySelector('.printings').onclick=()=>loadPrintings(entry);els.detail.showModal();
}

async function fallbackOne(entry){try{const card=await searchFirst(`!"${entry.name.replace(/"/g,'')}"`);if(!card)throw new Error('No exact card-name match found.');Object.assign(entry,{card,status:'resolved',mode:'fallback',imageStatus:'untested'});addLog(`${entry.name}: manual name fallback selected ${card.set.toUpperCase()} ${card.collector_number}.`,'warn');els.detail.close();renderAll();await runPreflight()}catch(e){toast(e.message)}}
async function loadPrintings(entry){const box=$('#printingResults');box.innerHTML='<p>Loading available printings…</p>';try{const r=await fetch(`https://api.scryfall.com/cards/search?unique=prints&order=released&dir=desc&q=${encodeURIComponent('!"'+entry.card.name+'"')}`);if(!r.ok)throw new Error(`Printing search failed (${r.status})`);const d=await r.json();box.innerHTML=`<div class="printing-list">${d.data.map(c=>`<button class="print-choice" data-id="${c.id}"><img loading="lazy" src="${esc(providerUrl(imgSource(c),0))}" alt=""><span>${esc(c.set.toUpperCase())} ${esc(c.collector_number)}<br>${esc(c.released_at)}</span></button>`).join('')}</div>`;box.querySelectorAll('.print-choice').forEach((b,i)=>b.onclick=async()=>{entry.card=d.data[i];entry.mode='manual';entry.status='resolved';entry.imageStatus='untested';entry.faceResults={};els.detail.close();addLog(`${entry.name}: printing changed to ${entry.card.set.toUpperCase()} ${entry.card.collector_number}.`,'warn');renderAll();await runPreflight()});}catch(e){box.innerHTML=`<p style="color:var(--red)">${esc(e.message)}</p>`}}

function viewJson(){try{const g=generateSavedObject();els.jsonCode.textContent=JSON.stringify(g.save,null,2)+`\n\n/* Validation report\nObjectStates: ${g.report.objectStates}\nMain DeckCustom: ${g.report.mainDeckCount}\nCommanders: ${g.report.commanderCount}\nTokens: ${g.report.tokenCount}\nCustomDeck definitions: ${g.report.customDeckDefinitions}\nDFC states: ${g.report.dfcStateCount}\n*/`;els.jsonDialog.showModal()}catch(e){toast(e.message)}}

els.demo.onclick=()=>{setDeckSource(DEMO,'Omnath, Locus of Mana');toast('Sample deck loaded. Click Resolve deck.')};els.resolve.onclick=resolveDeck;
els.paste.onclick=async()=>{try{const text=await navigator.clipboard.readText();if(!text.trim())throw new Error('Clipboard is empty.');if(deckUrlFromText(text)){els.input.value=text.trim();await onDeckInput({inputType:'insertFromPaste'});}else{setDeckSource(text);toast('Decklist pasted from clipboard.');}}catch(error){toast(error.message==='Clipboard is empty.'?error.message:'Clipboard access was blocked. Paste into the decklist box instead.');}};
els.clear.onclick=()=>{if(els.input.value&&!confirm('Clear the current decklist?'))return;setDeckSource('');els.name.value='Commander Deck';toast('Decklist cleared.');};
els.deckFile.onchange=async()=>{const file=els.deckFile.files?.[0];if(!file)return;try{await importDeckFile(file);}catch(error){toast(error.message||'The file could not be loaded.');}finally{els.deckFile.value='';}};
els.retest.onclick=()=>state.cards.length?runPreflight():testCardBackOnly();els.provider.onchange=()=>{state.cards.forEach(e=>{e.imageStatus='untested';e.faceResults={}});state.tokens.forEach(e=>{e.imageStatus='untested';e.faceResults={}});state.backOk=false;state.backTested=false;state.validated=false;addLog(`Image provider changed to ${els.provider.options[els.provider.selectedIndex].text}.`,'warn');renderAll();runPreflight()};
els.input.oninput=onDeckInput;
els.input.onpaste=event=>{const text=event.clipboardData?.getData('text/plain')||'';if(deckUrlFromText(text)){event.preventDefault();els.input.value=text.trim();onDeckInput({inputType:'insertFromPaste'});}};
els.input.ondrop=event=>{const text=event.dataTransfer?.getData('text/uri-list')?.split(/\r?\n/).find(line=>line&&!line.startsWith('#'))||event.dataTransfer?.getData('text/plain')||'';if(deckUrlFromText(text)){event.preventDefault();els.input.value=text.trim();onDeckInput({inputType:'insertFromDrop'});}};
els.format.onchange=()=>{if(isOathbreaker())els.includeSide.checked=false;state.validated=false;state.generated=null;updateParsePreview();if(state.cards.length)validateAll();renderAll()};
els.fresh.onclick=()=>{state.session=`${Date.now().toString(36)}-${Math.random().toString(36).slice(2,7)}`;state.cards.forEach(e=>{e.imageStatus='untested';e.faceResults={}});state.tokens.forEach(e=>{e.imageStatus='untested';e.faceResults={}});state.backOk=false;state.validated=false;addLog('Generated one cache-busting session. URLs remain stable until this button is used again.','warn');renderAll();runPreflight()};
els.backMode.onchange=changeCardBackMode;els.back.oninput=()=>{if(els.backMode.value==='custom'){els.back.value=fixDropboxCardBackLink(els.back.value);state.customBackUrl=els.back.value.trim();els.backPreview.src=state.customBackUrl;state.backOk=false;state.backTested=false;state.validated=false;renderBack();}};els.back.onchange=()=>{els.back.value=fixDropboxCardBackLink(els.back.value.trim());state.customBackUrl=els.back.value.trim();state.backOk=false;state.backTested=false;state.validated=false;renderAll();if(state.cards.length)runPreflight();else testCardBackOnly();};[els.includeSide,els.includeMaybe].forEach(e=>e.onchange=()=>{state.validated=false;renderAll();runPreflight()});
$$('.tabs button').forEach(b=>b.onclick=()=>{state.activeTab=b.dataset.tab;renderTabs();renderCards()});els.grid.onclick=e=>{const tile=e.target.closest('.card-tile');if(!tile)return;const all=[...state.cards,...state.tokens];openDetail(all.find(x=>(x.key||x.card?.id)===tile.dataset.key))};
$$('dialog .dialog-close').forEach(b=>b.onclick=()=>b.closest('dialog').close());els.jsonBtn.onclick=downloadJson;els.pngBtn.onclick=downloadPng;els.zipBtn.onclick=downloadZip;els.selectFolderBtn.onclick=chooseFolder;els.folderBtn.onclick=sendToFolder;els.jsonViewBtn.onclick=viewJson;$('#copyJson').onclick=async()=>{await navigator.clipboard.writeText(els.jsonCode.textContent);toast('JSON copied')};$('#downloadJsonModal').onclick=downloadJson;
els.thumbUpload.onchange=e=>{const f=e.target.files?.[0];if(!f)return;const img=new Image();img.onload=()=>{const c=document.createElement('canvas');c.width=c.height=256;const x=c.getContext('2d');const s=Math.max(256/img.width,256/img.height);x.drawImage(img,(256-img.width*s)/2,(256-img.height*s)/2,img.width*s,img.height*s);c.toBlob(b=>{state.customThumb=b;toast('Custom thumbnail ready for export.')},'image/png')};img.onerror=()=>toast('The thumbnail image could not be read.');img.src=URL.createObjectURL(f)};
window.addEventListener('unhandledrejection',e=>{addLog(e.reason?.message||String(e.reason),'error');toast('An unexpected error was recorded in the log.')});

function registerWebMcp(){
  const context=document.modelContext;if(!context?.registerTool)return;
  const lifecycle=new AbortController();
  const register=tool=>Promise.resolve(context.registerTool(tool,{signal:lifecycle.signal})).catch(e=>addLog(`Agent tool registration failed: ${e.message}`,'warn'));
  register({name:'stage_commander_decklist',title:'Stage Commander decklist',description:'Place a Commander decklist into the visible forge without resolving or exporting it.',inputSchema:{type:'object',properties:{decklist:{type:'string',minLength:1},deckName:{type:'string'}},required:['decklist'],additionalProperties:false},annotations:{readOnlyHint:false,untrustedContentHint:true},execute(input){if(!input||typeof input.decklist!=='string'||!input.decklist.trim())throw new Error('decklist must be a non-empty string');els.input.value=input.decklist;if(typeof input.deckName==='string'&&input.deckName.trim())els.name.value=input.deckName.trim();updateParsePreview();const p=parseDecklist(els.input.value);return{stagedLines:p.entries.length,unreadLines:p.ignored.length,deckName:els.name.value};}});
  register({name:'resolve_and_validate_commander_deck',title:'Resolve and validate deck',description:'Run the same live Scryfall resolution and image preflight as the Resolve deck button. Export remains locked if any check fails.',inputSchema:{type:'object',properties:{},additionalProperties:false},annotations:{readOnlyHint:false,untrustedContentHint:true},async execute(){if(!els.input.value.trim())throw new Error('No decklist is staged');await resolveDeck();return{validated:state.validated,blockingErrors:[...state.errors],physicalCards:dashboardData().physical,tokens:state.tokens.length};}});
}

els.back.value=STANDARD_CARD_BACK;renderAll();updateParsePreview();testCardBackOnly();restoreFolder();registerWebMcp();
