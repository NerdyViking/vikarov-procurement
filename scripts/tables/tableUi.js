console.log("Vikarov’s Guide to Procurement: tableUi.js loaded");

export function openTableDialog() {
  new Dialog({
    title: "Reagent Tables",
    content: game.i18n.localize("VIKAROV.TableDialogPlaceholder") || "Table management coming soon!",
    buttons: {
      close: {
        label: "Close",
        callback: () => console.log("Table dialog closed")
      }
    },
    default: "close"
  }).render(true);
}