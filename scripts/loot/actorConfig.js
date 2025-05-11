console.log("Vikarov’s Guide to Procurement: actorConfig.js loaded");

import { HandlebarsApplicationMixin } from "foundry/client/apps/api/index.mjs";
import { getSetting } from "../core/settings.js";

// Debounce function to limit hook execution
const debounce = (func, wait) => {
  let timeout;
  return (...args) => {
    clearTimeout(timeout);
    timeout = setTimeout(() => func.apply(this, args), wait);
  };
};

export class ProcurementConfigDialog extends HandlebarsApplicationMixin(foundry.applications.api.ApplicationV2) {
  constructor(actor, options = {}) {
    super(options);
    this.actor = actor;
  }

  static DEFAULT_OPTIONS = {
    id: "procurement-config-dialog",
    classes: ["vikarov", "procurement-config"],
    tag: "form",
    window: {
      title: "Procurement Configuration",
      resizable: true
    },
    position: {
      width: 400,
      height: "auto"
    },
    actions: {
      "cancel": () => this.close()
    }
  };

  static PARTS = {
    main: {
      template: "templates/configDialog.hbs"
    }
  };

  async _prepareContext(options) {
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

    return {
      tables,
      globalNumberOfPulls,
      globalLootChance,
      ...actorData
    };
  }

  _configureRenderOptions(options) {
    super._configureRenderOptions(options);
    options.form = {
      submitOnChange: false,
      closeOnSubmit: true
    };
  }

  _onRender(context, options) {
    super._onRender(context, options);
    if (!(this.element instanceof HTMLElement)) return;

    const form = this.element.querySelector(".vikarov-config-form");
    if (form) {
      form.addEventListener("submit", async (event) => {
        event.preventDefault();
        const formData = new FormData(form);
        await this._updateObject(event, Object.fromEntries(formData));
      });
    }

    this.element.querySelectorAll("[data-action]").forEach(element => {
      element.addEventListener("click", () => {
        const action = element.dataset.action;
        if (this.constructor.DEFAULT_OPTIONS.actions[action]) {
          this.constructor.DEFAULT_OPTIONS.actions[action].call(this);
        }
      });
    });
  }

  async _updateObject(event, formData) {
    const settings = {
      "flags.vikarov-procurement.lootable": formData.lootable === "on" || false,
      "flags.vikarov-procurement.harvestable": formData.harvestable === "on" || false,
      "flags.vikarov-procurement.lootTable": formData.lootTable || "",
      "flags.vikarov-procurement.reagentTable": formData.reagentTable || "",
      "flags.vikarov-procurement.numberOfPullsOverride": formData.numberOfPullsOverride ? parseInt(formData.numberOfPullsOverride) : "",
      "flags.vikarov-procurement.lootChanceOverride": formData.lootChanceOverride ? parseInt(formData.lootChanceOverride) : "",
      "flags.vikarov-procurement.description": formData.description || "",
      "flags.vikarov-procurement.allowDuplicates": formData.allowDuplicates === "on" || false
    };

    await this.actor.update(settings);

    console.log(`Saved configuration for ${this.actor.name}:`, settings);
    ui.notifications.info(`Procurement settings saved for ${this.actor.name}`);
  }
}

Hooks.on("renderActorSheet", debounce((sheet, html) => {
  if (!(sheet instanceof dnd5e.applications.actor.ActorSheet5eNPC) || sheet.actor.type !== "npc") return;

  // Track if this is the initial render
  if (!sheet._isInitialRender) {
    sheet._isInitialRender = true;
  } else {
    console.log(`Skipping icon addition for ${sheet.actor.name} during re-render`);
    return;
  }

  // Check if the icon already exists
  if (html.querySelector(".vikarov-config-container")) {
    console.log(`Procurement config icon already added to ${sheet.actor.name}`);
    return;
  }

  const windowHeader = html.querySelector(".window-header");
  if (!windowHeader) {
    console.warn(`Window header not found for ${sheet.actor.name} NPC sheet during initial render, skipping icon addition`);
    return;
  }

  const headerElements = windowHeader.querySelector(".header-elements");
  if (!headerElements) {
    console.warn(`Header elements not found for ${sheet.actor.name} NPC sheet during initial render, skipping icon addition`);
    return;
  }

  addConfigIcon(headerElements, sheet);
}, 100));

function addConfigIcon(headerElements, sheet) {
  const configIconContainer = document.createElement("div");
  configIconContainer.classList.add("vikarov-config-container");

  const configIcon = document.createElement("i");
  configIcon.classList.add("fas", "fa-leaf", "vikarov-config-icon");
  configIcon.title = "Procurement Configuration";
  configIcon.addEventListener("click", (event) => {
    event.preventDefault();
    event.stopPropagation();
    new ProcurementConfigDialog(sheet.actor).render(true);
  });

  configIconContainer.appendChild(configIcon);

  // Insert the container before the CopyUuid icon
  const copyUuidLink = headerElements.closest(".window-header").querySelector(".document-id-link");
  if (copyUuidLink) {
    copyUuidLink.before(configIconContainer);
    console.log(`Added procurement config icon to ${sheet.actor.name} in window-header`);
  } else {
    console.warn("CopyUuid link not found, appending config icon to header elements");
    headerElements.appendChild(configIconContainer);
  }
}