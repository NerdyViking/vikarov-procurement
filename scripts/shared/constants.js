console.log("Vikarov’s Guide to Procurement: constants.js loaded");

export const CREATURE_TYPE_SKILLS = {
  aberration: ["med", "arc"], // Medicine, Arcana
  beast: ["nat", "sur"],     // Nature, Survival
  celestial: ["rel"],        // Religion
  construct: ["inv", "arc"], // Investigation, Arcana
  dragon: ["nat", "arc"],    // Nature, Arcana
  elemental: ["arc"],        // Arcana
  fey: ["nat", "arc"],       // Nature, Arcana
  fiend: ["rel", "arc"],     // Religion, Arcana
  giant: ["sur"],            // Survival
  monstrosity: ["nat", "sur"], // Nature, Survival
  ooze: ["arc"],             // Arcana
  plant: ["nat"],            // Nature
  undead: ["rel", "med"]     // Religion, Medicine
};

// List of harvestable creature types (humanoid excluded)
export const HARVESTABLE_TYPES = Object.keys(CREATURE_TYPE_SKILLS);