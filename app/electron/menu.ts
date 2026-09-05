import type { MenuItemConstructorOptions } from "electron";

// Retain conventional editing, reload, and developer accelerators while
// deliberately omitting Electron's unbounded zoom roles. Interface zoom has a
// single owner through the validated view-shell channel.
export const applicationMenuTemplate: MenuItemConstructorOptions[] = [
  {
    label: "Edit",
    submenu: [
      { role: "undo" },
      { role: "redo" },
      { type: "separator" },
      { role: "cut" },
      { role: "copy" },
      { role: "paste" },
      { role: "selectAll" },
    ],
  },
  {
    label: "View",
    submenu: [
      { role: "reload" },
      { role: "forceReload" },
      { type: "separator" },
      { role: "toggleDevTools" },
      { type: "separator" },
      { role: "togglefullscreen" },
    ],
  },
];
