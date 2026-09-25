import { readFile } from 'node:fs/promises';
import vm from 'node:vm';
import worker from '../dist/server/index.js';

const source=await readFile(new URL('../dist/app.js',import.meta.url),'utf8');
const html=await readFile(new URL('../dist/index.html',import.meta.url),'utf8');
if(!html.includes('Paste a decklist or a public Moxfield or Archidekt deck URL here.')||html.includes('id="urlImportBtn"')||html.includes('id="importDialog"'))throw new Error('The URL import button was not replaced by the decklist box note.');
const extract=name=>name==='looksLikeDeckUrl'?source.match(/function looksLikeDeckUrl\([^\n]+/)?.[0]:source.match(new RegExp(`(?:async )?function ${name}\\([\\s\\S]*?\\n\\}`))?.[0];
const functions=['deckUrlFromText','looksLikeDeckUrl','importDeckUrl','onDeckInput'].map(extract);
if(functions.some(value=>!value))throw new Error('Deck URL input functions are missing.');

let scheduled, deckSource, fetchCount=0;
const nativeFetch=globalThis.fetch;
globalThis.fetch=async input=>{
  if(String(input)==='https://api2.moxfield.com/v3/decks/all/abc_123')return new Response(JSON.stringify({name:'Imported deck',format:'commander',boards:{commanders:{cards:{'Sol Ring':{quantity:1}}},mainboard:{cards:{Forest:{quantity:99}}}}}),{status:200,headers:{'Content-Type':'application/json'}});
  return nativeFetch(input);
};
const els={input:{value:'https://www.moxfield.com/decks/abc_123'},deckUrl:{value:''},resolve:{disabled:false},parseSummary:{textContent:''},importDialog:{open:false},format:{selectedOptions:[{text:'Commander'}]}};
const state={cards:[]};
const context={URL,Response,els,state,clearTimeout:()=>{scheduled=null},setTimeout:fn=>{scheduled=fn;return 1},resetResolution:()=>{},updateParsePreview:()=>{},setDeckSource:(...args)=>{deckSource=args},toast:()=>{},fetch:async (path,init)=>{fetchCount++;if(path!=='/api/import-deck'||JSON.parse(init.body).url!=='https://www.moxfield.com/decks/abc_123')throw new Error('Wrong deck import request.');return worker.fetch(new Request('https://local'+path,init))}};
vm.createContext(context);
vm.runInContext('let deckUrlTimer, deckUrlGeneration=0;\n'+functions.join('\n'),context);
const detect=vm.runInContext('deckUrlFromText',context);
if(detect('https://www.archidekt.com/decks/12345/example')!=='https://www.archidekt.com/decks/12345/example')throw new Error('Archidekt URL detection failed.');
if(detect('moxfield.com/decks/abc_123')!=='https://moxfield.com/decks/abc_123')throw new Error('Bare Moxfield URL detection failed.');
if(detect('https://moxfield.com.evil.test/decks/abc')||detect('https://example.com/decks/123')||detect('Commander\n1x Sol Ring'))throw new Error('An unrelated URL or decklist was treated as a supported deck link.');
vm.runInContext('onDeckInput()',context);
if(!els.resolve.disabled||!scheduled||!els.parseSummary.textContent.includes('Loading'))throw new Error('URL input did not start an import.');
await scheduled();
if(fetchCount!==1||deckSource?.[0]!=='Commander\n1x Sol Ring\n\nMainboard\n99x Forest'||deckSource?.[1]!=='Imported deck')throw new Error('Pasted URL did not populate the decklist: '+JSON.stringify({fetchCount,deckSource,status:els.parseSummary.textContent}));
for(const inputType of ['insertFromPaste','insertFromDrop']){
  const pending=vm.runInContext(`onDeckInput({inputType:'${inputType}'})`,context);
  if(fetchCount!==({insertFromPaste:2,insertFromDrop:3})[inputType]||scheduled)throw new Error(`${inputType} waited before requesting the deck.`);
  await pending;
}
globalThis.fetch=nativeFetch;
console.log('Deck URL input import test passed.');
