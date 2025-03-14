import { registerSettings } from "./settings.js";
import "../lootables/sidebarButtons.js";
import "../lootables/actorConfig.js";
import { LootSheetVikarov, shouldUseLootSheet } from "../lootables/lootSheet.js";

console.log("Vikarov’s Guide to Procurement loaded!");
Hooks.once("init", () => {
  console.log("Initializing Vikarov’s Guide to Procurement...");
  registerSettings();

  // Register the loot sheet for unlinked tokens flagged as "Lootable"
  Actors.registerSheet("vikarov-procurement", LootSheetVikarov, {
    types: ["npc"],
    makeDefault: false,
    label: "Vikarov Loot Sheet"
  });

  // Hook to override the default sheet for new tokens
  Hooks.on("preCreateToken", (tokenDocument, data, options, userId) => {
    if (shouldUseLootSheet(tokenDocument)) {
      console.log(`Setting sheetClass for new token ${tokenDocument.name}`);
      tokenDocument.setFlag("core", "sheetClass", "vikarov-procurement.LootSheetVikarov");
    }
  });

  // Simplify renderTokenHUD hook
  Hooks.on("renderTokenHUD", (hud, html, tokenData) => {
    const token = canvas.tokens.get(tokenData._id);
    if (token && shouldUseLootSheet(token)) {
      console.log(`Token ${token.name} is lootable on HUD render`);
    }
  });
});

Hooks.once("ready", async () => {
  console.log("Module ready, checking for Lootable Template actor...");
  const templateName = "Lootable Template";
  let templateActor = game.actors.find(actor => actor.name === templateName && actor.type === "npc");

  if (!templateActor) {
    console.log(`Lootable Template actor not found. Creating it...`);
    try {
      templateActor = await Actor.create({
        name: templateName,
        type: "npc",
        flags: {
          core: {
            sheetClass: "vikarov-procurement.LootSheetVikarov"
          }
        },
        ownership: {
          default: CONST.DOCUMENT_OWNERSHIP_LEVELS.NONE,
          [game.user.id]: CONST.DOCUMENT_OWNERSHIP_LEVELS.OWNER
        }
      });
      console.log(`Created Lootable Template actor with ID: ${templateActor.id}`);
    } catch (error) {
      console.error("Failed to create Lootable Template actor:", error);
      console.log("Current user permissions:", game.user.can("ACTOR_CREATE"), game.user.can("ACTOR_UPDATE"));
      ui.notifications.error("Failed to initialize Lootable Template actor. Check the console for details.");
    }
  } else {
    console.log(`Found existing Lootable Template actor with ID: ${templateActor.id}`);
    try {
      await templateActor.update({
        "flags.core.sheetClass": "vikarov-procurement.LootSheetVikarov",
        ownership: {
          default: CONST.DOCUMENT_OWNERSHIP_LEVELS.NONE,
          [game.user.id]: CONST.DOCUMENT_OWNERSHIP_LEVELS.OWNER
        }
      });
      console.log(`Updated Lootable Template actor sheet class`);
    } catch (error) {
      console.error("Failed to update Lootable Template actor:", error);
    }
  }
});