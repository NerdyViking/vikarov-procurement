console.log("Vikarov’s Guide to Procurement: actorConfig.js loaded");

import { getSetting } from "../shared/settings.js";

// Debounce function to limit hook execution (still useful for logging)
const debounce = (func, wait) => {
  let timeout;
  return (...args) => {
    clearTimeout(timeout);
    timeout = setTimeout(() => func.apply(this, args), wait);
  };
};

class ProcurementConfigDialog extends FormApplication {
  constructor(actor, options = {}) {
    super(actor, options);
    this.actor = actor;
  }

  static get defaultOptions() {
    return foundry.utils.mergeObject(super.defaultOptions, {
      title: "Procurement Configuration",
      template: "modules/vikarov-procurement/templates/configDialog.hbs",
      width: 400,
      height: "auto",
      submitOnChange: false,
      closeOnSubmit: true
    });
  }

  getData() {
    const tables = game.tables.contents;
    const globalNumberOfPulls = getSetting("numberOfPulls");
    const globalLootChance = getSetting("lootChance");

    const actorData = {
      lootable: this.actor.getFlag("vikarov-procurement", "lootable") || false,
      harvestable: this.actor.getFlag("vikarov-procurement", "harvestable") || false,
      lootTable: this.actor.getFlag("vikarov-procurement", "lootTable") || "",
      reagentTable: this.actor.getFlag("vikarov-procurement", "reagentTable") || "",
      numberOfPullsOverride: this.actor.getFlag("vikarov-procurement", "numberOfPullsOverride") || "",
      lootChanceOverride: this.actor.getFlag("vikarov-procurement", "lootChanceOverride") || "",
      description: this.actor.getFlag("vikarov-procurement", "description") || "",
      allowDuplicates: this.actor.getFlag("vikarov-procurement", "allowDuplicates") || false
    };

    return foundry.utils.mergeObject({
      tables,
      globalNumberOfPulls,
      globalLootChance
    }, actorData);
  }

  async _updateObject(event, formData) {
    const settings = {
      "flags.vikarov-procurement.lootable": formData.lootable || false,
      "flags.vikarov-procurement.harvestable": formData.harvestable || false,
      "flags.vikarov-procurement.lootTable": formData.lootTable || "",
      "flags.vikarov-procurement.reagentTable": formData.reagentTable || "",
      "flags.vikarov-procurement.numberOfPullsOverride": formData.numberOfPullsOverride ? parseInt(formData.numberOfPullsOverride) : "",
      "flags.vikarov-procurement.lootChanceOverride": formData.lootChanceOverride ? parseInt(formData.lootChanceOverride) : "",
      "flags.vikarov-procurement.description": formData.description || "",
      "flags.vikarov-procurement.allowDuplicates": formData.allowDuplicates || false
    };

    await this.actor.update(settings);

    console.log(`Saved configuration for ${this.actor.name}:`, settings);
    ui.notifications.info(`Procurement settings saved for ${this.actor.name}`);
  }

  activateListeners(html) {
    super.activateListeners(html);
    html.find(".vikarov-cancel-button").on("click", () => this.close());
  }
}

Hooks.on("renderActorSheet", debounce((sheet, html) => {
  if (!(sheet instanceof dnd5e.applications.actor.ActorSheet5eNPC) || sheet.actor.type !== "npc") return;

  // Track if this is the initial render
  if (!sheet._isInitialRender) {
    sheet._isInitialRender = true; // Mark as initial render
  } else {
    console.log(`Skipping icon addition for ${sheet.actor.name} during re-render`);
    return; // Skip icon addition on re-renders
  }

  // Check if the icon already exists (shouldn't happen on initial render, but just in case)
  if (html.find(".vikarov-config-container").length > 0) {
    console.log(`Procurement config icon already added to ${sheet.actor.name}`);
    return;
  }

  const windowHeader = html.find(".window-header");
  if (windowHeader.length === 0) {
    console.warn(`Window header not found for ${sheet.actor.name} NPC sheet during initial render, skipping icon addition`);
    return;
  }

  const headerElements = windowHeader.find(".header-elements");
  if (headerElements.length === 0) {
    console.warn(`Header elements not found for ${sheet.actor.name} NPC sheet during initial render, skipping icon addition`);
    return;
  }

  addConfigIcon(headerElements, sheet);
}, 100)); // Debounce delay of 100ms

function addConfigIcon(headerElements, sheet) {
  const configIconContainer = $("<div>")
    .addClass("vikarov-config-container");

  const configIcon = $("<i>")
    .addClass("fas fa-leaf vikarov-config-icon")
    .attr("title", "Procurement Configuration")
    .on("click", (event) => {
      event.preventDefault();
      event.stopPropagation();
      new ProcurementConfigDialog(sheet.actor).render(true);
    });

  configIconContainer.append(configIcon);

  // Insert the container before the CopyUuid icon
  const copyUuidLink = headerElements.closest(".window-header").find(".document-id-link");
  if (copyUuidLink.length > 0) {
    copyUuidLink.before(configIconContainer);
    console.log(`Added procurement config icon to ${sheet.actor.name} in window-header`);
  } else {
    console.warn("CopyUuid link not found, appending config icon to header elements");
    headerElements.append(configIconContainer);
  }
}