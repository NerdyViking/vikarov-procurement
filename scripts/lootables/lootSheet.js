import { splitGold } from "../shared/utils.js";

Handlebars.registerHelper("selected", function(condition) {
  return condition ? "selected" : "";
});

export class LootSheetVikarov extends ActorSheet {
  static get defaultOptions() {
    return foundry.utils.mergeObject(super.defaultOptions, {
      classes: ["vikarov", "sheet", "loot-sheet"],
      template: "modules/vikarov-procurement/templates/lootSheet.hbs",
      width: 600,
      height: 400,
      dragDrop: [{ dragSelector: ".item-row .item-name", dropSelector: null }]
    });
  }

  getData() {
    const data = super.getData();
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

    console.log("Debug: getData - isGM:", game.user.isGM, "isEditable:", this.isEditable);
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

  _defaultData(data) {
    return {
      ...data,
      itemCategories: [],
      currency: { pp: 0, gp: 0, ep: 0, sp: 0, cp: 0 },
      isGM: game.user.isGM,
      isEditable: false,
      ownedActors: [],
      selectedActorId: null,
      description: ""
    };
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

  activateListeners(html) {
    super.activateListeners(html);

    // Debug element counts
    console.log("Debug: activateListeners - Delete buttons:", html.find(".delete-btn").length);
    console.log("Debug: activateListeners - Currency inputs:", html.find(".currency-input").length);
    console.log("Debug: activateListeners - Quantity inputs:", html.find(".quantity-input").length);

    // Remove disabled attributes based on permissions
    const canEdit = this.actor.testUserPermission(game.user, "OWNER") || game.user.isGM;
    if (canEdit) {
      html.find("#actor-select").prop("disabled", false);
      html.find(".take-btn").prop("disabled", false);
      html.find(".give-btn").prop("disabled", false);
      html.find(".split-gold-btn").prop("disabled", false);
      html.find(".take-gold-btn").prop("disabled", false);
      html.find(".delete-btn").prop("disabled", !this.isEditable);
      html.find(".currency-input").prop("disabled", !this.isEditable);
      html.find(".quantity-input").prop("disabled", !this.isEditable);
      html.find(".actor-name").prop("disabled", !this.isEditable);
    } else {
      html.find(".delete-btn").prop("disabled", true);
      html.find(".currency-input").prop("disabled", true);
      html.find(".quantity-input").prop("disabled", true);
      html.find(".actor-name").prop("disabled", true);
    }

    // Item click to open sheet
    html.find(".item-name, .item-icon").on("click", (event) => {
      const itemId = event.currentTarget.closest(".item-row").dataset.itemId;
      const item = this.actor.items.get(itemId);
      if (item) item.sheet.render(true);
    });

    // Take button
    html.find(".take-btn").on("click", async (event) => {
      const itemId = event.currentTarget.dataset.itemId;
      if (this._isTaking || !this.isEditable) return;
      this._isTaking = true;
      try {
        await this._handleTakeItem(itemId, html);
      } finally {
        this._isTaking = false;
      }
    });

    // Give button
    html.find(".give-btn").on("click", async (event) => {
      const itemId = event.currentTarget.dataset.itemId;
      if (!this.isEditable) return;
      await this._handleGiveItem(itemId);
    });

    // Delete button (GM only)
    html.find(".delete-btn").on("click", async (event) => {
      const itemId = event.currentTarget.dataset.itemId;
      if (!this.isEditable) return;
      const item = this.actor.items.get(itemId);
      if (item) {
        await item.delete();
        ui.notifications.info(`Deleted ${item.name}.`);
        this.render();
      }
    });

    // Quantity input updates
    html.find(".quantity-input").on("change", async (event) => {
      if (!this.isEditable) return;
      const itemId = event.currentTarget.dataset.itemId;
      const value = parseInt(event.currentTarget.value) || 1;
      const item = this.actor.items.get(itemId);
      if (item) {
        await item.update({ "system.quantity": value });
        this.render();
      }
    });

    // Actor dropdown
    const actorSelect = html.find("#actor-select");
    actorSelect.on("change", (event) => {
      this.render();
    });
    actorSelect.css({ "pointer-events": "auto", "cursor": "pointer" });

    // Split Gold button
    html.find(".split-gold-btn").on("click", async (event) => {
      event.preventDefault();
      await this._handleSplitGold(html);
    });

    // Take Gold button
    html.find(".take-gold-btn").on("click", async (event) => {
      event.preventDefault();
      await this._handleTakeGold(html);
    });

    // Currency input updates
    html.find(".currency-input").on("change", async (event) => {
      if (!this.isEditable) return;
      const field = event.currentTarget.name;
      const value = parseInt(event.currentTarget.value) || 0;
      await this.actor.update({ [field]: value });
      this.render();
    });

    // Name input update
    html.find(".actor-name").on("change", async (event) => {
      if (!this.isEditable) return;
      const newName = event.currentTarget.value;
      await this.actor.update({ name: newName });
      this.render();
    });
  }

  async _handleTakeItem(itemId, html) {
    const item = this.actor.items.get(itemId);
    if (!item || !this.isEditable) return;

    const select = html.find("#actor-select")[0];
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
    this.render();
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
    this.render();
  }

  async _handleSplitGold(html) {
    const currency = this.actor.system.currency || { pp: 0, gp: 0, ep: 0, sp: 0, cp: 0 };
    const totalCopper = (currency.pp * 1000) + (currency.gp * 100) + (currency.ep * 50) + (currency.sp * 10) + (currency.cp || 0);
    if (totalCopper <= 0) {
      ui.notifications.warn("No currency to split.");
      return;
    }

    const select = html.find("#actor-select")[0];
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
    this.render();
  }

  async _handleTakeGold(html) {
    const currency = this.actor.system.currency || { pp: 0, gp: 0, ep: 0, sp: 0, cp: 0 };
    const totalCopper = (currency.pp * 1000) + (currency.gp * 100) + (currency.ep * 50) + (currency.sp * 10) + (currency.cp || 0);
    if (totalCopper <= 0) {
      ui.notifications.warn("No currency to take.");
      return;
    }

    const select = html.find("#actor-select")[0];
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
    this.render();
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
    const data = TextEditor.getDragEventData(event);
    if (data.type !== "Item" || !this.isEditable) {
      ui.notifications.warn("Enable edit mode to add items.");
      return;
    }

    const item = await Item.fromDropData(data);
    if (item) {
      await this.actor.createEmbeddedDocuments("Item", [item.toObject()]);
      ui.notifications.info(`Added ${item.name} to loot sheet.`);
      this.render();
    }
  }

  get isEditable() {
    return game.user.isGM ? (this._isEditable !== false) : this.actor.testUserPermission(game.user, "OWNER");
  }

  setEditable(isEditable) {
    this._isEditable = isEditable;
    console.log("Debug: Editable state set to:", this._isEditable);
  }

  async _selectTargetActor() {
    const actors = game.actors.filter(a => a !== this.actor && ["character", "npc"].includes(a.type));
    const select = document.querySelector("#actor-select");
    const selectedActor = select ? game.actors.get(select.value) : null;
    let filteredActors = actors;
    if (selectedActor && this._partyMembers) {
      filteredActors = actors.filter(a => this._partyMembers.includes(a.id));
    } else if (selectedActor) {
      filteredActors = [selectedActor];
    }

    return new Promise(resolve => {
      new Dialog({
        title: "Select Target",
        content: `
          <h3>Give item to:</h3>
          <select id="target-actor">
            ${filteredActors.map(a => `<option value="${a.id}">${a.name}</option>`).join("")}
          </select>
        `,
        buttons: {
          confirm: {
            label: "Give",
            callback: html => resolve(game.actors.get(html.find("#target-actor")[0].value))
          },
          cancel: { label: "Cancel", callback: () => resolve(null) }
        },
        default: "confirm"
      }).render(true);
    });
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

  console.log("Debug: renderLootSheetVikarov hook triggered, sheet:", sheet.actor.name, "isEditable:", sheet.isEditable);
  const header = html.find(".window-header");
  const docLink = header.find(".document-id-link");

  if (header.length && docLink.length) {
    // Remove and re-add the edit toggle container to force DOM update
    header.find(".vikarov-edit-container").remove();
    
    const editIconContainer = $("<div>")
      .addClass("vikarov-edit-container");
    const editIcon = $("<i>")
      .attr("class", "fas vikarov-edit-toggle " + (sheet.isEditable ? "fa-lock-open" : "fa-lock"))
      .attr("title", sheet.isEditable ? "Disable Edit Mode" : "Enable Edit Mode");
    
    console.log("Debug: Edit toggle icon class set to:", editIcon.attr("class"));

    editIconContainer.append(editIcon);
    docLink.after(editIconContainer);

    editIconContainer.find(".vikarov-edit-toggle").on("click", (event) => {
      event.preventDefault();
      const newState = !sheet.isEditable;
      sheet.setEditable(newState);
      console.log("Debug: Edit toggle clicked, new state:", newState, "isEditable now:", sheet.isEditable);
      // Force header update by removing and re-adding the container
      header.find(".vikarov-edit-container").remove();
      const newIconContainer = $("<div>")
        .addClass("vikarov-edit-container");
      const newIcon = $("<i>")
        .attr("class", "fas vikarov-edit-toggle " + (newState ? "fa-lock-open" : "fa-lock"))
        .attr("title", newState ? "Disable Edit Mode" : "Enable Edit Mode");
      newIconContainer.append(newIcon);
      docLink.after(newIconContainer);
      // Re-bind the click event
      newIconContainer.find(".vikarov-edit-toggle").on("click", (e) => {
        e.preventDefault();
        const updatedState = !sheet.isEditable;
        sheet.setEditable(updatedState);
        console.log("Debug: Edit toggle clicked, new state:", updatedState, "isEditable now:", sheet.isEditable);
        // Repeat the header update process
        header.find(".vikarov-edit-container").remove();
        const updatedIconContainer = $("<div>")
          .addClass("vikarov-edit-container");
        const updatedIcon = $("<i>")
          .attr("class", "fas vikarov-edit-toggle " + (updatedState ? "fa-lock-open" : "fa-lock"))
          .attr("title", updatedState ? "Disable Edit Mode" : "Enable Edit Mode");
        updatedIconContainer.append(updatedIcon);
        docLink.after(updatedIconContainer);
        sheet.render(true);
      });
      sheet.render(true);
    });
  }
});