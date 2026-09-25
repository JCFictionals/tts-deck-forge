const TTS_STANDARD_CARD_BACK = "https://steamusercontent-a.akamaihd.net/ugc/1647720103762682461/35EF6E87970E2A5D6581E7D96A99F8A575B7A15F/";
const TTS_HEADERS = new Map([
  ["commander", "commander"], ["commanders", "commander"], ["command zone", "commander"], ["background", "commander"],
  ["oathbreaker", "oathbreaker"], ["oathbreakers", "oathbreaker"], ["signature spell", "signature"], ["signature spells", "signature"],
  ["mainboard", "deck"], ["deck", "deck"], ["sideboard", "sideboard"], ["tokens", "tokens"],
  ["token", "tokens"], ["maybeboard", "maybeboard"]
]);

function ttsNormalizeName(value) {
  return String(value || "").toLowerCase().replace(/[’']/g, "'").replace(/\s+/g, " ").trim();
}

function ttsParseDecklist(text) {
  let section = "deck";
  const entries = [];
  const ignored = [];
  String(text || "").split(/\r?\n/).forEach((raw, index) => {
    const line = raw.trim();
    if (!line || /^\/\//.test(line) || /^#/.test(line)) return;
    const normalized = line.replace(/:$/, "").replace(/\s*\(\d+\)$/, "").toLowerCase();
    if (TTS_HEADERS.has(normalized)) { section = TTS_HEADERS.get(normalized); return; }
    const match = line.match(/^\s*(\d+)\s*x?\s+(.+?)(?:\s+\(([A-Za-z0-9]+)\)\s+([^\s]+))?\s*$/i);
    if (!match) { ignored.push({ line: index + 1, raw }); return; }
    let name = match[2].trim();
    let set = match[3]?.toLowerCase() || "";
    let collector = match[4] || "";
    const suffix = name.match(/^(.*?)\s+\(([A-Za-z0-9]+)\)\s+([^\s]+)$/);
    if (suffix) { name = suffix[1].trim(); set = suffix[2].toLowerCase(); collector = suffix[3]; }
    entries.push({ qty: Number(match[1]), name, set, collector, section, line: index + 1 });
  });
  return { entries, ignored };
}

async function ttsScryfallCollection(identifiers) {
  const results = [];
  const missing = [];
  for (let i = 0; i < identifiers.length; i += 75) {
    const chunk = identifiers.slice(i, i + 75);
    const result = await fetch("https://api.scryfall.com/cards/collection", {
      method: "POST",
      headers: { "Content-Type": "application/json", "Accept": "application/json", "User-Agent": "CommanderTTSDeckForge/1.0" },
      body: JSON.stringify({ identifiers: chunk })
    });
    if (!result.ok) throw new Error("Scryfall card lookup returned " + result.status + ".");
    const payload = await result.json();
    results.push(...(payload.data || []));
    missing.push(...(payload.not_found || []));
  }
  return { results, missing };
}

async function ttsResolveEntries(entries) {
  const unique = [...new Map(entries.map((entry) => [ttsNormalizeName(entry.name) + "|" + entry.set + "|" + entry.collector, entry])).values()];
  const identifiers = unique.map((entry) => entry.set && entry.collector ? { set: entry.set, collector_number: entry.collector } : { name: entry.name });
  const first = await ttsScryfallCollection(identifiers);
  const byPrinting = new Map();
  const byName = new Map();
  first.results.forEach((card) => {
    byPrinting.set(String(card.set).toLowerCase() + "|" + String(card.collector_number), card);
    byName.set(ttsNormalizeName(card.name), card);
    byName.set(ttsNormalizeName(String(card.name).split(" // ")[0]), card);
  });
  const fallbackEntries = [];
  unique.forEach((entry) => {
    const card = entry.set ? byPrinting.get(entry.set + "|" + entry.collector) : byName.get(ttsNormalizeName(entry.name));
    const nameMatches = card && (ttsNormalizeName(card.name) === ttsNormalizeName(entry.name) || ttsNormalizeName(String(card.name).split(" // ")[0]) === ttsNormalizeName(String(entry.name).split(" // ")[0]));
    if (!card || !nameMatches) fallbackEntries.push(entry);
  });
  if (fallbackEntries.length) {
    const fallback = await ttsScryfallCollection(fallbackEntries.map((entry) => ({ name: entry.name })));
    fallback.results.forEach((card) => {
      byName.set(ttsNormalizeName(card.name), card);
      byName.set(ttsNormalizeName(String(card.name).split(" // ")[0]), card);
    });
  }
  const warnings = [];
  const unresolved = [];
  const resolved = entries.map((entry) => {
    let card = entry.set ? byPrinting.get(entry.set + "|" + entry.collector) : byName.get(ttsNormalizeName(entry.name));
    let mode = entry.set ? "exact" : "name";
    const nameMatches = card && (ttsNormalizeName(card.name) === ttsNormalizeName(entry.name) || ttsNormalizeName(String(card.name).split(" // ")[0]) === ttsNormalizeName(String(entry.name).split(" // ")[0]));
    if (!card || !nameMatches) {
      card = byName.get(ttsNormalizeName(entry.name)) || byName.get(ttsNormalizeName(String(entry.name).split(" // ")[0]));
      mode = "fallback";
    }
    if (!card) { unresolved.push(entry.name + (entry.set ? " (" + entry.set.toUpperCase() + ") " + entry.collector : "")); return null; }
    if (mode === "fallback") warnings.push(entry.name + ": requested printing was unavailable; used " + String(card.set).toUpperCase() + " " + card.collector_number + ".");
    return { ...entry, card, mode };
  }).filter(Boolean);
  return { resolved, unresolved, warnings };
}

function ttsImageSource(card, face) {
  return card?.card_faces?.[face]?.image_uris?.normal || card?.image_uris?.normal || "";
}

function ttsImageUrl(source) {
  return source ? `https://wsrv.nl/?url=${encodeURIComponent(source)}` : "";
}

function ttsNormalizeCardBack(value) {
  const raw = String(value || TTS_STANDARD_CARD_BACK).trim() || TTS_STANDARD_CARD_BACK;
  try {
    const parsed = new URL(raw);
    if (["dropbox.com", "www.dropbox.com"].includes(parsed.hostname.toLowerCase()) && parsed.searchParams.get("dl") === "0") {
      parsed.searchParams.set("dl", "1");
    }
    return parsed.href;
  } catch { return TTS_STANDARD_CARD_BACK; }
}

function ttsCardIdentity(card) {
  const oracleId = String(card?.oracle_id || "");
  const tokenIds = [...new Set((card?.all_parts || [])
    .filter((part) => ["token", "emblem"].includes(part.component) && part.id)
    .map((part) => String(part.id)))];
  const memo = oracleId + (tokenIds.length ? "|tokens:" + tokenIds.join(",") : "");
  const tags = oracleId ? ["oid:" + oracleId] : [];
  const footer = oracleId ? "[mtg:oid=" + oracleId + (tokenIds.length ? ";tok=" + tokenIds.join(",") : "") + "]" : "";
  return { memo, tags, footer };
}

function ttsCardFace(card, faceIndex = 0) {
  return card?.card_faces?.[faceIndex] || card || {};
}

function ttsCardEncoderNickname(card, faceIndex = 0, displayName = "") {
  const face = ttsCardFace(card, faceIndex);
  const name = String(displayName || face.name || card?.name || "Card").replaceAll('"', "'");
  const typeLine = String(face.type_line || card?.type_line || "");
  const manaValue = face.cmc ?? card?.cmc ?? 0;
  return [name, typeLine, String(manaValue) + "CMC"].filter(Boolean).join("\n");
}

function ttsCardEncoderDescription(card, faceIndex = 0) {
  const face = ttsCardFace(card, faceIndex);
  const identity = ttsCardIdentity(card);
  const oracle = String(face.oracle_text ?? card?.oracle_text ?? "").replaceAll('"', "'");
  let stats = "";
  if (face.power != null && face.toughness != null) stats = String(face.power) + "/" + String(face.toughness);
  else if (face.loyalty != null) stats = String(face.loyalty);
  else if (face.defense != null) stats = String(face.defense);
  return [oracle, identity.footer, stats ? "[b]" + stats + "[/b]" : ""].filter(Boolean).join("\n");
}

function ttsCardNeedsEncoderRebuild(card) {
  const faces = card?.card_faces?.length ? card.card_faces : [card];
  return faces.some((face) => face?.loyalty != null || /\bPlaneswalker\b/.test(String(face?.type_line || "")));
}

async function ttsResolveTokens(entries, includeTokens = true) {
  const parts = [];
  const deckCardIds = new Set(entries.flatMap((entry) => [entry.card?.id, entry.card?.oracle_id]).filter(Boolean).map(String));
  entries.forEach((entry) => {
    (entry.card?.all_parts || []).filter((part) => (part.component === "meld_result" || (includeTokens && ["token", "emblem"].includes(part.component))) && part.uri).forEach((part) => parts.push(part.uri));
  });
  const unique = [...new Set(parts)].slice(0, 80);
  const cards = [];
  for (let i = 0; i < unique.length; i += 8) {
    const batch = await Promise.all(unique.slice(i, i + 8).map(async (uri) => {
      try {
        const result = await fetch(uri, { headers: { "Accept": "application/json", "User-Agent": "CommanderTTSDeckForge/1.0" } });
        return result.ok ? await result.json() : null;
      } catch { return null; }
    }));
    cards.push(...batch.filter(Boolean));
  }
  return [...new Map(cards.map((card) => [card.oracle_id || card.id, card])).values()]
    .filter((card) => !deckCardIds.has(String(card.id || "")) && !deckCardIds.has(String(card.oracle_id || "")))
    .map((card) => ({ qty: 1, name: card.name, section: "tokens", card, mode: "token" }));
}

function ttsGuid() {
  return Math.floor(Math.random() * 0xffffff).toString(16).padStart(6, "0");
}

function ttsTransform(x, y, z, rotZ) {
  return { posX: x, posY: y, posZ: z, rotX: 0, rotY: 0, rotZ: rotZ || 0, scaleX: 1, scaleY: 1, scaleZ: 1 };
}

function ttsCardObject(entry, key, backUrl, position, faceUp, nickname) {
  const card = entry.card;
  const identity = ttsCardIdentity(card);
  const frontUrl = ttsImageUrl(ttsImageSource(card, 0));
  const customDeck = {};
  customDeck[String(key)] = { FaceURL: frontUrl, BackURL: backUrl, NumWidth: 1, NumHeight: 1, BackIsHidden: true, UniqueBack: false, Type: 0 };
  const object = {
    Name: "CardCustom", Transform: ttsTransform(position.x, position.y, position.z, faceUp ? 0 : 180),
    Nickname: ttsCardEncoderNickname(card, 0, nickname), Description: ttsCardEncoderDescription(card, 0),
    Memo: identity.memo, Tags: identity.tags,
    GMNotes: "", AltLookAngle: { x: 0, y: 0, z: 0 }, ColorDiffuse: { r: 1, g: 1, b: 1 },
    LayoutGroupSortIndex: 0, Value: 0, Locked: false, Grid: true, Snap: true, IgnoreFoW: false,
    MeasureMovement: false, DragSelectable: true, Autoraise: true, Sticky: true, Tooltip: true,
    GridProjection: false, HideWhenFaceDown: true, Hands: true, CardID: key * 100, SidewaysCard: false,
    CustomDeck: customDeck, LuaScript: "", LuaScriptState: "", XmlUI: "", GUID: ttsGuid()
  };
  const backFace = ttsImageSource(card, 1);
  if (backFace) {
    const backKey = key + 1;
    const backCustom = {};
    backCustom[String(backKey)] = { FaceURL: ttsImageUrl(backFace), BackURL: backUrl, NumWidth: 1, NumHeight: 1, BackIsHidden: true, UniqueBack: false, Type: 0 };
    object.States = {
      "2": { ...object, Transform: ttsTransform(position.x, position.y, position.z, faceUp ? 0 : 180), Nickname: ttsCardEncoderNickname(card, 1),
        Description: ttsCardEncoderDescription(card, 1), CardID: backKey * 100,
        CustomDeck: backCustom, States: undefined, GUID: ttsGuid() }
    };
  }
  return { object, nextKey: key + (backFace ? 2 : 1) };
}

function ttsDeckObject(entries, name, backUrl, position, faceUp, startKey) {
  const contained = [];
  const deckIds = [];
  const customDeck = {};
  let key = startKey;
  entries.forEach((entry) => {
    for (let q = 0; q < entry.qty; q += 1) {
      const made = ttsCardObject(entry, key, backUrl, position, faceUp);
      contained.push(made.object);
      deckIds.push(made.object.CardID);
      Object.assign(customDeck, made.object.CustomDeck);
      if (made.object.States) Object.values(made.object.States).forEach((state) => Object.assign(customDeck, state.CustomDeck || {}));
      key = made.nextKey;
    }
  });
  return {
    object: { Name: "DeckCustom", Transform: ttsTransform(position.x, position.y, position.z, faceUp ? 0 : 180), Nickname: name,
      Description: "Generated in Tabletop Simulator by TTS Deck Forge", GMNotes: "", AltLookAngle: { x: 0, y: 0, z: 0 },
      ColorDiffuse: { r: 1, g: 1, b: 1 }, LayoutGroupSortIndex: 0, Value: 0, Locked: false, Grid: true, Snap: true,
      IgnoreFoW: false, MeasureMovement: false, DragSelectable: true, Autoraise: true, Sticky: true, Tooltip: true,
      GridProjection: false, HideWhenFaceDown: true, Hands: true, SidewaysCard: false, DeckIDs: deckIds,
      CustomDeck: customDeck, LuaScript: "", LuaScriptState: "", XmlUI: "", ContainedObjects: contained, GUID: ttsGuid() },
    nextKey: key
  };
}

function ttsCardSpec(entry, nickname) {
  const card = entry.card;
  const backFace = ttsImageSource(card, 1);
  const identity = ttsCardIdentity(card);
  return {
    nickname: ttsCardEncoderNickname(card, 0, nickname),
    description: ttsCardEncoderDescription(card, 0),
    memo: identity.memo,
    tags: identity.tags,
    faceUrl: ttsImageUrl(ttsImageSource(card, 0)),
    backFaceUrl: backFace ? ttsImageUrl(backFace) : "",
    backNickname: backFace ? ttsCardEncoderNickname(card, 1) : "",
    backDescription: backFace ? ttsCardEncoderDescription(card, 1) : "",
    encoderRebuild: ttsCardNeedsEncoderRebuild(card)
  };
}

function ttsExpandSpecs(entries, nicknamePrefix) {
  const specs = [];
  entries.forEach((entry) => {
    for (let q = 0; q < entry.qty; q += 1) {
      specs.push(ttsCardSpec(entry, nicknamePrefix ? nicknamePrefix + entry.card.name : entry.card.name));
    }
  });
  return specs;
}

function ttsIsOathbreaker(format) { return format === "oathbreaker" || format === "oathbreaker100"; }
function ttsOathbreakerSize(format) { return format === "oathbreaker100" ? 100 : 60; }

function ttsBuildCardPlan(entries, tokens, cardBack, format, includeSideboard, includeMaybeboard) {
  const included = (entry) => entry.section === "deck" || (format === "commander" && ((entry.section === "sideboard" && includeSideboard) || (entry.section === "maybeboard" && includeMaybeboard)));
  const commanders = entries.filter((entry) => entry.section === "commander");
  const oathbreakers = entries.filter((entry) => entry.section === "oathbreaker" || (ttsIsOathbreaker(format) && entry.section === "commander"));
  const library = entries.filter(included);
  return {
    cardBackUrl: cardBack,
    format,
    ...(format === "oathbreaker100" ? { startingLife: 40 } : {}),
    library: ttsExpandSpecs(library),
    commanders: format === "commander" ? ttsExpandSpecs(commanders, "Commander — ") : [],
    oathbreakers: ttsIsOathbreaker(format) ? ttsExpandSpecs(oathbreakers, "Oathbreaker — ") : [],
    signatureSpells: ttsIsOathbreaker(format) ? ttsExpandSpecs(entries.filter((entry) => entry.section === "signature"), "Signature Spell — ") : [],
    sideboard: format !== "commander" && !ttsIsOathbreaker(format) && includeSideboard ? ttsExpandSpecs(entries.filter((entry) => entry.section === "sideboard")) : [],
    maybeboard: format !== "commander" && !ttsIsOathbreaker(format) && includeMaybeboard ? ttsExpandSpecs(entries.filter((entry) => entry.section === "maybeboard")) : [],
    tokens: ttsExpandSpecs(tokens)
  };
}

function ttsOathbreakerErrors(entries, format) {
  const errors = [];
  const leaders = entries.filter((entry) => entry.section === "oathbreaker" || entry.section === "commander");
  const spells = entries.filter((entry) => entry.section === "signature");
  const main = entries.filter((entry) => entry.section === "deck");
  const total = [...leaders, ...spells, ...main].reduce((sum, entry) => sum + entry.qty, 0);
  const required = ttsOathbreakerSize(format);
  if (total !== required) errors.push("Oathbreaker requires exactly " + required + " cards including the Oathbreaker and Signature Spell; found " + total + ".");
  if (leaders.length < 1 || leaders.length > 2 || leaders.some((entry) => entry.qty !== 1)) errors.push("Use one Oathbreaker, or two partners, with one copy of each.");
  if (spells.length !== leaders.length || spells.some((entry) => entry.qty !== 1)) errors.push("Provide one Signature Spell for each Oathbreaker.");
  if (leaders.length === 2 && leaders.some((entry) => !/(?:^|\n)Partner(?:\s|\n|$)/i.test(entry.card.oracle_text || ""))) errors.push("Two Oathbreakers must both have Partner.");
  if (entries.some((entry) => entry.section === "sideboard")) errors.push("Oathbreaker has no sideboard.");
  leaders.forEach((entry) => { if (!/\bPlaneswalker\b/i.test(entry.card.card_faces?.[0]?.type_line || entry.card.type_line || "")) errors.push(entry.card.name + " must be a planeswalker to be an Oathbreaker."); });
  spells.forEach((entry) => { if (!/\b(Instant|Sorcery)\b/i.test(entry.card.card_faces?.[0]?.type_line || entry.card.type_line || "")) errors.push(entry.card.name + " must be an instant or sorcery Signature Spell."); });
  const identity = new Set(leaders.flatMap((entry) => entry.card.color_identity || []));
  [...leaders, ...spells, ...main].forEach((entry) => {
    if (!Array.isArray(entry.card.color_identity)) errors.push("Could not verify color identity for " + entry.card.name + ".");
    else if (entry.card.color_identity.some((color) => !identity.has(color))) errors.push(entry.card.name + " is outside the Oathbreaker's color identity.");
    const status = entry.card.legalities?.oathbreaker;
    if (!status) errors.push("Could not verify Oathbreaker legality for " + entry.card.name + ".");
    else if (status !== "legal" && status !== "restricted") errors.push(entry.card.name + " is " + status.replace("_", " ") + " in Oathbreaker.");
  });
  spells.forEach((spell, index) => { if (leaders[index] && Array.isArray(spell.card.color_identity) && spell.card.color_identity.some((color) => !(leaders[index].card.color_identity || []).includes(color))) errors.push(spell.card.name + " is outside " + leaders[index].card.name + "'s color identity."); });
  const counts = new Map();
  [...leaders, ...spells, ...main].forEach((entry) => { const name = ttsNormalizeName(entry.card.name); counts.set(name, { card: entry.card, qty: (counts.get(name)?.qty || 0) + entry.qty }); });
  counts.forEach(({ card, qty }) => { const basic = /\bBasic\b.*\bLand\b/i.test((card.type_line || "").split(/[—-]/, 1)[0]); if (qty > 1 && !basic) errors.push(card.name + ": Oathbreaker allows one copy across all deck zones."); });
  return errors;
}

function ttsConstructedErrors(entries, format) {
  const errors = [];
  const main = entries.filter((entry) => entry.section === "deck").reduce((sum, entry) => sum + entry.qty, 0);
  const side = entries.filter((entry) => entry.section === "sideboard").reduce((sum, entry) => sum + entry.qty, 0);
  if (entries.some((entry) => entry.section === "commander")) errors.push("A Commander section is not allowed in this constructed format.");
  if (entries.some((entry) => entry.section === "oathbreaker" || entry.section === "signature")) errors.push("Oathbreaker and Signature Spell sections require Oathbreaker format.");
  if (main < 60) errors.push("The main deck needs at least 60 cards; it has " + main + ".");
  if (side > 15) errors.push("The sideboard can contain no more than 15 cards; it has " + side + ".");
  const copies = new Map();
  entries.filter((entry) => entry.section === "deck" || entry.section === "sideboard").forEach((entry) => {
    const key = entry.card.oracle_id || ttsNormalizeName(entry.card.name);
    const current = copies.get(key);
    copies.set(key, { card: entry.card, qty: (current?.qty || 0) + entry.qty });
  });
  copies.forEach(({ card, qty }) => {
    const basic = /\bBasic\b.*\bLand\b/i.test((card.type_line || "").split(/[—-]/, 1)[0]);
    const rule = card.oracle_text || "";
    const match = rule.match(/A deck can have up to (\d+|one|two|three|four|five|six|seven|eight|nine|ten) cards named/i);
    const words = { one: 1, two: 2, three: 3, four: 4, five: 5, six: 6, seven: 7, eight: 8, nine: 9, ten: 10 };
    const max = basic || /A deck can have any number of cards named/i.test(rule) ? Infinity : match ? Number(match[1]) || words[match[1].toLowerCase()] || 4 : 4;
    if (qty > max) errors.push(card.name + " has " + qty + " copies across the main deck and sideboard; maximum is " + max + ".");
    if (format !== "constructed") {
      const legality = card.legalities?.[format];
      if (!legality) errors.push("Could not verify " + format + " legality for " + card.name + ".");
      else if (legality === "restricted" && qty > 1) errors.push(card.name + " is restricted to one copy in " + format + ".");
      else if (legality !== "legal" && legality !== "restricted") errors.push(card.name + " is " + legality.replace("_", " ") + " in " + format + ".");
    }
  });
  return errors;
}

async function handleTtsImport(request) {
  let body;
  try { body = await request.json(); } catch { return json({ error: "The importer sent invalid JSON." }, 400); }
  if (!body || typeof body !== "object") return json({ error: "Importer request is missing." }, 400);
  let decklist = typeof body.decklist === "string" ? body.decklist : "";
  let deckName = typeof body.deckName === "string" ? body.deckName.trim().slice(0, 120) : "";
  let importedFormat = "";
  if (!decklist && typeof body.url === "string") {
    let deckUrl;
    try { deckUrl = new URL(body.url); } catch { return json({ error: "That is not a valid deck URL." }, 400); }
    const host = deckUrl.hostname.toLowerCase().replace(/^www\./, "");
    try {
      const imported = host === "moxfield.com" ? await importMoxfield(deckUrl) : host === "archidekt.com" ? await importArchidekt(deckUrl) : null;
      if (!imported) return json({ error: "Only public Archidekt and Moxfield URLs are supported." }, 400);
      decklist = imported.decklist;
      importedFormat = typeof imported.format === "string" ? imported.format.toLowerCase().replace(/[^a-z0-9]/g, "") : "";
      if (!deckName) deckName = imported.name;
    } catch (error) { return json({ error: error?.message || "Unable to import that deck URL." }, 502); }
  }
  if (!decklist || decklist.length > 50000) return json({ error: "Paste a decklist containing no more than 50,000 characters." }, 400);
  const parsed = ttsParseDecklist(decklist);
  if (!parsed.entries.length) return json({ error: "No readable card lines were found." }, 400);
  try {
    const resolution = await ttsResolveEntries(parsed.entries.filter((entry) => entry.section !== "tokens"));
    if (resolution.unresolved.length) return json({ error: "Some cards could not be resolved.", unresolved: resolution.unresolved, warnings: resolution.warnings }, 422);
    const supportedFormats = ["commander", "oathbreaker", "oathbreaker100", "constructed", "standard", "pioneer", "modern", "legacy", "vintage", "pauper"];
    const requestedFormat = typeof body.format === "string" ? body.format.toLowerCase() : importedFormat;
    const oathSections = parsed.entries.some((entry) => entry.section === "oathbreaker" || entry.section === "signature");
    const oathCardCount = parsed.entries.filter((entry) => ["deck", "oathbreaker", "commander", "signature"].includes(entry.section)).reduce((sum, entry) => sum + entry.qty, 0);
    const inferredOath = oathCardCount === 100 ? "oathbreaker100" : "oathbreaker";
    const format = requestedFormat === "oathbreaker" && oathCardCount === 100 && !body.format ? "oathbreaker100" : supportedFormats.includes(requestedFormat) ? requestedFormat : oathSections ? inferredOath : parsed.entries.some((entry) => entry.section === "commander") ? "commander" : "constructed";
    const commanders = resolution.resolved.filter((entry) => entry.section === "commander");
    if (format === "commander" && !commanders.length) return json({ error: "No commander was identified. Put it under a Commander heading." }, 422);
    if (format === "commander" && resolution.resolved.some((entry) => entry.section === "oathbreaker" || entry.section === "signature")) return json({ error: "Oathbreaker and Signature Spell sections require Oathbreaker format." }, 422);
    if (format !== "commander") {
      const errors = ttsIsOathbreaker(format) ? ttsOathbreakerErrors(resolution.resolved, format) : ttsConstructedErrors(resolution.resolved, format);
      if (errors.length) return json({ error: "This " + format + " deck did not pass format checks.", issues: errors }, 422);
    }
    const tokens = await ttsResolveTokens(resolution.resolved, body.includeTokens !== false);
    if (!deckName) deckName = resolution.resolved.find((entry) => entry.section === "oathbreaker" || entry.section === "commander")?.card.name || resolution.resolved.find((entry) => entry.section === "deck")?.card.name || "Imported Deck";
    const cardPlan = ttsBuildCardPlan(resolution.resolved, tokens, ttsNormalizeCardBack(body.cardBackUrl), format, format === "commander" ? body.includeSideboard === true : ttsIsOathbreaker(format) ? false : body.includeSideboard !== false, body.includeMaybeboard === true);
    const physicalCount = resolution.resolved.filter((entry) => entry.section === "commander" || entry.section === "deck" || (ttsIsOathbreaker(format) && ["oathbreaker", "signature"].includes(entry.section))).reduce((sum, entry) => sum + entry.qty, 0);
    const warnings = [...resolution.warnings];
    parsed.ignored.forEach((line) => warnings.push("Unread line " + line.line + ": " + line.raw));
    if (format === "commander" && physicalCount !== 100) warnings.push("Commander deck count is " + physicalCount + ", not 100.");
    if (format !== "commander" && !ttsIsOathbreaker(format) && physicalCount < 60) warnings.push("Constructed main deck contains " + physicalCount + " cards; minimum is 60.");
    const sideboardCount = resolution.resolved.filter((entry) => entry.section === "sideboard").reduce((sum, entry) => sum + entry.qty, 0);
    if (format !== "commander" && !ttsIsOathbreaker(format) && sideboardCount > 15) warnings.push("Sideboard contains " + sideboardCount + " cards; maximum is 15.");
    return json({ ok: true, deckName, cardPlan, summary: { physicalCount, commanderCount: commanders.reduce((sum, entry) => sum + entry.qty, 0), oathbreakerCount: cardPlan.oathbreakers.length, signatureSpellCount: cardPlan.signatureSpells.length, sideboardCount, tokenCount: tokens.length, ...(format === "oathbreaker100" ? { startingLife: 40 } : {}) }, warnings });
  } catch (error) {
    return json({ error: error?.name === "AbortError" ? "Card lookup timed out." : (error?.message || "The deck could not be forged.") }, 502);
  }
}
