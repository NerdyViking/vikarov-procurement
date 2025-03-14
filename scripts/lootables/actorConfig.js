console.log("Vikarov’s Guide to Procurement: actorConfig.js loaded");

import { getSetting } from "../shared/settings.js";

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
      lootChanceOverride: this.actor.getFlag("vikarov-procurement", "lootChanceOverride") || ""
    };

    return foundry.utils.mergeObject({
      tables,
      globalNumberOfPulls,
      globalLootChance
    }, actorData);
  }

  async _updateObject(event, formData) {
    const settings = {
      lootable: formData.lootable || false,
      harvestable: formData.harvestable || false,
      lootTable: formData.lootTable || "",
      reagentTable: formData.reagentTable || "",
      numberOfPullsOverride: formData.numberOfPullsOverride ? parseInt(formData.numberOfPullsOverride) : "",
      lootChanceOverride: formData.lootChanceOverride ? parseInt(formData.lootChanceOverride) : ""
    };

    await this.actor.setFlag("vikarov-procurement", "lootable", settings.lootable);
    await this.actor.setFlag("vikarov-procurement", "harvestable", settings.harvestable);
    await this.actor.setFlag("vikarov-procurement", "lootTable", settings.lootTable);
    await this.actor.setFlag("vikarov-procurement", "reagentTable", settings.reagentTable);
    await this.actor.setFlag("vikarov-procurement", "numberOfPullsOverride", settings.numberOfPullsOverride);
    await this.actor.setFlag("vikarov-procurement", "lootChanceOverride", settings.lootChanceOverride);

    console.log(`Saved configuration for ${this.actor.name}:`, settings);
    ui.notifications.info(`Procurement settings saved for ${this.actor.name}`);
  }

  activateListeners(html) {
    super.activateListeners(html);
    html.find(".vikarov-cancel-button").on("click", () => this.close());
  }
}

// ... (previous code unchanged until the hook)

Hooks.on("renderActorSheet", (sheet, html) => {
    if (!(sheet instanceof dnd5e.applications.actor.ActorSheet5eNPC) || sheet.actor.type !== "npc") return;
  
    const headerElements = html.find(".header-elements");
    if (headerElements.length === 0) {
      console.warn("Header elements not found for NPC sheet");
      return;
    }
  
    // Create a container for the icon to control its space
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
    html.find(".window-header .document-id-link").before(configIconContainer);
    console.log(`Added procurement config icon to ${sheet.actor.name} in window-header`);
  });
