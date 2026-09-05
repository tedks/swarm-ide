import { describe, expect, it } from "vitest";
import { applicationMenuTemplate } from "../app/electron/menu";

describe("application menu", () => {
  it("retains reload and editing roles without a second zoom authority", () => {
    const menu = applicationMenuTemplate("linux");
    const roles = menu.flatMap((item) => [item.role ?? null,
      ...(Array.isArray(item.submenu)
        ? item.submenu.map((child) => typeof child === "object" && "role" in child ? child.role : null)
        : [])]);

    expect(roles).toContain("reload");
    expect(roles).toContain("fileMenu");
    expect(roles).toContain("editMenu");
    expect(roles).toContain("windowMenu");
    expect(roles).not.toContain("zoomIn");
    expect(roles).not.toContain("zoomOut");
    expect(roles).not.toContain("resetZoom");
    expect(applicationMenuTemplate("darwin").map((item) => item.role)).toContain("appMenu");
  });
});
