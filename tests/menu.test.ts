import { describe, expect, it } from "vitest";
import { applicationMenuTemplate } from "../app/electron/menu";

describe("application menu", () => {
  it("retains reload and editing roles without a second zoom authority", () => {
    const roles = applicationMenuTemplate.flatMap((menu) =>
      Array.isArray(menu.submenu)
        ? menu.submenu.map((item) => typeof item === "object" && "role" in item ? item.role : null)
        : []);

    expect(roles).toContain("reload");
    expect(roles).toContain("copy");
    expect(roles).not.toContain("zoomIn");
    expect(roles).not.toContain("zoomOut");
    expect(roles).not.toContain("resetZoom");
  });
});
