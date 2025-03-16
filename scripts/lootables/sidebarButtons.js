console.log("Vikarov’s Guide to Procurement: sidebarButtons.js loaded");

import { openConversionDialog } from "./conversion.js";
import { openTableDialog } from "../tables/tableUi.js";

Hooks.on("getSceneControlButtons", (controls) => {
  const tokenControls = controls.find((c) => c.name === "token");
  if (!tokenControls) return;

  tokenControls.tools.push({
    name: "convertTokens",
    title: "Convert Tokens",
    icon: "fas fa-exchange-alt",
    visible: game.user.isGM,
    onClick: () => {
      openConversionDialog();
    },
    button: true
  });

  tokenControls.tools.push({
    name: "reagentTables",
    title: "Reagent Tables",
    icon: "fas fa-table",
    visible: game.user.isGM,
    onClick: () => {
      openTableDialog();
    },
    button: true
  });
});