console.log("Vikarov’s Guide to Procurement: lootSheet.js loaded");

import { splitGold } from "../shared/utils.js";

export class LootSheetVikarov extends ActorSheet {
  static get defaultOptions() {
    return foundry.utils.mergeObject(super.defaultOptions, {
      classes: ["vikarov", "sheet", "loot-sheet"],
      template: "modules/vikarov-procurement/templates/lootSheet.hbs",
      width: 600,
      height: 400,
      dragDrop: [{ dragSelector: ".item", dropSelector: null }]
    });
  }

  getData() {
    const data = super.getData();
    const items = this.actor.items.map(item => item.toObject());

    // Categorize items by type
    const itemCategories = [
      { name: "Weapons", items: items.filter(item => item.type === "weapon") },
      { name: "Armor", items: items.filter(item => item.type === "equipment" && item.system.armor) },
      { name: "Consumables", items: items.filter(item => item.type === "consumable") },
      { name: "Other", items: items.filter(item => item.type !== "weapon" && item.type !== "consumable" && !(item.type === "equipment" && item.system.armor)) }
    ];

    return {
      ...data,
      itemCategories: itemCategories.filter(category => category.items.length > 0),
      currency: foundry.utils.deepClone(this.actor.system.currency),
      isGM: game.user.isGM,
      isEditable: this.isEditable
    };
  }

  activateListeners(html) {
    super.activateListeners(html);

    // Item grid click to open item sheet (name grid or icon)
    html.find(".item-name, .item-icon").on("click", event => {
      const itemId = event.currentTarget.dataset.itemId;
      const item = this.actor.items.get(itemId);
      if (item) {
        item.sheet.render(true);
      }
    });

    // Placeholder for "Take" button
    html.find(".take-btn").on("click", event => {
      const itemId = event.currentTarget.dataset.itemId;
      const item = this.actor.items.get(itemId);
      console.log(`Take item ${item.name} (NYI)`);
      ui.notifications.info(`Take item ${item.name} (Not Yet Implemented)`);
    });

    // Placeholder for "Give" button
    html.find(".give-btn").on("click", event => {
      const itemId = event.currentTarget.dataset.itemId;
      const item = this.actor.items.get(itemId);
      console.log(`Give item ${item.name} (NYI)`);
      ui.notifications.info(`Give item ${item.name} (Not Yet Implemented)`);
    });

    // Split Gold button
    if (game.user.isGM) {
      html.find(".split-gold-btn").on("click", async event => {
        event.preventDefault();
        const currency = this.actor.system.currency;
        const partyMembers = game.actors.filter(actor => actor.type === "character" && actor.hasPlayerOwner);
        if (partyMembers.length === 0) {
          ui.notifications.warn("No party members found to split gold.");
          return;
        }
        await splitGold(currency, partyMembers, this.actor);
        ui.notifications.info("Gold split among party members.");
      });

      // GM Edit Toggle
      html.find(".gm-edit-toggle").on("change", event => {
        const isEditable = event.currentTarget.checked;
        this.setEditable(isEditable);
        this.render();
      });
    }
  }

  // Enable drag and drop for items
  _onDragStart(event) {
    const li = event.currentTarget.closest(".item-row");
    const itemId = li.dataset.itemId;
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

    if (data.type !== "Item" || !this.isEditable) return;

    const item = await Item.fromDropData(data);
    if (!item) return;

    // Add the dropped item to the loot sheet's inventory
    await this.actor.createEmbeddedDocuments("Item", [item.toObject()]);
    ui.notifications.info(`Added ${item.name} to the loot sheet.`);
  }

  // Override isEditable based on GM toggle
  get isEditable() {
    return game.user.isGM && (this._isEditable || false);
  }

  setEditable(isEditable) {
    this._isEditable = isEditable;
  }

  async close(options = {}) {
    console.log("Closing LootSheetVikarov for", this.actor.name);
    try {
      await this.submit();
    } catch (error) {
      console.warn("No form data to submit or submission failed:", error);
    }
    return super.close(options);
  }

  _getSubmitData(updateData = {}) {
    return foundry.utils.mergeObject(super._getSubmitData(updateData), {});
  }
}

export function shouldUseLootSheet(token) {
  return !token.actorLink && token.getFlag("vikarov-procurement", "lootable");
}