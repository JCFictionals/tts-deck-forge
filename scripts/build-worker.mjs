import { mkdir, readFile, writeFile } from "node:fs/promises";

const html = await readFile(new URL("../dist/index.html", import.meta.url), "utf8");
const css = await readFile(new URL("../dist/styles.css", import.meta.url), "utf8");
const app = await readFile(new URL("../dist/app.js", import.meta.url), "utf8");
const ttsApi = await readFile(new URL("./tts-import-api.js", import.meta.url), "utf8");
const ttsImporter = await readFile(new URL("../dist/downloads/Commander_TTS_Deck_Forge_Importer.json", import.meta.url), "utf8");
const forgeConsolePng = (await readFile(new URL("../dist/downloads/forge-console-v16.png", import.meta.url))).toString("base64");

const runtime = String.raw`
const MOXFIELD_ENDPOINTS = [
  "https://api2.moxfield.com/v3/decks/all/",
  "https://api2.moxfield.com/v2/decks/all/",
  "https://api.moxfield.com/v2/decks/all/"
];

function response(body, type, status = 200, cache = "no-store") {
  return new Response(body, { status, headers: {
    "Content-Type": type,
    "Cache-Control": cache,
    "X-Content-Type-Options": "nosniff",
    "Referrer-Policy": "strict-origin-when-cross-origin"
  }});
}

function json(payload, status = 200) {
  return response(JSON.stringify(payload), "application/json; charset=utf-8", status);
}

function cardLine(entry, fallbackName = "") {
  const card = entry?.card || entry || {};
  const quantity = Number(entry?.quantity ?? entry?.qty ?? card.quantity ?? 1) || 1;
  const name = card.name || card.cardName || card.displayName || card.oracleCard?.name || card.oracle_card?.name || fallbackName;
  if (!name) return "";
  const set = card.set || card.setCode || card.edition?.editioncode || card.edition?.editionCode || "";
  const collector = card.cn || card.collectorNumber || card.collector_number || "";
  return String(quantity) + "x " + name + (set && collector ? " (" + String(set).toUpperCase() + ") " + collector : "");
}

function boardLines(board) {
  const cards = board?.cards || board || {};
  if (Array.isArray(cards)) return cards.map((entry) => cardLine(entry)).filter(Boolean);
  return Object.entries(cards).map(([name, entry]) => cardLine(entry, name)).filter(Boolean);
}

function sectionsToText(zones) {
  return [["Oathbreaker", zones.oathbreaker], ["Signature Spell", zones.signature], ["Commander", zones.commander], ["Mainboard", zones.deck], ["Sideboard", zones.sideboard], ["Maybeboard", zones.maybeboard]]
    .filter(([, lines]) => lines?.length)
    .map(([label, lines]) => label + "\n" + lines.join("\n"))
    .join("\n\n");
}

function normalizeMoxfield(payload) {
  const boards = payload.boards || payload;
  const format = typeof payload.format === "string" ? payload.format : payload.format?.name || "";
  const oath = /oathbreaker/i.test(format);
  const zones = {
    oathbreaker: boardLines(boards.oathbreakers || boards.oathbreaker || payload.oathbreakers || (oath ? boards.commanders || payload.commanders : null)),
    signature: boardLines(boards.signatureSpells || boards.signatureSpell || payload.signatureSpells || payload.signatureSpell),
    commander: oath ? [] : boardLines(boards.commanders || payload.commanders),
    deck: boardLines(boards.mainboard || payload.mainboard),
    sideboard: boardLines(boards.sideboard || payload.sideboard),
    maybeboard: boardLines(boards.maybeboard || payload.maybeboard)
  };
  return { name: payload.name || "Imported Moxfield Deck", decklist: sectionsToText(zones), format, source: "Moxfield" };
}

function normalizeArchidekt(payload) {
  const categoryState = new Map((payload.categories || []).map((category) => [category.name, category.includedInDeck !== false]));
  const format = typeof payload.format === "string" ? payload.format : payload.format?.name || "";
  const zones = { oathbreaker: [], signature: [], commander: [], deck: [], sideboard: [], maybeboard: [] };
  for (const entry of payload.cards || []) {
    const categories = entry.categories || [];
    const joined = categories.join(" ");
    let zone = /signature spell/i.test(joined) ? "signature" : /oathbreaker/i.test(joined) ? "oathbreaker" : /commander|command zone/i.test(joined) ? (/oathbreaker/i.test(format) ? "oathbreaker" : "commander") : /sideboard/i.test(joined) ? "sideboard" : /maybeboard|considering/i.test(joined) ? "maybeboard" : "deck";
    if (zone === "deck" && categories.length && categoryState.size && !categories.some((name) => categoryState.get(name) !== false)) continue;
    const line = cardLine(entry);
    if (line) zones[zone].push(line);
  }
  return { name: payload.name || "Imported Archidekt Deck", decklist: sectionsToText(zones), format, source: "Archidekt" };
}

async function fetchJson(url, headers = {}) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 15000);
  try {
    const result = await fetch(url, { headers, redirect: "follow", signal: controller.signal });
    if (!result.ok) throw new Error("Upstream returned " + result.status + ".");
    const type = result.headers.get("content-type") || "";
    if (!type.includes("json")) throw new Error("The deck service did not return deck data.");
    return await result.json();
  } finally {
    clearTimeout(timeout);
  }
}

async function importMoxfield(deckUrl) {
  const id = deckUrl.pathname.match(/\/decks\/([A-Za-z0-9_-]+)/i)?.[1];
  if (!id) throw new Error("This Moxfield URL does not contain a deck ID.");
  let lastError;
  for (const base of MOXFIELD_ENDPOINTS) {
    try {
      const payload = await fetchJson(base + encodeURIComponent(id), {
        "Accept": "application/json, text/plain, */*",
        "Accept-Language": "en-US,en;q=0.9",
        "Origin": "https://www.moxfield.com",
        "Referer": "https://www.moxfield.com/decks/" + id,
        "User-Agent": "Mozilla/5.0 (compatible; CommanderTTSDeckForge/1.0)"
      });
      const result = normalizeMoxfield(payload);
      if (result.decklist) return result;
    } catch (error) {
      lastError = error;
    }
  }
  throw new Error("Unable to load this public Moxfield deck. " + (lastError?.message || ""));
}

async function importArchidekt(deckUrl) {
  const id = deckUrl.pathname.match(/\/decks\/(\d+)/i)?.[1];
  if (!id) throw new Error("This Archidekt URL does not contain a numeric deck ID.");
  const payload = await fetchJson("https://archidekt.com/api/decks/" + encodeURIComponent(id) + "/", { "Accept": "application/json" });
  const result = normalizeArchidekt(payload);
  if (!result.decklist) throw new Error("This Archidekt deck contained no importable cards.");
  return result;
}

async function handleImport(request) {
  let body;
  try { body = await request.json(); } catch { return json({ error: "Provide a valid deck URL." }, 400); }
  if (typeof body?.url !== "string" || body.url.length > 500) return json({ error: "Provide a valid deck URL." }, 400);
  let deckUrl;
  try { deckUrl = new URL(body.url); } catch { return json({ error: "That is not a valid URL." }, 400); }
  if (deckUrl.protocol !== "https:") return json({ error: "Deck URLs must use HTTPS." }, 400);
  const host = deckUrl.hostname.toLowerCase().replace(/^www\./, "");
  try {
    if (host === "moxfield.com") return json(await importMoxfield(deckUrl));
    if (host === "archidekt.com") return json(await importArchidekt(deckUrl));
    return json({ error: "Only public Archidekt and Moxfield deck URLs are supported right now." }, 400);
  } catch (error) {
    return json({ error: error?.name === "AbortError" ? "The deck service took too long to respond." : (error?.message || "Unable to import this deck URL.") }, 502);
  }
}

${ttsApi}

export default {
  async fetch(request) {
    const url = new URL(request.url);
    if (url.pathname === "/api/import-deck") {
      if (request.method !== "POST") return json({ error: "Method not allowed." }, 405);
      return handleImport(request);
    }
    if (url.pathname === "/api/tts-import") {
      if (request.method !== "POST") return json({ error: "Method not allowed." }, 405);
      return handleTtsImport(request);
    }
    if (url.pathname === "/downloads/Commander_TTS_Deck_Forge_Importer.json") {
      if (request.method !== "GET" && request.method !== "HEAD") return response("Method not allowed", "text/plain; charset=utf-8", 405);
      return new Response(request.method === "HEAD" ? null : TTS_IMPORTER, { status: 200, headers: {
        "Content-Type": "application/json; charset=utf-8",
        "Content-Disposition": "attachment; filename=Commander_TTS_Deck_Forge_Importer.json",
        "Cache-Control": "public, max-age=300",
        "X-Content-Type-Options": "nosniff"
      }});
    }
    if (url.pathname === "/downloads/forge-console.png" || url.pathname === "/downloads/forge-console-v16.png") {
      if (request.method !== "GET" && request.method !== "HEAD") return response("Method not allowed", "text/plain; charset=utf-8", 405);
      const bytes = Uint8Array.from(atob(FORGE_CONSOLE_PNG), (character) => character.charCodeAt(0));
      return new Response(request.method === "HEAD" ? null : bytes, { status: 200, headers: {
        "Content-Type": "image/png", "Cache-Control": "public, max-age=86400, immutable", "X-Content-Type-Options": "nosniff"
      }});
    }
    if (request.method !== "GET" && request.method !== "HEAD") return response("Method not allowed", "text/plain; charset=utf-8", 405);
    const head = request.method === "HEAD";
    if (url.pathname === "/" || url.pathname === "/index.html") return response(head ? null : INDEX_HTML, "text/html; charset=utf-8");
    if (url.pathname === "/styles.css") return response(head ? null : STYLES_CSS, "text/css; charset=utf-8", 200, "public, max-age=300");
    if (url.pathname === "/app.js") return response(head ? null : APP_JS, "text/javascript; charset=utf-8", 200, "public, max-age=300");
    return response("Not found", "text/plain; charset=utf-8", 404);
  }
};
`;

const worker = `const INDEX_HTML = ${JSON.stringify(html)};\nconst STYLES_CSS = ${JSON.stringify(css)};\nconst APP_JS = ${JSON.stringify(app)};\nconst TTS_IMPORTER = ${JSON.stringify(ttsImporter)};\nconst FORGE_CONSOLE_PNG = ${JSON.stringify(forgeConsolePng)};\n${runtime}`;
await mkdir(new URL("../dist/server/", import.meta.url), { recursive: true });
await writeFile(new URL("../dist/server/index.js", import.meta.url), worker);
