import { splitGold } from "../core/utils.js";

Handlebars.registerHelper("selected", function(condition) {
  return condition ? "selected" : "";
});

export class LootSheetVikarov extends foundry.applications.sheets.DocumentSheetV2 {
  constructor(object, options = {}) {
    super(object, options);
    this._isTaking = false;
    this._isEditable = game.user.isGM;
    this._partyMembers = [];
  }

  static DEFAULT_OPTIONS = {
    id: "loot-sheet-vikarov",
    classes: ["vikarov", "sheet", "loot-sheet"],
    window: {
      title: "Vikarov Loot Sheet",
      resizable: true
    },
    position: {
      width: 600,
      height: 400
    },
    dragDrop: [
      { dragSelector: ".item-row .item-name", dropSelector: ".vikarov-loot-sheet" }
    ],
    actions: {
      "open-item": (event) => this._onOpenItem(event),
      "take-item": (event) => this._onTakeItem(event),
      "give-item": (event) => this._onGiveItem(event),
      "delete-item": (event) => this._onDeleteItem(event),
      "update-quantity": (event) => this._onUpdateQuantity(event),
      "select-actor": (event) => this._onSelectActor(event),
      "split-gold": (event) => this._onSplitGold(event),
      "take-gold": (event) => this._onTakeGold(event),
      "update-currency": (event) => this._onUpdateCurrency(event),
      "update-name": (event) => this._onUpdateName(event),
      "toggle-edit": (event) => this._onToggleEdit(event)
    }
  };

  static PARTS = {
    main: {
      template: "templates/lootSheet.hbs"
    }
  };

  async _prepareContext(options) {
    const data = await super._prepareContext(options);
    let ownedActors = game.actors.filter(a => a.type === "character" && a.testUserPermission(game.user, "OWNER"));
    const selectedActorId = game.user.character?.id || (ownedActors.length ? ownedActors[0].id : null);
    const selectedActor = game.actors.get(selectedActorId);

    let partyMembers = [];
    if (selectedActor) {
      const party = this._findActorParty(selectedActor);
      if (party) {
        partyMembers = party.system.members?.map(m => {
          if (typeof m.actor === "string") return m.actor;
          if (m.actor && typeof m.actor === "object" && m.actor.id) return m.actor.id;
          return null;
        }).filter(id => id) || [];
        ownedActors = ownedActors.filter(a => partyMembers.includes(a.id));
      } else {
        ownedActors = [selectedActor];
      }
    } else {
      ownedActors = [];
    }

    const items = this.actor.items.map(item => item.toObject());
    const itemCategories = [
      { name: "Weapons", items: items.filter(i => i.type === "weapon"), isGM: game.user.isGM, isEditable: this.isEditable },
      { name: "Armor", items: items.filter(i => i.type === "equipment" && i.system.armor), isGM: game.user.isGM, isEditable: this.isEditable },
      { name: "Consumables", items: items.filter(i => i.type === "consumable"), isGM: game.user.isGM, isEditable: this.isEditable },
      { name: "Other", items: items.filter(i => !["weapon", "consumable"].includes(i.type) && !(i.type === "equipment" && i.system.armor)), isGM: game.user.isGM, isEditable: this.isEditable }
    ].filter(cat => cat.items.length > 0);

    this._partyMembers = partyMembers;

    return {
      ...data,
      itemCategories,
      currency: foundry.utils.deepClone(this.actor.system.currency || { pp: 0, gp: 0, ep: 0, sp: 0, cp: 0 }),
      isGM: game.user.isGM,
      isEditable: this.isEditable,
      ownedActors,
      selectedActorId,
      description: this.actor.getFlag("vikarov-procurement", "description") || ""
    };
  }

  _configureRenderOptions(options) {
    super._configureRenderOptions(options);
    options.form = {
      submitOnChange: false,
      closeOnSubmit: false
    };
  }

  _onRender(context, options) {
    super._onRender(context, options);
    if (!(this.element instanceof HTMLElement)) return;

    // Remove disabled attributes based on permissions
    const canEdit = this.actor.testUserPermission(game.user, "OWNER") || game.user.isGM;
    if (canEdit) {
      this.element.querySelector("#actor-select").disabled = false;
      this.element.querySelectorAll(".take-btn").forEach(btn => btn.disabled = false);
      this.element.querySelectorAll(".give-btn").forEach(btn => btn.disabled = false);
      this.element.querySelectorAll(".split-gold-btn").forEach(btn => btn.disabled = false);
      this.element.querySelectorAll(".take-gold-btn").forEach(btn => btn.disabled = false);
      this.element.querySelectorAll(".delete-btn").forEach(btn => btn.disabled = !this.isEditable);
      this.element.querySelectorAll(".currency-input").forEach(input => input.disabled = !this.isEditable);
      this.element.querySelectorAll(".quantity-input").forEach(input => input.disabled = !this.isEditable);
      this.element.querySelector(".actor-name").disabled = !this.isEditable;
    } else {
      this.element.querySelectorAll(".delete-btn").forEach(btn => btn.disabled = true);
      this.element.querySelectorAll(".currency-input").forEach(input => input.disabled = true);
      this.element.querySelectorAll(".quantity-input").forEach(input => input.disabled = true);
      this.element.querySelector(".actor-name").disabled = true;
    }

    // Bind action listeners
    this.element.querySelectorAll("[data-action]").forEach(element => {
      element.addEventListener("click", (event) => {
        event.preventDefault();
        const action = element.dataset.action;
        if (this.constructor.DEFAULT_OPTIONS.actions[action]) {
          this.constructor.DEFAULT_OPTIONS.actions[action].call(this, event);
        }
      });
    });

    // Bind change listeners
    this.element.querySelector("#actor-select")?.addEventListener("change", (event) => this._onSelectActor(event));
    this.element.querySelectorAll(".quantity-input").forEach(input => {
      input.addEventListener("change", (event) => this._onUpdateQuantity(event));
    });
    this.element.querySelectorAll(".currency-input").forEach(input => {
      input.addEventListener("change", (event) => this._onUpdateCurrency(event));
    });
    this.element.querySelector(".actor-name")?.addEventListener("change", (event) => this._onUpdateName(event));
  }

  _findActorParty(actor) {
    if (!actor) return null;
    const parties = game.actors.filter(a => a.type === "group" && a.system.type?.value === "party");
    for (const party of parties) {
      const members = party.system.members || [];
      const memberIds = members.map(m => {
        if (typeof m.actor === "string") return m.actor;
        if (m.actor && typeof m.actor === "object" && m.actor.id) return m.actor.id;
        return null;
      }).filter(id => id);
      if (memberIds.includes(actor.id)) return party;
    }
    return null;
  }

  async _onOpenItem(event) {
    const itemId = event.currentTarget.closest(".item-row").dataset.itemId;
    const item = this.actor.items.get(itemId);
    if (item) item.sheet.render(true);
  }

  async _onTakeItem(event) {
    if (this._isTaking || !this.isEditable) return;
    this._isTaking = true;
    try {
      const itemId = event.currentTarget.dataset.itemId;
      await this._handleTakeItem(itemId);
    } finally {
      this._isTaking = false;
    }
  }

  async _onGiveItem(event) {
    if (!this.isEditable) return;
    const itemId = event.currentTarget.dataset.itemId;
    await this._handleGiveItem(itemId);
  }

  async _onDeleteItem(event) {
    if (!this.isEditable) return;
    const itemId = event.currentTarget.dataset.itemId;
    const item = this.actor.items.get(itemId);
    if (item) {
      await item.delete();
      ui.notifications.info(`Deleted ${item.name}.`);
      await this.render();
    }
  }

  async _onUpdateQuantity(event) {
    if (!this.isEditable) return;
    const itemId = event.currentTarget.dataset.itemId;
    const value = parseInt(event.currentTarget.value) || 1;
    const item = this.actor.items.get(itemId);
    if (item) {
      await item.update({ "system.quantity": value });
      await this.render();
    }
  }

  async _onSelectActor(event) {
    await this.render();
  }

  async _onSplitGold(event) {
    await this._handleSplitGold();
  }

  async _onTakeGold(event) {
    await this._handleTakeGold();
  }

  async _onUpdateCurrency(event) {
    if (!this.isEditable) return;
    const field = event.currentTarget.name;
    const value = parseInt(event.currentTarget.value) || 0;
    await this.actor.update({ [field]: value });
    await this.render();
  }

  async _onUpdateName(event) {
    if (!this.isEditable) return;
    const newName = event.currentTarget.value;
    await this.actor.update({ name: newName });
    await this.render();
  }

  async _onToggleEdit(event) {
    this._isEditable = !this._isEditable;
    await this.render();
  }

  async _handleTakeItem(itemId) {
    const item = this.actor.items.get(itemId);
    if (!item || !this.isEditable) return;

    const select = this.element.querySelector("#actor-select");
    if (!select) return;
    const targetActor = game.actors.get(select.value);
    if (!targetActor) {
      ui.notifications.warn("No valid target actor selected.");
      return;
    }

    const itemData = item.toObject();
    const existingItem = targetActor.items.find(i => i.name === itemData.name && i.type === itemData.type);
    if (existingItem) {
      const newQuantity = (existingItem.system.quantity || 1) + (itemData.system.quantity || 1);
      await existingItem.update({ "system.quantity": newQuantity });
    } else {
      await targetActor.createEmbeddedDocuments("Item", [itemData]);
    }

    if (item.system.quantity > 1) {
      await item.update({ "system.quantity": item.system.quantity - 1 });
    } else {
      await item.delete();
    }
    ui.notifications.info(`Took ${item.name} to ${targetActor.name}.`);
    await this.render();
  }

  async _handleGiveItem(itemId) {
    const item = this.actor.items.get(itemId);
    if (!item || !this.isEditable) return;

    const targetActor = await this._selectTargetActor();
    if (!targetActor) return;

    const itemData = item.toObject();
    const existingItem = targetActor.items.find(i => i.name === itemData.name && i.type === itemData.type);
    if (existingItem) {
      const newQuantity = (existingItem.system.quantity || 1) + (itemData.system.quantity || 1);
      await existingItem.update({ "system.quantity": newQuantity });
    } else {
      await targetActor.createEmbeddedDocuments("Item", [itemData]);
    }

    if (item.system.quantity > 1) {
      await item.update({ "system.quantity": item.system.quantity - 1 });
    } else {
      await item.delete();
    }
    ui.notifications.info(`Gave ${item.name} to ${targetActor.name}.`);
    await this.render();
  }

  async _handleSplitGold() {
    const currency = this.actor.system.currency || { pp: 0, gp: 0, ep: 0, sp: 0, cp: 0 };
    const totalCopper = (currency.pp * 1000) + (currency.gp * 100) + (currency.ep * 50) + (currency.sp * 10) + (currency.cp || 0);
    if (totalCopper <= 0) {
      ui.notifications.warn("No currency to split.");
      return;
    }

    const select = this.element.querySelector("#actor-select");
    if (!select) return;
    const selectedActor = game.actors.get(select.value);
    if (!selectedActor) {
      ui.notifications.warn("No valid actor selected.");
      return;
    }

    const party = this._findActorParty(selectedActor);
    if (!party) {
      ui.notifications.warn(`${selectedActor.name} is not in a party. Cannot split gold.`);
      return;
    }

    const partyMemberIds = party.system.members?.map(m => {
      if (typeof m.actor === "string") return m.actor;
      if (m.actor && typeof m.actor === "object" && m.actor.id) return m.actor.id;
      return null;
    }).filter(id => id) || [];
    const partyMembers = game.actors.filter(a => a.type === "character" && a.hasPlayerOwner && partyMemberIds.includes(a.id));
    if (!partyMembers.length) {
      ui.notifications.warn("No party members found to split gold.");
      return;
    }

    await splitGold(currency, partyMembers, this.actor);
    ui.notifications.info("Gold split among party.");
    await this.render();
  }

  async _handleTakeGold() {
    const currency = this.actor.system.currency || { pp: 0, gp: 0, ep: 0, sp: 0, cp: 0 };
    const totalCopper = (currency.pp * 1000) + (currency.gp * 100) + (currency.ep * 50) + (currency.sp * 10) + (currency.cp || 0);
    if (totalCopper <= 0) {
      ui.notifications.warn("No currency to take.");
      return;
    }

    const select = this.element.querySelector("#actor-select");
    if (!select) return;
    const targetActor = game.actors.get(select.value);
    if (!targetActor) {
      ui.notifications.warn("No valid target actor selected.");
      return;
    }

    const currentCurrency = targetActor.system.currency || { pp: 0, gp: 0, ep: 0, sp: 0, cp: 0 };
    const newCurrency = {
      pp: (currentCurrency.pp || 0) + (currency.pp || 0),
      gp: (currentCurrency.gp || 0) + (currency.gp || 0),
      ep: (currentCurrency.ep || 0) + (currency.ep || 0),
      sp: (currentCurrency.sp || 0) + (currency.sp || 0),
      cp: (currentCurrency.cp || 0) + (currency.cp || 0)
    };
    if (this.isEditable) {
      await targetActor.update({ "system.currency": newCurrency });
      await this.actor.update({ "system.currency": { pp: 0, gp: 0, ep: 0, sp: 0, cp: 0 } });
    } else {
      ui.notifications.warn("Enable edit mode to take gold.");
      return;
    }

    ui.notifications.info(`Took all currency to ${targetActor.name}.`);
    await this.render();
  }

  _onDragStart(event) {
    const itemId = event.currentTarget.closest(".item-row").dataset.itemId;
    const item = this.actor.items.get(itemId);
    if (item) {
      event.dataTransfer.setData("text/plain", JSON.stringify({
        type: "Item",
        uuid: item.uuid,
        actorId: this.actor.id
      }));
    }
  }

  async _onDrop(event) {
    event.preventDefault();
    const data = JSON.parse(event.dataTransfer.getData("text/plain"));
    if (data.type !== "Item" || !this.isEditable) {
      ui.notifications.warn("Enable edit mode to add items.");
      return;
    }

    const item = await Item.fromDropData(data);
    if (item) {
      await this.actor.createEmbeddedDocuments("Item", [item.toObject()]);
      ui.notifications.info(`Added ${item.name} to loot sheet.`);
      await this.render();
    }
  }

  get isEditable() {
    return game.user.isGM ? (this._isEditable !== false) : this.actor.testUserPermission(game.user, "OWNER");
  }

  async _selectTargetActor() {
    const actors = game.actors.filter(a => a !== this.actor && ["character", "npc"].includes(a.type));
    const select = this.element.querySelector("#actor-select");
    const selectedActor = select ? game.actors.get(select.value) : null;
    let filteredActors = actors;
    if (selectedActor && this._partyMembers) {
      filteredActors = actors.filter(a => this._partyMembers.includes(a.id));
    } else if (selectedActor) {
      filteredActors = [selectedActor];
    }

    const content = `
      <h3>Give item to:</h3>
      <select id="target-actor">
        ${filteredActors.map(a => `<option value="${a.id}">${a.name}</option>`).join("")}
      </select>
    `;

    const result = await DialogV2.prompt({
      window: { title: "Select Target" },
      content,
      buttons: [
        {
          label: "Give",
          callback: (html) => game.actors.get(html.querySelector("#target-actor").value)
        },
        {
          label: "Cancel",
          callback: () => null
        }
      ],
      modal: true
    });

    return result;
  }

  async close(options = {}) {
    return super.close(options);
  }
}

export function shouldUseLootSheet(token) {
  return !token.actorLink && token.getFlag("vikarov-procurement", "lootable");
}

Hooks.on("renderLootSheetVikarov", (sheet, html) => {
  if (!game.user.isGM) return;

  const header = html.querySelector(".window-header");
  const docLink = header.querySelector(".document-id-link");

  if (header && docLink) {
    // Remove and re-add the edit toggle container to force DOM update
    header.querySelector(".vikarov-edit-container")?.remove();
    
    const editIconContainer = document.createElement("div");
    editIconContainer.classList.add("vikarov-edit-container");

    const editIcon = document.createElement("i");
    editIcon.classList.add("fas", "vikarov-edit-toggle", sheet.isEditable ? "fa-lock-open" : "fa-lock");
    editIcon.title = sheet.isEditable ? "Disable Edit Mode" : "Enable Edit Mode";

    editIconContainer.appendChild(editIcon);
    docLink.after(editIconContainer);

    editIconContainer.querySelector(".vikarov-edit-toggle").addEventListener("click", async (event) => {
      event.preventDefault();
      const newState = !sheet.isEditable;
      sheet._isEditable = newState;
      await sheet.render();
    });
  }
});