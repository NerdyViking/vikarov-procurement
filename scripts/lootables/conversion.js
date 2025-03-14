console.log("Vikarov’s Guide to Procurement: conversion.js loaded");

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

  const content = await renderTemplate("modules/vikarov-procurement/templates/conversionDialog.hbs", templateData);

  new Dialog({
    title: "Convert Tokens",
    content,
    buttons: {
      confirm: {
        label: "Confirm",
        callback: async (html) => {
          const form = html.find(".vikarov-conversion-form")[0];
          if (!form) return;

          const results = [];
          const templateActor = game.actors.find(actor => actor.name === "Lootable Template" && actor.type === "npc");

          console.log(`Checking for Lootable Template actor: ${!!templateActor}`);

          if (!templateActor) {
            ui.notifications.error("Lootable Template actor not found! Please ensure it exists.");
            return;
          }

          // Get the prototype token settings from the template actor
          const prototypeTokenData = templateActor.prototypeToken.toObject();
          const displayName = prototypeTokenData.displayName || CONST.TOKEN_DISPLAY_MODES.HOVER;
          const displayNameVisibility = prototypeTokenData.displayNameVisibility || CONST.TOKEN_DISPLAY_MODES.EVERYONE;

          for (const token of targetTokens) {
            const lootable = form.querySelector(`input[name="lootable-${token.id}"]`).checked;
            const harvestable = form.querySelector(`input[name="harvestable-${token.id}"]`).checked;

            console.log(`Converting token ${token.name}: lootable=${lootable}, harvestable=${harvestable}, actorLink=${token.document.actorLink}`);

            let processedToken = token;

            if (lootable) {
              try {
                console.log(`Using Lootable Template actor with ID: ${templateActor.id}`);

                // Parse data from the original token
                const originalActor = token.actor;
                const tokenImage = token.document.texture.src; // Get the token image
                const originalName = originalActor.name;
                const newName = `${originalName}'s Remains`; // Append "’s Remains"
                const inventoryItems = originalActor.items.map(item => item.toObject()); // Parse items
                const currency = foundry.utils.deepClone(originalActor.system.currency); // Parse currency

                console.log(`Parsed data for ${token.name}: image=${tokenImage}, name=${newName}, items=${inventoryItems.length}, currency=`, currency);

                // Delete the original token
                await canvas.scene.deleteEmbeddedDocuments("Token", [token.id]);
                console.log(`Deleted original token ${token.name}`);

                // Create a new token from the Lootable Template actor with prototype settings
                const tokenPosition = token.document.toObject();
                const newTokenData = {
                  actorId: templateActor.id, // Initially link to the template to inherit prototype settings
                  x: tokenPosition.x,
                  y: tokenPosition.y,
                  rotation: tokenPosition.rotation,
                  elevation: tokenPosition.elevation,
                  hidden: tokenPosition.hidden,
                  texture: {
                    src: tokenImage // Use the original token image
                  },
                  displayName: displayName,
                  displayNameVisibility: displayNameVisibility
                };
                const [newTokenDoc] = await canvas.scene.createEmbeddedDocuments("Token", [newTokenData]);
                processedToken = canvas.tokens.get(newTokenDoc.id);
                console.log(`Created new token ${processedToken.name} from Lootable Template with prototype settings`);

                // Update the new token's actor data and token name (unlinked), with player ownership
                await processedToken.actor.update({
                  name: newName,
                  img: tokenImage,
                  items: inventoryItems,
                  system: {
                    currency
                  },
                  flags: {
                    "core.sheetClass": "vikarov-procurement.LootSheetVikarov",
                    "vikarov-procurement": { lootable: true, harvestable: !!harvestable }
                  }
                });
                await processedToken.document.update({
                  name: newName, // Update the token's display name
                  actorLink: false, // Ensure the token becomes unlinked
                  displayName: displayName, // Preserve the display name setting
                  displayNameVisibility: displayNameVisibility, // Preserve the visibility setting
                  ownership: {
                    [game.user.id]: CONST.DOCUMENT_OWNERSHIP_LEVELS.OWNER, // GM retains full control
                    default: CONST.DOCUMENT_OWNERSHIP_LEVELS.OBSERVER // All players get observer access
                  }
                });
                console.log(`Updated token ${processedToken.name} with parsed data, now unlinked with player ownership`);
              } catch (error) {
                console.error(`Failed to convert token ${token.name}:`, error);
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
          }

          console.log("Processed tokens:", results);
          ui.notifications.info(`${results.length} tokens processed for procurement`);
        }
      },
      close: {
        label: "Close",
        callback: () => console.log("Conversion dialog closed")
      }
    },
    default: "close"
  }).render(true);
}

// Hook into combat end to detect defeated NPC tokens
Hooks.on("deleteCombat", (combat) => {
  if (!game.user.isGM) return;

  const combatants = combat.combatants;

  const defeatedTokens = [];
  for (const combatant of combatants) {
    const token = canvas.tokens.get(combatant.tokenId);
    const actor = combatant.actor;

    console.log(`Combatant: ${combatant.name}`);
    console.log(`- Token ID: ${combatant.tokenId}, Found: ${!!token}`);
    console.log(`- HP: ${actor?.system?.attributes?.hp?.value ?? "N/A"}`);
    console.log(`- Defeated: ${combatant.defeated}`);
    console.log(`- Type: ${actor?.type ?? "N/A"}`);

    if ((combatant.defeated || (actor && actor.system.attributes.hp.value === 0)) && actor?.type === "npc") {
      defeatedTokens.push(token);
    }
  }

  if (defeatedTokens.length > 0) {
    console.log(`Combat ended, detected ${defeatedTokens.length} defeated NPC tokens`);
    openConversionDialog(defeatedTokens);
  } else {
    console.log("Combat ended, no defeated NPC tokens found");
  }
});