console.log("Vikarov’s Guide to Procurement: conversion.js loaded");

import { HARVESTABLE_TYPES } from "../core/utils.js";
import { getSetting } from "../core/settings.js";

// Helper function to roll on a table and return items
async function rollAndPopulateItems(tableId, numberOfPulls, allowDuplicates = false) {
  if (!tableId) return [];
  const table = game.tables.get(tableId);
  if (!table) {
    ui.notifications.warn(`Table not found for ID ${tableId}.`);
    return [];
  }

  const pulls = numberOfPulls || getSetting("numberOfPulls") || 1;
  const rolledItems = [];
  const rolledResults = new Set();

  console.log(`Rolling ${pulls} times on table ${table.name}, allowDuplicates=${allowDuplicates}`);

  for (let i = 0; i < pulls; i++) {
    const rollResult = await table.roll();
    const result = rollResult.results[0];
    if (!result) {
      console.log(`No result from roll ${i + 1} on table ${table.name}`);
      continue;
    }

    const itemUuid = result.getFlag("vikarov-procurement", "itemUuid");
    const itemText = result.text;
    console.log(`Roll ${i + 1}: itemText=${itemText}, itemUuid=${itemUuid}`);

    if (itemUuid) {
      if (allowDuplicates || !rolledResults.has(itemUuid)) {
        const item = await fromUuid(itemUuid);
        if (item) {
          rolledItems.push(item.toObject());
          if (!allowDuplicates) rolledResults.add(itemUuid);
        } else {
          console.warn(`Item with UUID ${itemUuid} not found for table result ${itemText}`);
        }
      } else {
        console.log(`Skipping duplicate item: ${itemText} (UUID: ${itemUuid})`);
      }
    } else {
      console.log(`No UUID for table result ${itemText}, creating as consumable`);
      rolledItems.push({ name: itemText, type: "consumable", system: { quantity: 1 } });
      if (!allowDuplicates) rolledResults.add(itemText);
    }
  }

  return rolledItems;
}

export async function openConversionDialog(tokens = null) {
  const targetTokens = tokens || canvas.tokens.controlled;

  if (targetTokens.length > 0) {
    const tokenNames = targetTokens.map((token) => token.name).join(", ");
    console.log(`Target tokens for conversion: ${tokenNames}`);
  } else {
    console.log("No tokens available for conversion");
  }

  const templateData = {
    tokens: targetTokens.map((token) => ({
      id: token.id,
      name: token.name
    }))
  };

  const content = await renderTemplate("templates/conversionDialog.hbs", templateData);

  await DialogV2.prompt({
    window: { title: "Convert Tokens" },
    content,
    buttons: [
      {
        label: "Confirm",
        callback: async (html) => {
          const form = html.querySelector(".vikarov-conversion-form");
          if (!form) return;

          const results = [];
          const templateActor = game.actors.getName("Lootable Template");
          if (!templateActor || templateActor.type !== "npc") {
            ui.notifications.error("Lootable Template actor not found or invalid! Please ensure it exists and is an NPC.");
            return;
          }

          console.log(`Using Lootable Template actor: ${templateActor.name}, ID: ${templateActor.id}`);

          if (!canvas.scene) {
            ui.notifications.error("No active scene found. Please ensure a scene is active.");
            return;
          }

          for (const token of targetTokens) {
            const lootable = form.querySelector(`input[name="lootable-${token.id}"]`).checked;
            const harvestable = form.querySelector(`input[name="harvestable-${token.id}"]`).checked;

            console.log(`Converting token ${token.name}: lootable=${lootable}, harvestable=${harvestable}, actorLink=${token.document.actorLink}`);

            let processedToken = token;

            const actorType = token.actor?.system?.details?.type?.value?.toLowerCase() || "unknown";
            if (harvestable && actorType === "humanoid") {
              ui.notifications.warn(`Cannot harvest ${token.name}: Humanoids are not harvestable due to ethical concerns.`);
              continue;
            }

            if (lootable || (harvestable && HARVESTABLE_TYPES.includes(actorType))) {
              try {
                if (lootable) {
                  // Parse data from the original token
                  const originalActor = token.actor;
                  const tokenImage = token.document.texture.src;
                  const originalName = originalActor.name;
                  const newName = `${originalName}'s Remains`;
                  const inventoryItems = originalActor.items
                    .filter(item => {
                      const validTypes = ["consumable", "container", "equipment", "loot", "tool", "weapon"];
                      if (!validTypes.includes(item.type)) return false;
                      if (item.type === "weapon") {
                        const weaponType = item.system?.weaponType || "";
                        const validWeaponTypes = ["simpleM", "simpleR", "martialM", "martialR"];
                        return validWeaponTypes.includes(weaponType);
                      }
                      return true;
                    })
                    .map(item => item.toObject());
                  const currency = foundry.utils.deepClone(originalActor.system.currency);
                  const lootTableId = originalActor.getFlag("vikarov-procurement", "lootTable") || "";
                  const reagentTableId = originalActor.getFlag("vikarov-procurement", "reagentTable") || "";
                  const numberOfPulls = originalActor.getFlag("vikarov-procurement", "numberOfPullsOverride") || getSetting("numberOfPulls") || 1;
                  const allowDuplicates = originalActor.getFlag("vikarov-procurement", "allowDuplicates") || false;

                  console.log(`Parsed data for ${token.name}: image=${tokenImage}, name=${newName}, items=${inventoryItems.length}, currency=`, currency);

                  // Roll on tables to get additional items
                  const tableItems = [];
                  if (harvestable && reagentTableId) {
                    const reagentItems = await rollAndPopulateItems(reagentTableId, numberOfPulls, allowDuplicates);
                    tableItems.push(...reagentItems);
                  }
                  if (lootable && lootTableId) {
                    const lootItems = await rollAndPopulateItems(lootTableId, numberOfPulls, allowDuplicates);
                    tableItems.push(...lootItems);
                  }

                  // Combine original items and table-rolled items
                  const allItems = [...inventoryItems, ...tableItems];

                  // Create a new token using the Lootable Template actor's ID
                  const newTokenData = {
                    actorId: templateActor.id,
                    x: token.x,
                    y: token.y,
                    rotation: token.rotation,
                    elevation: token.elevation,
                    hidden: token.hidden,
                    texture: {
                      src: tokenImage,
                      scaleX: token.document.texture.scaleX || 1,
                      scaleY: token.document.texture.scaleY || 1
                    },
                    width: token.document.width,
                    height: token.document.height,
                    ownership: {
                      [game.user.id]: CONST.DOCUMENT_OWNERSHIP_LEVELS.OWNER,
                      default: CONST.DOCUMENT_OWNERSHIP_LEVELS.OBSERVER
                    }
                  };

                  console.log(`Creating new token with data:`, newTokenData);
                  const newTokens = await canvas.scene.createEmbeddedDocuments("Token", [newTokenData]);
                  if (!newTokens || newTokens.length === 0) {
                    throw new Error("Failed to create new token for conversion.");
                  }

                  const newTokenDoc = newTokens[0];
                  processedToken = canvas.tokens.get(newTokenDoc.id);

                  // Update the token's name
                  await newTokenDoc.update({ name: newName });

                  // Update the actor's data (items and currency) while retaining the original actor ID
                  const actor = newTokenDoc.actor;
                  await actor.update({
                    img: tokenImage,
                    items: allItems,
                    system: { currency },
                    flags: {
                      "vikarov-procurement": {
                        lootable: true,
                        harvestable: !!harvestable
                      }
                    }
                  });

                  // Verify the actor link
                  console.log(`New token created: ${processedToken.name}, ID: ${newTokenDoc.id}`);
                  console.log(`Linked actor:`, actor ? actor.toObject() : "None");

                  if (!actor) {
                    throw new Error("New token created without a linked actor!");
                  }

                  // Delete the original token
                  await canvas.scene.deleteEmbeddedDocuments("Token", [token.id]);
                  console.log(`Deleted original token ${token.name}`);

                  if (allItems.length > 0) {
                    ui.notifications.info(`Added ${allItems.length} item(s) to ${newName}.`);
                  }
                } else if (harvestable) {
                  await processedToken.document.setFlag("vikarov-procurement", "harvestable", true);
                  console.log(`Updated harvestable flag for ${processedToken.name}`);
                }

                results.push({
                  id: processedToken.id,
                  name: processedToken.name,
                  lootable,
                  harvestable
                });
              } catch (error) {
                console.error(`Failed to convert token ${token.name}:`, error);
                ui.notifications.error(`Failed to convert ${token.name}: ${error.message}`);
              }
            }
          }

          console.log("Processed tokens:", results);
          ui.notifications.info(`${results.length} tokens converted for procurement`);
        }
      },
      {
        label: "Close",
        callback: () => console.log("Conversion dialog closed")
      }
    ],
    rejectClose: false,
    modal: true
  });
}

// Hook into combat end to detect defeated NPC tokens
Hooks.on("deleteCombat", async (combat) => {
  if (!game.user.isGM) return;

  const combatants = combat.combatants;

  const defeatedTokens = [];
  for (const combatant of combatants) {
    const token = canvas.tokens.get(combatant.tokenId);
    const actor = combatant.actor;

    console.log(`Combatant: ${combatant.name}`);
    console.log(`- Token ID: ${combatant.tokenId}, Found: ${!!token}`);
    console.log(`- HP: ${actor?.system?.attributes?.hp?.current ?? "N/A"}`);
    console.log(`- Defeated: ${combatant.defeated}`);
    console.log(`- Type: ${actor?.type ?? "N/A"}`);

    if ((combatant.defeated || (actor && actor.system.attributes.hp.current <= 0)) && actor?.type === "npc") {
      defeatedTokens.push(token);
    }
  }

  if (defeatedTokens.length > 0) {
    console.log(`Combat ended, detected ${defeatedTokens.length} defeated NPC tokens`);
    await openConversionDialog(defeatedTokens);
  } else {
    console.log("Combat ended, no defeated NPC tokens found");
  }
});