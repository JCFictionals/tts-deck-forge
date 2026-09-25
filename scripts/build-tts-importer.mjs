import { mkdir, writeFile } from "node:fs/promises";

const lua = String.raw`local API_URL = "https://commander-tts-deck-forge.jcfictionals.chatgpt.site/api/tts-import"
local STANDARD_BACK = "https://steamusercontent-a.akamaihd.net/ugc/1647720103762682461/35EF6E87970E2A5D6581E7D96A99F8A575B7A15F/"
local settings = { cardBackUrl = STANDARD_BACK, includeTokens = true, format = "auto" }
local FORMATS = {"Auto-detect", "Commander", "Oathbreaker (60)", "Oathbreaker homebrew (100 / 40 life)", "Other constructed", "Standard", "Pioneer", "Modern", "Legacy", "Vintage", "Pauper"}
local FORMAT_KEYS = {"auto", "commander", "oathbreaker", "oathbreaker100", "constructed", "standard", "pioneer", "modern", "legacy", "vintage", "pauper"}
local busy = false
local forgeQueue = {}
local statusIndex = 4
local CARD_ENCODER_SCRIPT = [[function onLoad()
    Wait.frames(function()
        local ok, encoder = pcall(function() return Global.getVar("Encoder") end)
        if ok and encoder then pcall(function() encoder.call("APIrebuildButtons", {obj = self}) end) end
    end, 2)
end]]

function onLoad(saved_data)
    if saved_data and saved_data ~= "" then
        local ok, restored = pcall(JSON.decode, saved_data)
        if ok and type(restored) == "table" then
            settings.cardBackUrl = restored.cardBackUrl or STANDARD_BACK
            settings.includeTokens = restored.includeTokens ~= false
            for _, key in ipairs(FORMAT_KEYS) do
                if restored.format == key then settings.format = key; break end
            end
        end
    end
    self.setName("TTS Deck Forge")
    self.setDescription("Reusable in-game Commander, Oathbreaker, and constructed deck importer. Paste a decklist or a public Moxfield/Archidekt URL and forge the deck directly onto the table.")
    self.locked = true
    buildInterface()
    self.addContextMenuItem("Import pasted decklist", contextDecklist)
    self.addContextMenuItem("Import deck URL", contextUrl)
    self.addContextMenuItem("Choose deck format", contextFormat)
    self.addContextMenuItem("Importer help", function(player_color) showHelp(self, player_color, false) end)
end

function onSave()
    return JSON.encode(settings)
end

function button(label, fn, x, z, width, color, tooltip)
    self.createButton({
        click_function = fn,
        function_owner = self,
        label = label,
        position = {x, 0.18, z},
        rotation = {0, 0, 0},
        width = width,
        height = 520,
        font_size = 190,
        scale = {0.18, 0.18, 0.18},
        color = color,
        font_color = {0.96, 0.97, 0.94},
        hover_color = {color[1] + 0.08, color[2] + 0.08, color[3] + 0.08},
        press_color = {color[1] * 0.75, color[2] * 0.75, color[3] * 0.75},
        tooltip = tooltip or ""
    })
end

function buildInterface()
    self.clearButtons()
    button("PASTE DECKLIST", "openDecklist", -0.31, -0.39, 1400, {0.12, 0.42, 0.25}, "Paste a Commander, Oathbreaker, or constructed decklist")
    button("IMPORT URL", "openUrl", 0.31, -0.39, 1400, {0.10, 0.31, 0.43}, "Import a public Moxfield or Archidekt deck")
    button("CARD BACK", "setCardBack", -0.31, 0.00, 1400, {0.39, 0.30, 0.14}, "Use the standard Magic back or enter a custom image URL")
    button(settings.includeTokens and "TOKENS: ON" or "TOKENS: OFF", "toggleTokens", 0.31, 0.00, 1400, {0.22, 0.26, 0.29}, "Automatically include discovered tokens and emblems")
    self.createButton({
        click_function = "noop", function_owner = self, label = "READY — choose an import method",
        position = {0, 0.18, 0.39}, rotation = {0, 0, 0}, width = 0, height = 0,
        font_size = 145, scale = {0.15, 0.15, 0.15}, font_color = {0.50, 0.78, 0.60}
    })
end

function noop() end

function contextDecklist(player_color)
    openDecklist(self, player_color, false)
end

function contextUrl(player_color)
    openUrl(self, player_color, false)
end

function contextFormat(player_color)
    chooseFormat(self, player_color, false)
end

function setStatus(message, tint)
    self.editButton({index = statusIndex, label = message, font_color = tint or {0.86, 0.88, 0.86}})
end

function playerFor(color)
    return Player[color]
end

function openDecklist(obj, color, alt_click)
    playerFor(color).showMemoDialog("Paste a decklist. For Oathbreaker, use Oathbreaker and Signature Spell headings plus Mainboard. Standard Oathbreaker has 60 cards; the homebrew option has 100 cards and starts at 40 life. Commander uses a Commander heading; other constructed formats use Mainboard / Sideboard.", "", function(text, player_color)
        if not text or text:match("^%s*$") then return end
        forge({decklist = text}, player_color)
    end)
end

function openUrl(obj, color, alt_click)
    playerFor(color).showInputDialog("Paste a public Moxfield or Archidekt deck URL.", "", function(text, player_color)
        if not text or text:match("^%s*$") then return end
        forge({url = text}, player_color)
    end)
end

function setCardBack(obj, color, alt_click)
    playerFor(color).showOptionsDialog("Choose the card-back source.", {"Standard Magic card back", "Custom image URL"}, 1, function(choice, index, player_color)
        if index == 1 then
            settings.cardBackUrl = STANDARD_BACK
            setStatus("STANDARD CARD BACK SELECTED", {0.50, 0.78, 0.60})
        else
            playerFor(player_color).showInputDialog("Paste a direct public image URL for the card back.", settings.cardBackUrl == STANDARD_BACK and "" or settings.cardBackUrl, function(text)
                if text and text:match("^https://") then
                    settings.cardBackUrl = text
                    setStatus("CUSTOM CARD BACK SELECTED", {0.85, 0.68, 0.33})
                else
                    playerFor(player_color).showInfoDialog("The custom card back must be a public HTTPS image URL.")
                end
            end)
        end
    end)
end

function toggleTokens(obj, color, alt_click)
    settings.includeTokens = not settings.includeTokens
    self.editButton({index = 3, label = settings.includeTokens and "TOKENS: ON" or "TOKENS: OFF"})
    setStatus(settings.includeTokens and "AUTOMATIC TOKENS ENABLED" or "AUTOMATIC TOKENS DISABLED", {0.62, 0.72, 0.80})
end

function chooseFormat(obj, color, alt_click)
    local current = 1
    for index, key in ipairs(FORMAT_KEYS) do
        if key == settings.format then current = index; break end
    end
    playerFor(color).showOptionsDialog("Choose a format for subsequent imports. Auto-detect uses deck headings or the deck URL's format.", FORMATS, current, function(choice, index)
        if not FORMAT_KEYS[index] then return end
        settings.format = FORMAT_KEYS[index]
        setStatus("FORMAT: " .. string.upper(FORMATS[index]), {0.62, 0.72, 0.80})
    end)
end

function showHelp(obj, color, alt_click)
    playerFor(color).showInfoDialog("TTS DECK FORGE\n\nPASTE DECKLIST accepts Commander lists with a Commander heading; Oathbreaker lists with Oathbreaker and Signature Spell headings (60 cards standard, or 100 cards and 40 starting life for the homebrew option); or constructed lists with a Mainboard heading and optional Sideboard (at least 60 main cards).\n\nRight-click this importer and choose CHOOSE DECK FORMAT to select a format. Auto-detect uses deck headings and card count or a deck URL's format. Your selection is saved on this object. The homebrew starting life is a table rule; set player life to 40 in your game.\n\nIMPORT URL supports public Moxfield and Archidekt decks.\n\nCARD BACK switches between the standard Magic back and a public custom image. Dropbox links ending in dl=0 are converted to dl=1 by the deck service.\n\nYou must be seated at the table. The library, command zone cards, optional sideboard, and tokens spawn in front of your hand zone.")
end

function seatedPlayer(color)
    local player = Player[color]
    if player and player.seated then return player end
    return nil
end

function playerSpawnLayout(color)
    local player = seatedPlayer(color)
    if not player then return nil, "Choose a player color and sit at the table before importing a deck." end
    local ok, hand = pcall(function() return player.getHandTransform(1) end)
    if not ok or not hand or not hand.position then
        return nil, "Your seat needs a hand zone before a deck can be imported."
    end
    local coordsOk, px, pz = pcall(function()
        return tonumber(hand.position.x or hand.position[1]) or 0,
               tonumber(hand.position.z or hand.position[3]) or 0
    end)
    if not coordsOk then return nil, "The forge could not read your hand-zone position." end
    local forwardX = -px
    local forwardZ = -pz
    local length = math.sqrt(forwardX * forwardX + forwardZ * forwardZ)
    if length < 0.25 then
        local forwardOk, handForwardX, handForwardZ = pcall(function()
            return tonumber(hand.forward.x or hand.forward[1]) or 0,
                   tonumber(hand.forward.z or hand.forward[3]) or 1
        end)
        forwardX = forwardOk and handForwardX or 0
        forwardZ = forwardOk and handForwardZ or 1
        length = math.sqrt(forwardX * forwardX + forwardZ * forwardZ)
    end
    if length < 0.01 then return nil, "The forge could not determine the front of your seat." end
    forwardX = forwardX / length
    forwardZ = forwardZ / length
    local rightX = forwardZ
    local rightZ = -forwardX
    local spawnY = self.getPosition().y + 1.3
    local baseX = px + forwardX * 5.2
    local baseZ = pz + forwardZ * 5.2
    local rotationY = 0
    pcall(function() rotationY = tonumber(hand.rotation.y or hand.rotation[2]) or 0 end)
    return {
        library = {baseX, spawnY, baseZ},
        commander = {baseX + rightX * 3.0, spawnY, baseZ + rightZ * 3.0},
        signature = {baseX + rightX * 6.0, spawnY, baseZ + rightZ * 6.0},
        sideboard = {baseX + rightX * 3.0, spawnY, baseZ + rightZ * 3.0},
        maybeboard = {baseX + rightX * 6.0, spawnY, baseZ + rightZ * 6.0},
        tokens = {baseX - rightX * 3.0, spawnY, baseZ - rightZ * 3.0},
        forwardX = forwardX, forwardZ = forwardZ,
        rightX = rightX, rightZ = rightZ,
        rotationY = rotationY
    }
end

function forge(source, player_color)
    if not seatedPlayer(player_color) then
        setStatus("SEAT REQUIRED — choose a player color", {0.95, 0.38, 0.34})
        playerFor(player_color).showInfoDialog("COMMANDER DECK FORGE\n\nChoose a player color and sit at the table before importing a deck.")
        return
    end
    source.cardBackUrl = settings.cardBackUrl
    source.includeTokens = settings.includeTokens
    if settings.format ~= "auto" then source.format = settings.format end
    table.insert(forgeQueue, {source = source, player_color = player_color})
    if busy then
        playerFor(player_color).broadcast("Commander Deck Forge: queued — " .. tostring(#forgeQueue) .. " deck(s) waiting.", {0.85, 0.68, 0.33})
        setStatus("QUEUE — " .. tostring(#forgeQueue) .. " deck(s) waiting", {1.0, 0.72, 0.30})
        return
    end
    runNextForge()
end

function runNextForge()
    if busy or #forgeQueue == 0 then return end
    busy = true
    local job = table.remove(forgeQueue, 1)
    local source = job.source
    local player_color = job.player_color
    if not seatedPlayer(player_color) then
        fail(player_color, "You left your seat before the queued import began. Sit down and try again.")
        return
    end
    setStatus("FORGING — resolving cards…", {1.0, 0.72, 0.30})
    playerFor(player_color).broadcast("Commander Deck Forge: resolving cards and tokens…", {0.85, 0.68, 0.33})
    local headers = { ["Content-Type"] = "application/json", Accept = "application/json" }
    WebRequest.custom(API_URL, "POST", true, JSON.encode(source), headers, function(request)
        if request.is_error then
            fail(player_color, "The forge could not reach its deck service.\n\n" .. tostring(request.error))
            return
        end
        local ok, payload = pcall(JSON.decode, request.text or "")
        if not ok or type(payload) ~= "table" then
            fail(player_color, "The forge received an unreadable response.")
            return
        end
        if request.response_code >= 400 or not payload.ok then
            local message = payload.error or ("Import failed with status " .. tostring(request.response_code) .. ".")
            if payload.unresolved and #payload.unresolved > 0 then
                message = message .. "\n\nUnresolved:\n• " .. table.concat(payload.unresolved, "\n• ")
            end
            if payload.issues and #payload.issues > 0 then
                message = message .. "\n\nFormat issues:\n• " .. table.concat(payload.issues, "\n• ")
            end
            fail(player_color, message)
            return
        end
        spawnForgedObjects(payload, player_color)
    end)
end

function completeForge()
    busy = false
    if #forgeQueue > 0 then
        setStatus("NEXT DECK — " .. tostring(#forgeQueue) .. " waiting", {1.0, 0.72, 0.30})
        Wait.time(runNextForge, 1.25)
    end
end

function fail(player_color, message)
    setStatus("FORGE FAILED — click again to retry", {0.95, 0.38, 0.34})
    playerFor(player_color).showInfoDialog("COMMANDER DECK FORGE\n\n" .. message)
    completeForge()
end

function cardTransform(faceUp)
    return {
        posX = 0, posY = 0, posZ = 0,
        rotX = 0, rotY = 0, rotZ = faceUp and 0 or 180,
        scaleX = 1, scaleY = 1, scaleZ = 1
    }
end

function customCardData(spec, key, cardBack, faceUp)
    local custom = {
        [key] = {
            FaceURL = spec.faceUrl or "",
            BackURL = cardBack,
            NumWidth = 1, NumHeight = 1, Type = 0,
            BackIsHidden = true, UniqueBack = false
        }
    }
    local card = {
        Transform = cardTransform(faceUp),
        Name = "Card",
        Nickname = spec.nickname or "Card",
        Description = spec.description or "",
        Memo = spec.memo or "",
        Tags = spec.tags or {},
        CardID = key * 100,
        CustomDeck = custom,
        LuaScript = spec.encoderRebuild and CARD_ENCODER_SCRIPT or "",
        LuaScriptState = ""
    }
    local nextKey = key + 1
    if spec.backFaceUrl and spec.backFaceUrl ~= "" then
        local backKey = nextKey
        card.States = {
            [2] = {
                Transform = cardTransform(faceUp),
                Name = "Card",
                Nickname = spec.backNickname or spec.nickname or "Card",
                Description = spec.backDescription or "",
                Memo = spec.memo or "",
                Tags = spec.tags or {},
                CardID = backKey * 100,
                LuaScript = spec.encoderRebuild and CARD_ENCODER_SCRIPT or "",
                LuaScriptState = "",
                CustomDeck = {
                    [backKey] = {
                        FaceURL = spec.backFaceUrl,
                        BackURL = cardBack,
                        NumWidth = 1, NumHeight = 1, Type = 0,
                        BackIsHidden = true, UniqueBack = false
                    }
                }
            }
        }
        nextKey = nextKey + 1
    end
    return card, nextKey
end

function emptyDeckData(name, faceUp)
    return {
        Transform = cardTransform(faceUp),
        Name = "Deck",
        Nickname = name or "Commander Deck",
        Description = "Generated by TTS Deck Forge",
        DeckIDs = {},
        CustomDeck = {},
        ContainedObjects = {}
    }
end

function addCardToDeck(deckData, cardData)
    table.insert(deckData.DeckIDs, cardData.CardID)
    table.insert(deckData.ContainedObjects, cardData)
    for id, custom in pairs(cardData.CustomDeck or {}) do deckData.CustomDeck[id] = custom end
    if cardData.States then
        for _, state in pairs(cardData.States) do
            for id, custom in pairs(state.CustomDeck or {}) do deckData.CustomDeck[id] = custom end
        end
    end
end

function buildDeckAcrossFrames(specs, name, cardBack, faceUp, startKey, progressOffset, progressTotal, callback)
    local deckData = emptyDeckData(name, faceUp)
    local index = 1
    local key = startKey
    local function addNext()
        if index > #specs then
            callback(deckData, key)
            return
        end
        local cardData, nextKey = customCardData(specs[index], key, cardBack, faceUp)
        addCardToDeck(deckData, cardData)
        key = nextKey
        setStatus("ASSEMBLING — " .. tostring(progressOffset + index) .. "/" .. tostring(progressTotal), {1.0, 0.72, 0.30})
        index = index + 1
        Wait.frames(addNext, 2)
    end
    addNext()
end

function rebuildCardEncoderButtons(object)
    if not object then return end
    Wait.frames(function()
        local ok, encoder = pcall(function() return Global.getVar("Encoder") end)
        if ok and encoder then
            pcall(function() encoder.call("APIrebuildButtons", {obj = object}) end)
        end
    end, 2)
end

function spawnForgedObjects(payload, player_color)
    local plan = payload.cardPlan
    if type(plan) ~= "table" or type(plan.library) ~= "table" or type(plan.commanders) ~= "table" then
        fail(player_color, "No usable card plan was returned.")
        return
    end
    local layout, layoutError = playerSpawnLayout(player_color)
    if not layout then
        fail(player_color, layoutError)
        return
    end
    local cardBack = plan.cardBackUrl or STANDARD_BACK
    local tokens = type(plan.tokens) == "table" and plan.tokens or {}
    local sideboard = type(plan.sideboard) == "table" and plan.sideboard or {}
    local maybeboard = type(plan.maybeboard) == "table" and plan.maybeboard or {}
    local oathbreakers = type(plan.oathbreakers) == "table" and plan.oathbreakers or {}
    local signatureSpells = type(plan.signatureSpells) == "table" and plan.signatureSpells or {}
    local total = #plan.library + #plan.commanders + #oathbreakers + #signatureSpells + #sideboard + #maybeboard + #tokens
    local key = 1001
    local libraryDeck = nil

    local function finish()
        finalizeSpawn(payload, player_color, libraryDeck)
    end

    local function spawnTokens()
        if #tokens == 0 then finish(); return end
        if #tokens == 1 then
            local cardData, nextKey = customCardData(tokens[1], key, cardBack, true)
            key = nextKey
            spawnObjectData({
                data = cardData,
                position = layout.tokens,
                rotation = {0, layout.rotationY, 0},
                callback_function = finish
            })
            return
        end
        buildDeckAcrossFrames(tokens, "Tokens", cardBack, true, key, #plan.library + #plan.commanders + #oathbreakers + #signatureSpells + #sideboard + #maybeboard, total, function(tokenData, nextKey)
            key = nextKey
            spawnObjectData({
                data = tokenData,
                position = layout.tokens,
                rotation = {0, layout.rotationY, 0},
                callback_function = finish
            })
        end)
    end

    local function spawnPile(specs, name, position, offset, callback)
        if #specs == 0 then callback(); return end
        local function place(data, nextKey)
            key = nextKey
            spawnObjectData({data = data, position = position, rotation = {0, layout.rotationY, 180}, callback_function = function()
                Wait.frames(callback, 4)
            end})
        end
        if #specs == 1 then
            local data, nextKey = customCardData(specs[1], key, cardBack, false)
            place(data, nextKey)
        else
            buildDeckAcrossFrames(specs, name, cardBack, false, key, offset, total, place)
        end
    end

    local function spawnSideboard()
        spawnPile(sideboard, "Sideboard", layout.sideboard, #plan.library + #plan.commanders + #oathbreakers + #signatureSpells, function()
            spawnPile(maybeboard, "Maybeboard", layout.maybeboard, #plan.library + #plan.commanders + #oathbreakers + #signatureSpells + #sideboard, spawnTokens)
        end)
    end

    local function spawnCommandZone(specs, position, label, index, callback)
        if index > #specs then callback(); return end
        local cardData, nextKey = customCardData(specs[index], key, cardBack, true)
        key = nextKey
        setStatus("SPAWNING " .. label .. " — " .. tostring(index) .. "/" .. tostring(#specs), {1.0, 0.72, 0.30})
        spawnObjectData({data = cardData, position = {
            position[1] + layout.forwardX * (index - 1) * 2.2,
            position[2], position[3] + layout.forwardZ * (index - 1) * 2.2
        }, rotation = {0, layout.rotationY, 0}, callback_function = function(spawned)
            rebuildCardEncoderButtons(spawned)
            Wait.frames(function() spawnCommandZone(specs, position, label, index + 1, callback) end, 4)
        end})
    end

    local function spawnCommander(index)
        if index > #plan.commanders then spawnSideboard(); return end
        local cardData, nextKey = customCardData(plan.commanders[index], key, cardBack, true)
        key = nextKey
        setStatus("SPAWNING COMMANDER — " .. tostring(index) .. "/" .. tostring(#plan.commanders), {1.0, 0.72, 0.30})
        spawnObjectData({
            data = cardData,
            position = {
                layout.commander[1] + layout.forwardX * (index - 1) * 2.2,
                layout.commander[2],
                layout.commander[3] + layout.forwardZ * (index - 1) * 2.2
            },
            rotation = {0, layout.rotationY, 0},
            callback_function = function(spawned)
                rebuildCardEncoderButtons(spawned)
                Wait.frames(function() spawnCommander(index + 1) end, 4)
            end
        })
    end

    local function afterLibrary()
        if plan.format == "oathbreaker" or plan.format == "oathbreaker100" then
            spawnCommandZone(oathbreakers, layout.commander, "OATHBREAKER", 1, function()
                spawnCommandZone(signatureSpells, layout.signature, "SIGNATURE SPELL", 1, spawnSideboard)
            end)
        else
            spawnCommander(1)
        end
    end

    if #plan.library == 0 then
        afterLibrary()
        return
    end
    buildDeckAcrossFrames(plan.library, payload.deckName or "Commander Deck", cardBack, false, key, 0, total, function(deckData, nextKey)
        key = nextKey
        setStatus("SPAWNING LIBRARY…", {1.0, 0.72, 0.30})
        spawnObjectData({
            data = deckData,
            position = layout.library,
            rotation = {0, layout.rotationY, 180},
            callback_function = function(spawned)
                libraryDeck = spawned
                Wait.frames(afterLibrary, 4)
            end
        })
    end)
end

function finalizeSpawn(payload, player_color, libraryDeck)
    Wait.time(function()
        if libraryDeck then
            libraryDeck.setName(payload.deckName or "Commander Deck")
            libraryDeck.setGMNotes("")
        end
        local summary = payload.summary or {}
        setStatus("FORGED — " .. tostring(payload.deckName or "Commander deck"), {0.50, 0.85, 0.60})
        playerFor(player_color).broadcast("Forged " .. tostring(payload.deckName or "Commander deck") .. ": " .. tostring(summary.physicalCount or "?") .. " cards, " .. tostring(summary.tokenCount or 0) .. " tokens." .. (summary.startingLife and (" Homebrew starting life: " .. tostring(summary.startingLife) .. ".") or ""), {0.50, 0.85, 0.60})
        if payload.warnings and #payload.warnings > 0 then
            playerFor(player_color).showInfoDialog("DECK FORGED WITH WARNINGS\n\n• " .. table.concat(payload.warnings, "\n• "))
        end
        completeForge()
    end, 0.35)
end`;

const object = {
  SaveName: "TTS Deck Forge Importer",
  Date: new Date().toISOString(),
  VersionNumber: "",
  GameMode: "",
  GameType: "",
  GameComplexity: "",
  Tags: [],
  Gravity: 0.5,
  PlayArea: 0.5,
  Table: "",
  Sky: "",
  Note: "Reusable scripted Commander, Oathbreaker, and constructed deck importer for Tabletop Simulator.",
  TabStates: {},
  LuaScript: "",
  LuaScriptState: "",
  XmlUI: "",
  ObjectStates: [{
    Name: "Custom_Tile",
    Transform: { posX: 0, posY: 1.2, posZ: 0, rotX: 0, rotY: 0, rotZ: 0, scaleX: 3.8, scaleY: 1, scaleZ: 3.8 },
    Nickname: "TTS Deck Forge",
    Description: "In-game Commander, Oathbreaker, and constructed deck importer. Paste a decklist or a public Moxfield/Archidekt URL and forge the deck directly onto the table.",
    GMNotes: "",
    AltLookAngle: { x: 0, y: 0, z: 0 },
    ColorDiffuse: { r: 1, g: 1, b: 1 },
    LayoutGroupSortIndex: 0,
    Value: 0,
    Locked: true,
    Grid: false,
    Snap: false,
    IgnoreFoW: false,
    MeasureMovement: false,
    DragSelectable: true,
    Autoraise: false,
    Sticky: false,
    Tooltip: true,
    GridProjection: false,
    HideWhenFaceDown: false,
    Hands: false,
    CustomImage: {
      ImageURL: "https://commander-tts-deck-forge.jcfictionals.chatgpt.site/downloads/forge-console-v16.png",
      ImageSecondaryURL: "",
      ImageScalar: 1,
      WidthScale: 0,
      CustomTile: { Type: 0, Thickness: 0.18, Stackable: false, Stretch: true }
    },
    LuaScript: lua,
    LuaScriptState: "",
    XmlUI: "",
    GUID: "d3cf01"
  }]
};

const outputDir = new URL("../dist/downloads/", import.meta.url);
await mkdir(outputDir, { recursive: true });
await writeFile(new URL("Commander_TTS_Deck_Forge_Importer.json", outputDir), JSON.stringify(object, null, 2));
