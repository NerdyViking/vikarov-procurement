console.log("Vikarov’s Guide to Procurement: tableUi.js loaded");

import { HandlebarsApplicationMixin } from "foundry/client/apps/api/index.mjs";

export class ReagentTableDialog extends HandlebarsApplicationMixin(foundry.applications.api.ApplicationV2) {
  constructor(options = {}) {
    super(options);
    this.selectedTableId = null;
    this.editMode = false;
  }

  static DEFAULT_OPTIONS = {
    id: "reagent-table-dialog",
    classes: ["vikarov", "reagent-table-dialog"],
    tag: "form",
    window: {
      title: "Reagent Tables",
      resizable: true
    },
    position: {
      width: 800,
      height: 600
    },
    actions: {
      "select-table": this._onSelectTable,
      "create-table": this._onCreateTable,
      "edit-table": this._onEditTable,
      "save-table": this._onSaveTable,
      "cancel-table": this._onCancelTable,
      "delete-table": this._onDeleteTable,
      "delete-entry": this._onDeleteEntry,
      "open-item-sheet": this._onOpenItemSheet,
      "test-roll": this._onTestRoll
    }
  };

  static PARTS = {
    main: {
      template: "templates/tableUi.hbs"
    }
  };

  async _prepareContext(options) {
    const reagentTables = game.tables.filter(t => t.getFlag("vikarov-procurement", "reagentTable"));
    let selectedTable = this.selectedTableId ? game.tables.get(this.selectedTableId) : null;

    if (!selectedTable && reagentTables.length > 0) {
      this.selectedTableId = reagentTables[0].id;
      selectedTable = reagentTables[0];
    }

    const tableData = selectedTable ? {
      id: selectedTable.id,
      name: selectedTable.name,
      description: selectedTable.description || "",
      results: selectedTable.results.map(r => {
        const item = r.getFlag("vikarov-procurement", "itemUuid") ? fromUuidSync(r.getFlag("vikarov-procurement", "itemUuid")) : null;
        return {
          id: r.id,
          uuid: r.getFlag("vikarov-procurement", "itemUuid") || "",
          name: r.text || (item ? item.name : "Unnamed"),
          weight: r.weight,
          icon: item ? item.img : "icons/svg/mystery-man.svg"
        };
      })
    } : null;

    console.log("Table Dialog getData:", {
      tables: reagentTables.map(t => ({ id: t.id, name: t.name })),
      selectedTableId: this.selectedTableId,
      tableData,
      editMode: this.editMode,
      isGM: game.user.isGM
    });

    return {
      tables: reagentTables.map(t => ({ id: t.id, name: t.name })),
      selectedTableId: this.selectedTableId,
      tableData,
      editMode: this.editMode,
      isGM: game.user.isGM
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

    const form = this.element.querySelector(".reagent-table-form");
    if (form) {
      form.addEventListener("submit", (event) => {
        event.preventDefault();
        this._onSaveTable(event);
      });
    }

    this.element.querySelectorAll("[data-action]").forEach(element => {
      element.addEventListener("click", (event) => {
        const action = element.dataset.action;
        if (this.constructor.DEFAULT_OPTIONS.actions[action]) {
          this.constructor.DEFAULT_OPTIONS.actions[action].call(this, event);
        }
      });
    });

    // Setup drag-and-drop
    const dropZone = this.element.querySelector(".reagent-table-entry-dropzone");
    if (dropZone) {
      dropZone.addEventListener("dragover", (event) => event.preventDefault());
      dropZone.addEventListener("drop", (event) => this._onDrop(event));
    }
  }

  async _onSelectTable(event) {
    this.selectedTableId = event.currentTarget.dataset.tableId;
    this.editMode = false;
    await this.render();
  }

  async _onCreateTable() {
    const newTable = await RollTable.create({
      name: "New Reagent Table",
      description: "A new table for reagents",
      flags: { "vikarov-procurement": { reagentTable: true } }
    });
    this.selectedTableId = newTable.id;
    this.editMode = true;
    await this.render();
  }

  async _onEditTable() {
    this.editMode = true;
    await this.render();
  }

  async _onSaveTable(event) {
    event.preventDefault();
    const form = this.element.querySelector(".reagent-table-form");
    if (!form) return;

    const formData = new FormData(form);
    const table = game.tables.get(this.selectedTableId);
    if (!table) return;

    const existingResults = table.results.reduce((acc, r) => ({ ...acc, [r.id]: r }), {});
    const updates = [];
    const creates = [];
    this.element.querySelectorAll(".reagent-table-entry").forEach(entry => {
      const id = entry.dataset.id;
      const uuid = entry.dataset.itemUuid;
      const name = entry.querySelector(".item-name").textContent;
      const weight = parseInt(formData.get(`weight-${id}`)) || 1;
      if (uuid) {
        if (existingResults[id]) {
          updates.push({
            _id: id,
            text: name,
            weight: weight,
            flags: { "vikarov-procurement": { itemUuid: uuid } }
          });
        } else {
          creates.push({
            type: CONST.TABLE_RESULT_TYPES.DOCUMENT,
            text: name,
            weight: weight,
            range: [1, 1],
            documentCollection: "Item",
            documentId: uuid.split(".").pop(),
            flags: { "vikarov-procurement": { itemUuid: uuid } }
          });
        }
      }
    });

    if (updates.length > 0) await table.updateEmbeddedDocuments("TableResult", updates);
    if (creates.length > 0) await table.createEmbeddedDocuments("TableResult", creates);

    await table.update({
      name: formData.get("tableName"),
      description: formData.get("description")
    });

    this.editMode = false;
    await this.render();
    ui.notifications.info(`Table ${table.name} updated.`);
  }

  _onCancelTable() {
    this.editMode = false;
    this.render();
  }

  async _onDeleteTable() {
    const table = game.tables.get(this.selectedTableId);
    if (!table) return;

    await DialogV2.confirm({
      window: { title: "Delete Table" },
      content: `Are you sure you want to delete ${table.name}?`,
      modal: true,
      yes: async () => {
        await table.delete();
        this.selectedTableId = null;
        this.editMode = false;
        await this.render();
        ui.notifications.info(`Table ${table.name} deleted.`);
      }
    });
  }

  async _onDeleteEntry(event) {
    const entry = event.currentTarget.closest(".reagent-table-entry");
    const id = entry.dataset.id;
    const table = game.tables.get(this.selectedTableId);
    if (table && id) {
      await table.deleteEmbeddedDocuments("TableResult", [id]);
      await this.render();
      ui.notifications.info("Entry deleted.");
    }
  }

  async _onOpenItemSheet(event) {
    event.stopPropagation();
    const entry = event.currentTarget.closest(".reagent-table-entry");
    const uuid = entry.dataset.itemUuid;
    if (uuid) {
      const item = await fromUuid(uuid);
      if (item) item.sheet.render(true);
    }
  }

  async _onTestRoll() {
    const table = game.tables.get(this.selectedTableId);
    if (!table) return;
    const result = await table.roll();
    const items = result.results.map(r => r.text).join(", ");
    ui.notifications.info(`Test roll result: ${items}`);
  }

  async _onDrop(event) {
    if (!this.editMode || !game.user.isGM) return;
    event.preventDefault();
    const data = JSON.parse(event.dataTransfer.getData("text/plain"));
    if (data.type !== "Item") return;

    const item = await Item.fromDropData(data);
    if (!item) return;

    const table = game.tables.get(this.selectedTableId);
    if (!table) return;

    const newResult = {
      type: CONST.TABLE_RESULT_TYPES.DOCUMENT,
      text: item.name,
      weight: 1,
      range: [1, 1],
      documentCollection: "Item",
      documentId: item.id,
      flags: { "vikarov-procurement": { itemUuid: item.uuid } }
    };

    await table.createEmbeddedDocuments("TableResult", [newResult]);
    await this.render();
    ui.notifications.info(`Added ${item.name} to ${table.name}.`);
  }
}

export function openTableDialog() {
  new ReagentTableDialog().render(true);
}