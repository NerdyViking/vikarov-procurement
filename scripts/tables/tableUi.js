console.log("Vikarov’s Guide to Procurement: tableUi.js loaded");

export class ReagentTableDialog extends FormApplication {
  constructor(options = {}) {
    super(null, options);
    this.selectedTableId = null;
    this.editMode = false;
  }

  static get defaultOptions() {
    return foundry.utils.mergeObject(super.defaultOptions, {
      title: "Reagent Tables",
      template: "modules/vikarov-procurement/templates/tableUi.hbs",
      width: 800,
      height: 600,
      resizable: true,
      classes: ["vikarov", "reagent-table-dialog"],
      dragDrop: [{ dragSelector: null, dropSelector: ".reagent-table-entry-dropzone" }]
    });
  }

  getData() {
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

  activateListeners(html) {
    super.activateListeners(html);

    // Table selection
    html.find(".table-item").on("click", (event) => {
      this.selectedTableId = event.currentTarget.dataset.tableId;
      this.editMode = false;
      this.render(true);
    });

    // Create new table
    html.find(".create-table-btn").on("click", async () => {
      const newTable = await RollTable.create({
        name: "New Reagent Table",
        description: "A new table for reagents",
        flags: { "vikarov-procurement": { reagentTable: true } }
      });
      this.selectedTableId = newTable.id;
      this.editMode = true;
      this.render(true);
    });

    // Edit mode toggle
    html.find(".edit-table-btn").on("click", () => {
      this.editMode = true;
      this.render(true);
    });

    // Save changes
    html.find(".save-table-btn").on("click", async (event) => {
      event.preventDefault();
      const formData = new FormData(html.find(".reagent-table-form")[0]);
      const table = game.tables.get(this.selectedTableId);
      if (!table) return;

      const existingResults = table.results.reduce((acc, r) => ({ ...acc, [r.id]: r }), {});
      const updates = [];
      const creates = [];
      html.find(".reagent-table-entry").each((i, entry) => {
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
      this.render(true);
      ui.notifications.info(`Table ${table.name} updated.`);
    });

    // Cancel edit
    html.find(".cancel-table-btn").on("click", () => {
      this.editMode = false;
      this.render(true);
    });

    // Delete table
    html.find(".delete-table-btn").on("click", async () => {
      const table = game.tables.get(this.selectedTableId);
      if (!table) return;
      await Dialog.confirm({
        title: "Delete Table",
        content: `Are you sure you want to delete ${table.name}?`,
        yes: async () => {
          await table.delete();
          this.selectedTableId = null;
          this.editMode = false;
          this.render(true);
          ui.notifications.info(`Table ${table.name} deleted.`);
        }
      });
    });

    // Delete entry
    html.find(".delete-entry-btn").on("click", async (event) => {
      const entry = $(event.currentTarget).closest(".reagent-table-entry");
      const id = entry.data("id");
      const table = game.tables.get(this.selectedTableId);
      if (table && id) {
        await table.deleteEmbeddedDocuments("TableResult", [id]);
        this.render(true);
        ui.notifications.info("Entry deleted.");
      }
    });

    // Open item sheet (only on name or icon)
    html.find(".item-name, .item-icon").on("click", async (event) => {
      event.stopPropagation();
      const entry = $(event.currentTarget).closest(".reagent-table-entry");
      const uuid = entry.data("itemUuid");
      if (uuid) {
        const item = await fromUuid(uuid);
        if (item) item.sheet.render(true);
      }
    });

    // Test roll
    html.find(".test-roll-btn").on("click", async () => {
      const table = game.tables.get(this.selectedTableId);
      if (!table) return;
      const result = await table.roll();
      const items = result.results.map(r => r.text).join(", ");
      ui.notifications.info(`Test roll result: ${items}`);
    });
  }

  async _onDrop(event) {
    if (!this.editMode || !game.user.isGM) return;
    const data = TextEditor.getDragEventData(event);
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
    this.render(true);
    ui.notifications.info(`Added ${item.name} to ${table.name}.`);
  }
}

export function openTableDialog() {
  new ReagentTableDialog().render(true);
}