import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import vm from 'node:vm';

const source = await readFile(new URL('../dist/app.js', import.meta.url), 'utf8');
const names = ['printingKind', 'printingQueries', 'printingSearchUrl', 'printingMatches', 'loadPrintings'];
const functions = names.map(name => source.match(new RegExp(`(?:async )?function ${name}\\([^]*?\\n\\}`))?.[0]);
assert(!functions.includes(undefined), 'Printing search helpers are missing');

const list = { html: '', onclick: null, insertAdjacentHTML(_position, markup) { this.html += markup; } };
const box = {
  innerHTML: '', more: null,
  querySelector(selector) {
    if (selector === '.printing-list') return this.innerHTML.includes('printing-list') ? list : null;
    if (selector === '.load-more-printings') return this.more;
    return null;
  },
  append(button) { this.more = button; },
  insertAdjacentHTML(_position, markup) { this.innerHTML += markup; }
};
const calls = [];
let responses = [];
const context = {
  URL,
  $: () => box,
  document: { createElement: () => ({ remove() { box.more = null; } }) },
  fetch: async url => {
    calls.push(new URL(url));
    const response = responses.shift();
    assert(response, 'Unexpected printing search request');
    return { status: response.status, ok: response.status === 200, json: async () => response.body };
  },
  providerUrl: url => url,
  imgSource: card => card.image_uris?.normal || '',
  esc: value => String(value),
  els: { detail: { close() {} } },
  addLog() {}, renderAll() {}, async runPreflight() {}
};
vm.createContext(context);
vm.runInContext(functions.join('\n'), context);

const goblin = { name: 'Goblin', set: 'unf', collector_number: '107', layout: 'normal', type_line: 'Creature — Goblin Guest' };
const tokenGoblin = { id: 'token-goblin', name: 'Goblin', set: 'tst', collector_number: '1', layout: 'token', type_line: 'Token Creature — Goblin', released_at: '2026-01-01', image_uris: { normal: 'https://example.com/token.jpg' } };
const goblinEntry = { name: 'Goblin', card: goblin, section: 'tokens' };
assert.equal(vm.runInContext('printingKind', context)(goblinEntry), 'token');
assert.equal(vm.runInContext('printingQueries', context)(goblinEntry)[0], '!"Goblin" t:token');
assert.equal(vm.runInContext('printingMatches', context)(goblinEntry, goblin), false);
responses = [{ status: 200, body: { data: [goblin, tokenGoblin], has_more: false } }];
await vm.runInContext('loadPrintings', context)(goblinEntry);
assert.equal(calls[0].searchParams.get('include_extras'), 'true');
assert.equal(calls[0].searchParams.get('unique'), 'prints');
assert(list.html.includes('data-id="token-goblin"'), 'Token printing was not shown');
assert(!list.html.includes('data-id="undefined"'), 'A normal card was shown as a token printing');
await list.onclick({ target: { closest: () => ({ dataset: { id: 'token-goblin' } }) } });
assert.equal(goblinEntry.card.id, 'token-goblin');

const treasure = { name: 'Treasure', layout: 'token', type_line: 'Token Artifact — Treasure', oracle_id: 'treasure-oracle' };
const treasureEntry = { name: 'Treasure', card: treasure, section: 'tokens' };
assert.equal(vm.runInContext('printingQueries', context)(treasureEntry)[0], 'oracleid:treasure-oracle t:token');
responses = [{ status: 404 }, { status: 200, body: { data: [{ ...tokenGoblin, id: 'treasure-print', name: 'Treasure', type_line: treasure.type_line }], has_more: true, next_page: 'https://api.scryfall.com/cards/search?page=2' } }, { status: 200, body: { data: [{ ...tokenGoblin, id: 'treasure-next-page', name: 'Treasure', type_line: treasure.type_line }], has_more: false } }];
await vm.runInContext('loadPrintings', context)(treasureEntry);
assert.equal(calls.at(-1).searchParams.get('q'), '!"Treasure" t:token');
assert(box.more, 'Further token printings need a load-more control');
box.more.onclick();
await new Promise(resolve => setImmediate(resolve));
assert(list.html.includes('data-id="treasure-next-page"'), 'Next page of token printings was not shown');
assert(!box.innerHTML.includes('failed'), 'Token search did not recover from an unavailable Oracle search');

const emblemEntry = { name: 'Chandra Emblem', card: { name: 'Chandra Emblem', layout: 'emblem' }, section: 'tokens' };
assert.equal(vm.runInContext('printingQueries', context)(emblemEntry)[0], '!"Chandra Emblem" t:emblem');
assert.equal(vm.runInContext('printingKind', context)({ name: 'Brisela', section: 'tokens', card: { layout: 'meld' } }), '');
assert.equal(vm.runInContext('printingKind', context)({ name: 'Goblin', section: 'deck', card: goblin }), '');
console.log('Token printing search checks passed.');
