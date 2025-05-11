console.log("Vikarov’s Guide to Procurement: sidebarButtons.js loaded");

import { openConversionDialog } from "./conversion.js";
import { openTableDialog } from "../tables/tableUi.js";

Hooks.on('getSceneControlButtons', (controls) => {
  const tokenControls = controls.tokens;
  if (!tokenControls || !tokenControls.tools) {
    console.warn("Token controls or tools not found");
    return;
  }

  const procurementButtons = {
    convertTokens: {
      name: "convertTokens",
      title: "Convert Tokens",
      icon: "fas fa-exchange-alt",
      visible: game.user.isGM,
      onChange: async () => {
        await openConversionDialog();
      },
      button: true
    },

    reagentTables: {
      name: "reagentTables",
      title: "Reagent Tables",
      icon: "fas fa-table",
      visible: game.user.isGM,
      onChange: async () => {
        await openTableDialog();
      },
      button: true
    },

    harvestToken: {
      name: "harvestToken",
      title: "Harvest Token",
      icon: "fas fa-leaf",
      visible: game.user.isGM,
      onChange: async () => {
        const targets = Array.from(game.user.targets);
        if (targets.length !== 1) {
          ui.notifications.warn("Please target exactly one token to harvest.");
          return;
        }
        openHarvestDialog(targets[0]);      },
      button: true
    }
  };

  for (const [key, button] of Object.entries(procurementButtons)) {
    if (button.visible) {
      tokenControls.tools[key] = button;
    }
  }
});