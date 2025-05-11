console.log("Vikarov’s Guide to Procurement: utils.js loaded");

export const CREATURE_TYPE_SKILLS = {
  aberration: ["med", "arc"],
  beast: ["nat", "sur"],
  celestial: ["rel"],
  construct: ["inv", "arc"],
  dragon: ["nat", "arc"],
  elemental: ["arc"],
  fey: ["nat", "arc"],
  fiend: ["rel", "arc"],
  giant: ["sur"],
  monstrosity: ["nat", "sur"],
  ooze: ["arc"],
  plant: ["nat"],
  undead: ["rel", "med"]
};

export const HARVESTABLE_TYPES = Object.keys(CREATURE_TYPE_SKILLS);

export async function splitGold(currency, partyMembers, sourceActor) {
  const total = {
    pp: parseInt(currency.pp) || 0,
    gp: parseInt(currency.gp) || 0,
    ep: parseInt(currency.ep) || 0,
    sp: parseInt(currency.sp) || 0,
    cp: parseInt(currency.cp) || 0
  };

  // Convert all currency to copper pieces for calculation
  const totalCopper = (total.pp * 1000) + (total.gp * 100) + (total.ep * 50) + (total.sp * 10) + total.cp;
  const splitCopper = Math.floor(totalCopper / partyMembers.length);

  // Convert back to mixed currency
  const split = {
    pp: Math.floor(splitCopper / 1000),
    gp: Math.floor((splitCopper % 1000) / 100),
    ep: Math.floor((splitCopper % 100) / 50),
    sp: Math.floor((splitCopper % 50) / 10),
    cp: splitCopper % 10
  };

  // Update each party member’s inventory
  for (const member of partyMembers) {
    const currentCurrency = member.system.currency;
    const newCurrency = {
      pp: (parseInt(currentCurrency.pp) || 0) + split.pp,
      gp: (parseInt(currentCurrency.gp) || 0) + split.gp,
      ep: (parseInt(currentCurrency.ep) || 0) + split.ep,
      sp: (parseInt(currentCurrency.sp) || 0) + split.sp,
      cp: (parseInt(currentCurrency.cp) || 0) + split.cp
    };
    await member.update({ "system.currency": newCurrency });
    console.log(`Updated currency for ${member.name}:`, newCurrency);
  }

  // Reset the source actor’s currency to 0
  await sourceActor.update({
    "system.currency": { pp: 0, gp: 0, ep: 0, sp: 0, cp: 0 }
  });
}