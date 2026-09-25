import { readFile } from "node:fs/promises";
import vm from "node:vm";

const source = await readFile(new URL("../dist/app.js", import.meta.url), "utf8");
const functionSource = source.match(/function legalMultiplicity\(entry\)\{[\s\S]*?\n\}/)?.[0];
if (!functionSource) throw new Error("Could not locate legalMultiplicity().");

const legalMultiplicity = Function(`${functionSource}; return legalMultiplicity;`)();
const entry = (qty, type_line, oracle_text = "") => ({ qty, card: { type_line, oracle_text } });

if (!legalMultiplicity(entry(22, "Basic Snow Land — Forest"))) throw new Error("Snow-Covered Forest must allow multiple copies.");
if (!legalMultiplicity(entry(22, "Basic Snow Land — Island"))) throw new Error("Snow-Covered Island must allow multiple copies.");
if (!legalMultiplicity(entry(22, "Basic Snow Land — Swamp"))) throw new Error("Snow-Covered Swamp must allow multiple copies.");
if (!legalMultiplicity(entry(22, "Basic Snow Land — Mountain"))) throw new Error("Snow-Covered Mountain must allow multiple copies.");
if (!legalMultiplicity(entry(22, "Basic Snow Land — Plains"))) throw new Error("Snow-Covered Plains must allow multiple copies.");
if (!legalMultiplicity(entry(22, "Basic Land — Forest"))) throw new Error("Forest must allow multiple copies.");
if (!legalMultiplicity(entry(22, "Basic Land — Wastes"))) throw new Error("Wastes must allow multiple copies.");
if (!legalMultiplicity(entry(12, "Creature — Rat", "A deck can have any number of cards named Relentless Rats."))) throw new Error("Rules-text quantity exceptions must remain supported.");
if (legalMultiplicity(entry(2, "Artifact"))) throw new Error("Nonbasic cards must remain singleton-limited.");

const extract = name => source.match(new RegExp(`function ${name}\\([\\s\\S]*?\\n\\}`))?.[0];
const formatChecks = [extract("maximumCopies"), extract("oathbreakerDeckSize"), extract("oathbreakerErrors"), extract("validateAll")];
if (formatChecks.some(value => !value)) throw new Error("Constructed format checks are missing.");
const forest = { name: "Forest", oracle_id: "forest", type_line: "Basic Land — Forest", legalities: { modern: "legal" } };
const bolt = { name: "Lightning Bolt", oracle_id: "bolt", type_line: "Instant", legalities: { modern: "legal" } };
const item = (card, qty, section = "deck") => ({ card, qty, section, status: "resolved", imageStatus: "ok" });
const state = { cards: [item(forest, 75), item(forest, 2, "sideboard")], tokens: [], backOk: true, errors: [], warnings: [] };
let currentFormat = "modern";
const context = { state, els: { format: { selectedOptions: [{ text: "Modern" }] } },
  commanderEntries: () => [], libraryEntries: () => state.cards.filter(c => c.section === "deck"),
  sideboardEntries: () => state.cards.filter(c => c.section === "sideboard"),
  isCommander: () => false, isOathbreaker: () => currentFormat.startsWith("oathbreaker"), selectedFormat: () => currentFormat, normalizeName: value => value.toLowerCase(),
  previewIdAllocation: () => ({ conflicts: [] }), addLog: () => {}, setPill: () => {}, setProgress: () => {} };
vm.createContext(context);
vm.runInContext(formatChecks.join("\n"), context);
vm.runInContext("validateAll()", context);
if (!state.validated) throw new Error("A 75-card constructed main deck should pass; 60 is only a minimum.");
state.cards[1].qty = 16;
vm.runInContext("validateAll()", context);
if (!state.errors.some(error => error.includes("Sideboard has 16"))) throw new Error("Oversized sideboard was not caught.");
state.cards = [item(forest, 75), item(bolt, 3), item(bolt, 2, "sideboard")];
vm.runInContext("validateAll()", context);
if (!state.errors.some(error => error.includes("5 copies"))) throw new Error("Combined main deck and sideboard copy limit was not caught.");
state.cards = [item(forest, 75), item({ ...bolt, legalities: { modern: "banned" } }, 1)];
vm.runInContext("validateAll()", context);
if (!state.errors.some(error => error.includes("banned in modern"))) throw new Error("Named format legality was not checked.");

const walker = { name: "Nissa, Test Walker", type_line: "Legendary Planeswalker — Nissa", color_identity: ["G"], legalities: { oathbreaker: "legal" } };
const growth = { name: "Giant Growth", type_line: "Instant", color_identity: ["G"], legalities: { oathbreaker: "legal" } };
const oathForest = { ...forest, color_identity: ["G"], legalities: { oathbreaker: "legal" } };
const oath = [item(walker, 1, "oathbreaker"), item(growth, 1, "signature"), item(oathForest, 58)];
currentFormat = "oathbreaker";
if (vm.runInContext("oathbreakerErrors", context)(oath).length) throw new Error("Valid 60-card Oathbreaker deck failed validation.");
if (!vm.runInContext("oathbreakerErrors", context)([...oath.slice(0, 2), item(oathForest, 59)]).some(error => error.includes("exactly 60"))) throw new Error("Oathbreaker must have exactly 60 cards.");
const homebrewOath = [oath[0], oath[1], item(oathForest, 98)];
if (!vm.runInContext("oathbreakerErrors", context)(homebrewOath).some(error => error.includes("exactly 60"))) throw new Error("Standard Oathbreaker must reject 100 cards.");
currentFormat = "oathbreaker100";
if (vm.runInContext("oathbreakerErrors", context)(homebrewOath).length) throw new Error("Valid 100-card homebrew Oathbreaker deck failed validation.");
if (!vm.runInContext("oathbreakerErrors", context)(oath).some(error => error.includes("exactly 100"))) throw new Error("Homebrew Oathbreaker must reject 60 cards.");
if (!vm.runInContext("oathbreakerErrors", context)([oath[0], item({ ...growth, type_line: "Creature" }, 1, "signature"), oath[2]]).some(error => error.includes("instant or sorcery"))) throw new Error("Signature Spell type must be checked.");
if (!vm.runInContext("oathbreakerErrors", context)([oath[0], item({ ...growth, color_identity: ["U"] }, 1, "signature"), oath[2]]).some(error => error.includes("color identity"))) throw new Error("Signature Spell color identity must be checked.");

console.log("Site multiplicity validation tests passed.");
