import worker from "../dist/server/index.js";
import { readFile } from "node:fs/promises";

const commander = {
  id: "11111111-1111-4111-8111-111111111111", oracle_id: "22222222-2222-4222-8222-222222222222", name: "Elspeth, Sun's Champion", set: "ths", collector_number: "9", cmc: 6,
  image_uris: { normal: "https://cards.scryfall.io/normal/front/c/m/cmd.jpg" }, type_line: "Legendary Planeswalker — Elspeth", loyalty: "4",
  oracle_text: "+1: Create three 1/1 white Soldier creature tokens.\n−3: Destroy all creatures with power 4 or greater.\n−7: You get an emblem with ‘Creatures you control get +2/+2 and have flying.’",
  all_parts: [{ id: "33333333-3333-4333-8333-333333333333", component: "token", name: "Soldier", uri: "https://api.scryfall.com/cards/33333333-3333-4333-8333-333333333333" }]
};
const forest = {
  id: "44444444-4444-4444-8444-444444444444", oracle_id: "55555555-5555-4555-8555-555555555555", name: "Forest", set: "fdn", collector_number: "281",
  image_uris: { normal: "https://cards.scryfall.io/normal/front/f/o/forest.jpg" }, type_line: "Basic Land — Forest", color_identity: ["G"], legalities: { modern: "legal", oathbreaker: "legal" },
  all_parts: []
};
const oathbreaker = {
  id: "dddddddd-dddd-4ddd-8ddd-dddddddddddd", oracle_id: "eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee", name: "Nissa, Test Walker", set: "tst", collector_number: "1", cmc: 4,
  image_uris: { normal: "https://cards.scryfall.io/normal/front/n/i/nissa.jpg" }, type_line: "Legendary Planeswalker — Nissa", color_identity: ["G"], legalities: { oathbreaker: "legal" }, loyalty: "3", all_parts: []
};
const signature = {
  id: "ffffffff-ffff-4fff-8fff-ffffffffffff", oracle_id: "10101010-1010-4010-8010-101010101010", name: "Giant Growth", set: "tst", collector_number: "2", cmc: 1,
  image_uris: { normal: "https://cards.scryfall.io/normal/front/g/r/growth.jpg" }, type_line: "Instant", color_identity: ["G"], legalities: { oathbreaker: "legal" }, all_parts: []
};
const elemental = {
  id: "33333333-3333-4333-8333-333333333333", oracle_id: "66666666-6666-4666-8666-666666666666", name: "Soldier", set: "tths", collector_number: "1",
  image_uris: { normal: "https://cards.scryfall.io/normal/front/e/l/elemental.jpg" }, type_line: "Token Creature — Soldier", all_parts: []
};
const meldResult = {
  id: "77777777-7777-4777-8777-777777777777", oracle_id: "88888888-8888-4888-8888-888888888888", name: "Brisela, Voice of Nightmares", set: "emn", collector_number: "15b", cmc: 11,
  image_uris: { normal: "https://cards.scryfall.io/normal/front/b/r/brisela.jpg" }, type_line: "Legendary Creature — Eldrazi Angel", power: "9", toughness: "10", all_parts: []
};
const gisela = {
  id: "99999999-9999-4999-8999-999999999999", oracle_id: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa", name: "Gisela, the Broken Blade", set: "emn", collector_number: "28", cmc: 4,
  image_uris: { normal: "https://cards.scryfall.io/normal/front/g/i/gisela.jpg" }, type_line: "Legendary Creature — Angel Horror",
  all_parts: [{ id: meldResult.id, component: "meld_result", name: meldResult.name, uri: "https://api.scryfall.com/cards/" + meldResult.id }]
};
const modalWalker = {
  id: "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb", oracle_id: "cccccccc-cccc-4ccc-8ccc-cccccccccccc", name: "Mila, Crafty Companion // Lukka, Wayward Bonder", set: "stx", collector_number: "153", cmc: 3, layout: "modal_dfc",
  card_faces: [
    { name: "Mila, Crafty Companion", type_line: "Legendary Creature — Fox", oracle_text: "Whenever an opponent attacks one or more planeswalkers you control, put a loyalty counter on each planeswalker you control.", image_uris: { normal: "https://cards.scryfall.io/normal/front/m/i/mila.jpg" } },
    { name: "Lukka, Wayward Bonder", type_line: "Legendary Planeswalker — Lukka", oracle_text: "+1: You may discard a card. If you do, draw a card.", loyalty: "5", image_uris: { normal: "https://cards.scryfall.io/normal/back/l/u/lukka.jpg" } }
  ], all_parts: []
};

const nativeFetch = globalThis.fetch;
globalThis.fetch = async (input, init = {}) => {
  const url = String(input);
  if (url === "https://api.scryfall.com/cards/collection") {
    const requested = JSON.parse(init.body).identifiers;
    const data = requested.map((identifier) => identifier.name === "Forest" ? forest : identifier.name === oathbreaker.name ? oathbreaker : identifier.name === signature.name ? signature : identifier.set === "emn" ? gisela : identifier.set === "stx" ? modalWalker : commander);
    return new Response(JSON.stringify({ data, not_found: [] }), { status: 200, headers: { "Content-Type": "application/json" } });
  }
  if (url === commander.all_parts[0].uri) return new Response(JSON.stringify(elemental), { status: 200, headers: { "Content-Type": "application/json" } });
  if (url === gisela.all_parts[0].uri) return new Response(JSON.stringify(meldResult), { status: 200, headers: { "Content-Type": "application/json" } });
  return nativeFetch(input, init);
};

const decklist = "Commander\n1x Elspeth, Sun's Champion (THS) 9\n\nMainboard\n1x Gisela, the Broken Blade (EMN) 28\n1x Mila, Crafty Companion (STX) 153\n97x Forest";
const response = await worker.fetch(new Request("https://local/api/tts-import", {
  method: "POST",
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify({ decklist, includeTokens: true })
}));
const payload = await response.json();

if (response.status !== 200) throw new Error("Expected 200, received " + response.status + ": " + JSON.stringify(payload));
if (!payload.ok) throw new Error("Expected a successful import.");
if (payload.summary.physicalCount !== 100) throw new Error("Expected 100 physical cards.");
if (payload.spawnObjects) throw new Error("The endpoint must not return expanded TTS objects.");
if (payload.cardPlan?.library?.length !== 99) throw new Error("Compact main-deck plan is invalid.");
if (payload.cardPlan?.commanders?.length !== 1) throw new Error("Compact commander plan is invalid.");
if (!payload.cardPlan.commanders[0].nickname.startsWith("Commander")) throw new Error("Commander label is invalid.");
if (!payload.cardPlan.commanders[0].nickname.includes("\nLegendary Planeswalker — Elspeth\n6CMC")) throw new Error("Card Encoder planeswalker identity is missing: " + JSON.stringify(payload.cardPlan.commanders[0].nickname));
if (!payload.cardPlan.commanders[0].description.includes("+1: Create three 1/1 white Soldier creature tokens.")) throw new Error("Planeswalker rules text is missing.");
if (!payload.cardPlan.commanders[0].description.endsWith("[b]4[/b]")) throw new Error("Starting loyalty is not encoded for Card Encoder.");
if (!payload.cardPlan.commanders[0].encoderRebuild) throw new Error("Planeswalker commander is not marked for Card Encoder rebuild.");
if (payload.cardPlan.commanders[0].memo !== commander.oracle_id + "|tokens:" + elemental.id) throw new Error("Token metadata memo is missing.");
if (!payload.cardPlan.commanders[0].tags.includes("oid:" + commander.oracle_id)) throw new Error("Oracle-ID tag is missing.");
if (!payload.cardPlan.commanders[0].description.includes("[mtg:oid=" + commander.oracle_id + ";tok=" + elemental.id + "]")) throw new Error("Token metadata footer is missing.");
if (payload.summary.tokenCount !== 2) throw new Error("Expected one token and one Meld result helper.");
if (!payload.cardPlan.tokens.some((spec) => spec.nickname.startsWith(meldResult.name))) throw new Error("Meld result helper is missing.");
const modalSpec = payload.cardPlan.library.find((spec) => spec.nickname.startsWith("Mila, Crafty Companion"));
if (!modalSpec?.backFaceUrl || !modalSpec.backNickname.startsWith("Lukka, Wayward Bonder")) throw new Error("Modal double-faced state is missing.");
if (!modalSpec.encoderRebuild || !modalSpec.backDescription.endsWith("[b]5[/b]")) throw new Error("Reverse-face planeswalker loyalty rebuild metadata is missing.");
const commanderFace = payload.cardPlan.commanders[0].faceUrl || "";
if (!commanderFace.startsWith("https://wsrv.nl/?url=")) throw new Error("TTS-compatible image proxy is missing.");
if (JSON.stringify(payload).length > 60000) throw new Error("Compact card plan unexpectedly expanded.");

const dropboxLink = "https://www.dropbox.com/scl/fi/example/cardback.png?rlkey=abc&dl=0";
const dropboxResponse = await worker.fetch(new Request("https://local/api/tts-import", {
  method: "POST",
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify({ decklist, cardBackUrl: dropboxLink, includeTokens: false })
}));
const dropboxPayload = await dropboxResponse.json();
if (!dropboxPayload.ok || dropboxPayload.cardPlan.cardBackUrl !== dropboxLink.replace("dl=0", "dl=1")) {
  throw new Error("Dropbox card back URL must retain the share link with dl=1.");
}
const servedApp = await (await worker.fetch(new Request("https://local/app.js"))).text();
if (!servedApp.includes("function fixDropboxCardBackLink") || servedApp.includes("url.hostname='dl.dropboxusercontent.com'")) {
  throw new Error("The served app still contains stale Dropbox card back handling.");
}
const servedHtml = await (await worker.fetch(new Request("https://local/"))).text();
if (!servedHtml.includes('id="selectFolderBtn"') || !servedHtml.includes('id="folderStatus"') || !servedHtml.includes('Send to TTS folder') ||
    !servedApp.includes('els.selectFolderBtn.onclick=chooseFolder;els.folderBtn.onclick=sendToFolder') || !servedApp.includes('restoreFolder();registerWebMcp()')) {
  throw new Error("The served site does not include persistent TTS folder selection and separate send action.");
}
if (!servedHtml.includes('id="deckFormat"') || !servedHtml.includes('data-tab="sideboard"')) throw new Error("Constructed format controls are missing from the served page.");
if (!servedHtml.includes('<option value="oathbreaker100">Oathbreaker homebrew (100 cards, 40 life)</option>')) throw new Error("The 100-card Oathbreaker format is missing from the site.");
const constructedDeck = "Mainboard\n75x Forest\n\nSideboard\n2x Forest";
const constructedResponse = await worker.fetch(new Request("https://local/api/tts-import", {
  method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ decklist: constructedDeck, deckName: "Seventy Five Forests", includeTokens: false })
}));
const constructed = await constructedResponse.json();
if (!constructed.ok || constructed.cardPlan.format !== "constructed" || constructed.cardPlan.library.length !== 75 || constructed.cardPlan.sideboard.length !== 2 || constructed.cardPlan.commanders.length !== 0 || constructed.warnings.some(w => w.includes("60"))) {
  throw new Error("A 75-card constructed main deck with separate sideboard failed to import.");
}
const modernResponse = await worker.fetch(new Request("https://local/api/tts-import", {
  method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ decklist: constructedDeck, format: "modern", includeTokens: false })
}));
const modern = await modernResponse.json();
if (!modern.ok || modern.cardPlan.format !== "modern") throw new Error("Named constructed format failed to import.");
const oathList = "Oathbreaker\n1x Nissa, Test Walker\n\nSignature Spell\n1x Giant Growth\n\nMainboard\n58x Forest";
const importOath = async (list, format) => {
  const result = await worker.fetch(new Request("https://local/api/tts-import", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ decklist: list, format, includeTokens: false }) }));
  return { status: result.status, body: await result.json() };
};
const oathResult = await importOath(oathList);
if (oathResult.status !== 200 || oathResult.body.cardPlan.format !== "oathbreaker" || oathResult.body.summary.physicalCount !== 60 || oathResult.body.cardPlan.library.length !== 58 || oathResult.body.cardPlan.oathbreakers.length !== 1 || oathResult.body.cardPlan.signatureSpells.length !== 1) throw new Error("Oathbreaker command zone and 58-card library import failed: " + JSON.stringify(oathResult));
if (!oathResult.body.cardPlan.oathbreakers[0].nickname.startsWith("Oathbreaker") || !oathResult.body.cardPlan.signatureSpells[0].nickname.startsWith("Signature Spell")) throw new Error("Oathbreaker command zone labels were lost.");
const tooLargeOath = await importOath(oathList.replace("58x Forest", "59x Forest"));
if (tooLargeOath.status !== 422 || !tooLargeOath.body.issues?.some(issue => issue.includes("exactly 60"))) throw new Error("Oathbreaker exact deck size was not enforced.");
const homebrewList = oathList.replace("58x Forest", "98x Forest");
const homebrew = await importOath(homebrewList, "oathbreaker100");
if (homebrew.status !== 200 || homebrew.body.cardPlan.format !== "oathbreaker100" || homebrew.body.cardPlan.library.length !== 98 || homebrew.body.cardPlan.oathbreakers.length !== 1 || homebrew.body.cardPlan.signatureSpells.length !== 1 || homebrew.body.summary.physicalCount !== 100 || homebrew.body.summary.startingLife !== 40) throw new Error("100-card homebrew Oathbreaker import failed: " + JSON.stringify(homebrew));
const inferredHomebrew = await importOath(homebrewList);
if (inferredHomebrew.status !== 200 || inferredHomebrew.body.cardPlan.format !== "oathbreaker100") throw new Error("100-card Oathbreaker auto-detection failed.");
const shortHomebrew = await importOath(oathList, "oathbreaker100");
if (shortHomebrew.status !== 422 || !shortHomebrew.body.issues?.some(issue => issue.includes("exactly 100"))) throw new Error("Homebrew Oathbreaker accepted 60 cards.");
const standardRejectsHomebrew = await importOath(homebrewList, "oathbreaker");
if (standardRejectsHomebrew.status !== 422 || !standardRejectsHomebrew.body.issues?.some(issue => issue.includes("exactly 60"))) throw new Error("Standard Oathbreaker accepted 100 cards.");
const wrongFormat = await importOath(oathList, "modern");
if (wrongFormat.status !== 422 || !wrongFormat.body.issues?.some(issue => issue.includes("require Oathbreaker format"))) throw new Error("Constructed imports silently accepted Oathbreaker sections.");
for (const [decklist, expected] of [["Mainboard\n59x Forest", "at least 60"], ["Mainboard\n60x Forest\n\nSideboard\n16x Forest", "no more than 15"]]) {
  const result = await worker.fetch(new Request("https://local/api/tts-import", {
    method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ decklist, includeTokens: false })
  }));
  const body = await result.json();
  if (result.status !== 422 || !body.issues?.some(issue => issue.includes(expected))) throw new Error(`Constructed format limit ${expected} was not enforced.`);
}

const noTokensResponse = await worker.fetch(new Request("https://local/api/tts-import", {
  method: "POST",
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify({ decklist, includeTokens: false })
}));
const noTokensPayload = await noTokensResponse.json();
if (!noTokensPayload.ok) throw new Error("Token-disabled Meld import failed.");
if (noTokensPayload.cardPlan.tokens.length !== 1 || !noTokensPayload.cardPlan.tokens[0].nickname.startsWith(meldResult.name)) throw new Error("Meld helper must remain available when ordinary tokens are disabled.");

const importer = JSON.parse(await readFile(new URL("../dist/downloads/Commander_TTS_Deck_Forge_Importer.json", import.meta.url), "utf8"));
const forgeObject = importer.ObjectStates?.[0];
if (!forgeObject) throw new Error("Importer object is missing.");
if (!forgeObject.LuaScript.includes('spawnPile(sideboard, "Sideboard"') || !forgeObject.LuaScript.includes('spawnPile(maybeboard, "Maybeboard"')) throw new Error("In-game importer must spawn constructed sideboard and maybeboard separately.");
if (!forgeObject.LuaScript.includes('spawnCommandZone(oathbreakers, layout.commander') || !forgeObject.LuaScript.includes('spawnCommandZone(signatureSpells, layout.signature')) throw new Error("In-game importer must spawn Oathbreaker and Signature Spell in the command zone.");
if (!forgeObject.LuaScript.includes('if plan.format == "oathbreaker" or plan.format == "oathbreaker100"')) throw new Error("In-game importer does not spawn homebrew Oathbreaker leaders and spells.");
if (!forgeObject.LuaScript.includes('self.addContextMenuItem("Choose deck format", contextFormat)') || !forgeObject.LuaScript.includes('if settings.format ~= "auto" then source.format = settings.format end') || !forgeObject.LuaScript.includes('settings.format = FORMAT_KEYS[index]')) throw new Error("In-game importer must let players save and send a named deck format.");
if (!forgeObject.LuaScript.includes('if payload.issues and #payload.issues > 0 then')) throw new Error("In-game importer must display exact format validation issues.");
if (forgeObject.Transform.scaleX !== 3.8 || forgeObject.Transform.scaleZ !== 3.8) throw new Error("Importer proportions regressed.");
if (!forgeObject.CustomImage?.ImageURL?.endsWith("/forge-console-v16.png")) throw new Error("Importer texture URL is not cache-busted.");
if (!forgeObject.LuaScript.includes("player.getHandTransform(1)")) throw new Error("Player-relative spawning is missing.");
if (!forgeObject.LuaScript.includes("player.seated")) throw new Error("Seated-player guard is missing.");
if (forgeObject.LuaScript.includes('type(hand.position) ~= "table"')) throw new Error("TTS Vector userdata is incorrectly rejected.");
if (!forgeObject.LuaScript.includes("local coordsOk, px, pz = pcall")) throw new Error("Safe TTS Vector handling is missing.");
if (!forgeObject.LuaScript.includes('Memo = spec.memo or ""')) throw new Error("Card token metadata is not written into TTS Memo.");
if (!forgeObject.LuaScript.includes('Global.getVar("Encoder")')) throw new Error("Card Encoder integration is missing.");
if (!forgeObject.LuaScript.includes('encoder.call("APIrebuildButtons", {obj = object})')) throw new Error("Spawned commanders are not rebuilding Card Encoder buttons.");
if (!forgeObject.LuaScript.includes('LuaScript = spec.encoderRebuild and CARD_ENCODER_SCRIPT or ""')) throw new Error("Planeswalker face-load rebuild script is missing.");
if (forgeObject.LuaScript.includes("local origin = self.getPosition()")) throw new Error("Importer-relative spawning returned.");
if (!forgeObject.LuaScript.includes('"openDecklist", -0.31, -0.39, 1400')) throw new Error("Importer button alignment regressed.");

console.log("TTS importer smoke test passed (" + JSON.stringify(payload).length + "-byte compact plan).");
