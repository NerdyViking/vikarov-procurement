import { registerSettings } from "./settings.js";
import "../loot/sidebarButtons.js";
import "../loot/actorConfig.js";
import { LootSheetVikarov, shouldUseLootSheet } from "../loot/lootSheet.js";

console.log("Vikarov’s Guide to Procurement loaded!");
Hooks.once("init", () => {
  console.log("Initializing Vikarov’s Guide to Procurement...");
  registerSettings();

  // Register the loot sheet for unlinked tokens flagged as "Lootable"
  CONFIG.Actor.sheetClasses.npc["vikarov-procurement.LootSheetVikarov"] = {
    id: "vikarov-procurement.LootSheetVikarov",
    label: "Vikarov Loot Sheet",
    cls: LootSheetVikarov,
    default: false
  };

  // Hook to override the default sheet for new tokens
  Hooks.on("preCreateToken", (tokenDocument, data, options, userId) => {
    if (shouldUseLootSheet(tokenDocument)) {
      console.log(`Setting sheetClass for new token ${tokenDocument.name}`);
      tokenDocument.setFlag("core", "sheetClass", "vikarov-procurement.LootSheetVikarov");
    }
    return true;
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