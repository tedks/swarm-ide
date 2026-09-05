import type { MenuItemConstructorOptions } from "electron";

// Retain conventional editing, reload, and developer accelerators while
// deliberately omitting Electron's unbounded zoom roles. Interface zoom has a
// single owner through the validated view-shell channel.
export function applicationMenuTemplate(platform: NodeJS.Platform = process.platform): MenuItemConstructorOptions[] {
  return [
    ...(platform === "darwin" ? [{ role: "appMenu" as const }] : []),
    { role: "fileMenu" as const },
    { role: "editMenu" as const },
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
    { role: "windowMenu" as const },
  ];
}
