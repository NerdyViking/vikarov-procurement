// Settings registration for Vikarov’s Guide to Procurement
const MODULE_ID = "vikarov-procurement";

export function registerSettings() {
  // Full Automation: Toggle for dialog-free conversion
  game.settings.register(MODULE_ID, "fullAutomation", {
    name: "Full Automation",
    hint: "If enabled, tokens are converted automatically after combat without a dialog.",
    scope: "world",
    config: true,
    type: Boolean,
    default: false,
    requiresReload: false
  });

  // Number of Pulls: How many rolls on loot/Reagent tables
  game.settings.register(MODULE_ID, "numberOfPulls", {
    name: "Number of Table Pulls",
    hint: "Number of times to roll on loot or Reagent tables per token.",
    scope: "world",
    config: true,
    type: Number,
    default: 1,
    range: {
      min: 1,
      max: 10,
      step: 1
    },
    requiresReload: false
  });

  // Loot Chance: Percentage chance for loot generation
  game.settings.register(MODULE_ID, "lootChance", {
    name: "Loot Generation Chance",
    hint: "Percentage chance that a lootable token generates loot.",
    scope: "world",
    config: true,
    type: Number,
    default: 100,
    range: {
      min: 0,
      max: 100,
      step: 1
    },
    requiresReload: false
  });

  console.log("Vikarov’s Guide to Procurement settings registered!");
}

// Helper function to get setting values
export function getSetting(key) {
  return game.settings.get(MODULE_ID, key);
}