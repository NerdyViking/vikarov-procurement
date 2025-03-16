// Harvest system functionality for Vikarov’s Guide to Procurement
import { CREATURE_TYPE_SKILLS } from "../shared/constants.js";
import { getSetting } from "../shared/settings.js";

// Skill ID to full name mapping
const SKILL_NAME_MAP = {
  med: "Medicine",
  arc: "Arcana",
  nat: "Nature",
  sur: "Survival",
  rel: "Religion",
  inv: "Investigation",
  his: "History",
  ins: "Insight",
  itm: "Intimidation",
  prc: "Perception",
  prf: "Performance",
  per: "Persuasion",
  slt: "Sleight of Hand",
  ste: "Stealth"
};

// Skill ID to ability score mapping
const SKILL_ABILITY_MAP = {
  med: "wis",
  arc: "int",
  nat: "int",
  sur: "wis",
  rel: "int",
  inv: "int",
  his: "int",
  ins: "wis",
  itm: "cha",
  prc: "wis",
  prf: "cha",
  per: "cha",
  slt: "dex",
  ste: "dex"
};

// Perform harvesting logic and convert token to loot
async function performHarvest(token, skill, dc, rollResult) {
  const actor = token.actor;
  const margin = rollResult.total - dc;
  const multiplier = margin >= 10 ? 2 : margin >= 0 ? 1 : margin >= -9 ? 0.5 : 0;

  const reagentTableId = actor.getFlag("vikarov-procurement", "reagentTable");
  const numberOfPulls = actor.getFlag("vikarov-procurement", "numberOfPullsOverride") || getSetting("numberOfPulls") || 1;
  const allowDuplicates = actor.getFlag("vikarov-procurement", "allowDuplicates") || false;
  const items = [];

  if (reagentTableId && multiplier > 0) {
    const table = game.tables.get(reagentTableId);
    if (table) {
      const pulls = Math.floor(numberOfPulls * multiplier);
      const rolledResults = new Set();
      for (let i = 0; i < pulls; i++) {
        const rollResult = await table.roll();
        const result = rollResult.results[0];
        if (!result) continue;
        const itemUuid = result.getFlag("vikarov-procurement", "itemUuid");
        const itemText = result.text;
        if (itemUuid) {
          if (allowDuplicates || !rolledResults.has(itemUuid)) {
            const item = await fromUuid(itemUuid);
            if (item) {
              items.push(item.toObject());
              if (!allowDuplicates) rolledResults.add(itemUuid);
            }
          }
        } else {
          items.push({ name: itemText, type: "consumable", system: { quantity: 1 } });
          if (!allowDuplicates) rolledResults.add(itemText);
        }
      }
    } else {
      ui.notifications.warn(`Reagent table not found for ${token.name}.`);
    }
  }

  const lootTemplateActor = game.actors.find(a => a.name === "Lootable Template" && a.type === "npc");
  if (!lootTemplateActor) {
    ui.notifications.error("Lootable Template actor not found.");
    return;
  }

  const lootActorData = {
    name: `${token.name} Remains`,
    type: "npc",
    flags: {
      core: { sheetClass: "vikarov-procurement.LootSheetVikarov" },
      "vikarov-procurement": { harvested: true }
    },
    ownership: {
      default: CONST.DOCUMENT_OWNERSHIP_LEVELS.NONE,
      [game.user.id]: CONST.DOCUMENT_OWNERSHIP_LEVELS.OWNER
    }
  };

  const lootActor = await Actor.create(lootActorData);
  if (!lootActor) {
    ui.notifications.error("Failed to create loot actor.");
    return;
  }

  if (items.length > 0) {
    await lootActor.createEmbeddedDocuments("Item", items);
    ui.notifications.info(`Harvested ${items.length} reagent(s) from ${token.name}.`);
  } else {
    ui.notifications.info(`No reagents harvested from ${token.name}.`);
  }

  await token.document.update({
    name: `${token.name} Remains`,
    actorId: lootActor.id,
    actorLink: false
  });

  await token.document.setFlag("vikarov-procurement", "harvested", true);
}

// Create harvest dialog UI
async function createHarvestDialog(token, openRollDialogFunc) {
  if (!(token instanceof Token)) {
    ui.notifications.error("Invalid token selected for harvesting.");
    return;
  }

  if (!token.document.getFlag("vikarov-procurement", "harvestable") || token.document.getFlag("vikarov-procurement", "harvested")) {
    ui.notifications.warn(`${token.name} is not harvestable or has already been harvested.`);
    return;
  }

  const actor = token.actor;
  const creatureType = actor.system.details.type?.value?.toLowerCase() || "unknown";
  const skills = CREATURE_TYPE_SKILLS[creatureType] || ["nat"];
  const cr = actor.system.details.cr || 0;
  const dc = 10 + Math.floor(cr / 2);

  const templateData = {
    token: token.document.toObject(),
    creatureType: creatureType.charAt(0).toUpperCase() + creatureType.slice(1),
    cr,
    dc,
    skills: skills.map(skill => ({ id: skill, name: SKILL_NAME_MAP[skill] || skill })),
    defaultSkill: skills[0]
  };

  const content = await renderTemplate("modules/vikarov-procurement/templates/harvestDialog.hbs", templateData);

  new Dialog({
    title: `Harvest ${token.name}`,
    content,
    buttons: {
      harvest: { label: "Harvest", callback: async (html) => openRollDialogFunc(token, html.find("#skill-select").val(), dc) },
      leave: { label: "Leave", callback: () => {} }
    },
    default: "leave"
  }).render(true);
}

export async function openHarvestDialog(token) {
  await createHarvestDialog(token, openRollDialog);
}

// Handle roll dialog for harvesting
async function openRollDialog(token, skill, dc) {
  const actor = game.user.character || token.actor;
  const ability = SKILL_ABILITY_MAP[skill];
  const abilityScore = actor.system.abilities[ability].value;
  const abilityMod = Math.floor((abilityScore - 10) / 2);
  const proficiency = actor.system.skills[skill].value > 0 ? actor.system.attributes.prof : 0;
  const totalMod = proficiency + abilityMod;
  const formula = `1d20 + ${totalMod}`;

  const abilityOptions = { str: "Strength", dex: "Dexterity", con: "Constitution", int: "Intelligence", wis: "Wisdom", cha: "Charisma" };
  const rollModeOptions = { public: "Public Roll", private: "Private GM Roll", blind: "Blind GM Roll", self: "Self Roll" };
  const rollModeMapping = {
    public: CONST.DICE_ROLL_MODES.PUBLIC,
    private: CONST.DICE_ROLL_MODES.PRIVATE,
    blind: CONST.DICE_ROLL_MODES.BLIND,
    self: CONST.DICE_ROLL_MODES.SELF
  };

  const templateData = { subtitle: `DC: ${dc}`, formula, ability, abilityOptions, rollMode: "public", rollModeOptions };

  const content = await renderTemplate("modules/vikarov-procurement/templates/harvestDialogRoll.hbs", templateData);

  return new Promise((resolve) => {
    new Dialog({
      title: "",
      content,
      buttons: {
        advantage: {
          label: "Advantage",
          callback: async (html) => {
            const bonus = parseInt(html.find("input[name='situationalBonus']").val()) || 0;
            const selectedAbility = html.find("select[name='ability']").val() || ability;
            const rollMode = html.find("select[name='rollMode']").val() || "public";
            const mappedMode = rollModeMapping[rollMode];
            const abilityScore = actor.system.abilities[selectedAbility].value;
            const abilityMod = Math.floor((abilityScore - 10) / 2);
            const totalMod = proficiency + abilityMod;
            const totalFormula = `1d20${bonus >= 0 ? ` + ${bonus}` : ` - ${Math.abs(bonus)}`} + ${totalMod}`;
            const roll1 = new Roll(totalFormula);
            const roll2 = new Roll(totalFormula);
            await roll1.evaluate();
            await roll2.evaluate();
            const rollResult = roll1.total > roll2.total ? roll1 : roll2;
            const originalMode = game.settings.get("core", "rollMode");
            await game.settings.set("core", "rollMode", mappedMode);
            await ChatMessage.create({
              speaker: ChatMessage.getSpeaker({ actor }),
              content: await rollResult.render(),
              flavor: `Rolling ${SKILL_NAME_MAP[skill] || skill} to harvest ${token.name} (DC ${dc})`,
              roll: rollResult,
              rollMode: mappedMode
            });
            await game.settings.set("core", "rollMode", originalMode);
            await performHarvest(token, skill, dc, rollResult);
          }
        },
        normal: {
          label: "Normal",
          callback: async (html) => {
            const bonus = parseInt(html.find("input[name='situationalBonus']").val()) || 0;
            const selectedAbility = html.find("select[name='ability']").val() || ability;
            const rollMode = html.find("select[name='rollMode']").val() || "public";
            const mappedMode = rollModeMapping[rollMode];
            const abilityScore = actor.system.abilities[selectedAbility].value;
            const abilityMod = Math.floor((abilityScore - 10) / 2);
            const totalMod = proficiency + abilityMod;
            const totalFormula = `1d20${bonus >= 0 ? ` + ${bonus}` : ` - ${Math.abs(bonus)}`} + ${totalMod}`;
            const rollResult = new Roll(totalFormula);
            await rollResult.evaluate();
            const originalMode = game.settings.get("core", "rollMode");
            await game.settings.set("core", "rollMode", mappedMode);
            await ChatMessage.create({
              speaker: ChatMessage.getSpeaker({ actor }),
              content: await rollResult.render(),
              flavor: `Rolling ${SKILL_NAME_MAP[skill] || skill} to harvest ${token.name} (DC ${dc})`,
              roll: rollResult,
              rollMode: mappedMode
            });
            await game.settings.set("core", "rollMode", originalMode);
            await performHarvest(token, skill, dc, rollResult);
          }
        },
        disadvantage: {
          label: "Disadvantage",
          callback: async (html) => {
            const bonus = parseInt(html.find("input[name='situationalBonus']").val()) || 0;
            const selectedAbility = html.find("select[name='ability']").val() || ability;
            const rollMode = html.find("select[name='rollMode']").val() || "public";
            const mappedMode = rollModeMapping[rollMode];
            const abilityScore = actor.system.abilities[selectedAbility].value;
            const abilityMod = Math.floor((abilityScore - 10) / 2);
            const totalMod = proficiency + abilityMod;
            const totalFormula = `1d20${bonus >= 0 ? ` + ${bonus}` : ` - ${Math.abs(bonus)}`} + ${totalMod}`;
            const roll1 = new Roll(totalFormula);
            const roll2 = new Roll(totalFormula);
            await roll1.evaluate();
            await roll2.evaluate();
            const rollResult = roll1.total < roll2.total ? roll1 : roll2;
            const originalMode = game.settings.get("core", "rollMode");
            await game.settings.set("core", "rollMode", mappedMode);
            await ChatMessage.create({
              speaker: ChatMessage.getSpeaker({ actor }),
              content: await rollResult.render(),
              flavor: `Rolling ${SKILL_NAME_MAP[skill] || skill} to harvest ${token.name} (DC ${dc})`,
              roll: rollResult,
              rollMode: mappedMode
            });
            await game.settings.set("core", "rollMode", originalMode);
            await performHarvest(token, skill, dc, rollResult);
          }
        }
      },
      default: "normal",
      close: () => resolve({ rollMode: "cancel" }),
      render: (html) => {
        html.find("select[name='ability']").val(ability);
        const updateFormula = () => {
          const selectedAbility = html.find("select[name='ability']").val() || ability;
          const abilityScore = actor.system.abilities[selectedAbility].value;
          const abilityMod = Math.floor((abilityScore - 10) / 2);
          const totalMod = proficiency + abilityMod;
          html.find(".roll-dialog-formula").text(`1d20 + ${totalMod}`);
        };
        updateFormula();
        html.find("select[name='ability']").on("change", updateFormula);
      }
    }).render(true);
  });
}

// Register harvest keyboard shortcut
Hooks.on("init", () => {
  game.keybindings.register("vikarov-procurement", "harvest", {
    name: "Harvest Token",
    description: "Harvest the targeted token",
    editable: [{ key: "KeyH" }],
    onDown: () => {
      const targets = Array.from(game.user.targets);
      if (targets.length !== 1) {
        ui.notifications.warn("Please target exactly one token to harvest.");
        return;
      }
      openHarvestDialog(targets[0]);
    },
    onUp: () => {},
    reservedModifiers: [],
    precedence: CONST.KEYBINDING_PRECEDENCE.NORMAL
  });
});

// Add harvest button to scene control
Hooks.on("getSceneControlButtons", (controls) => {
  const tokenControls = controls.find(c => c.name === "token");
  if (!tokenControls) return;

  tokenControls.tools.push({
    name: "harvestToken",
    title: "Harvest Token",
    icon: "fas fa-leaf",
    onClick: () => {
      const targets = Array.from(game.user.targets);
      if (targets.length !== 1) {
        ui.notifications.warn("Please target exactly one token to harvest.");
        return;
      }
      openHarvestDialog(targets[0]);
    },
    button: true
  });
});