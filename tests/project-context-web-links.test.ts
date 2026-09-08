import { expect, it } from "vitest";
import { projectWebUrl } from "../app/electron/project-web-links";

it("opens normal host/IP web URLs without granting file or custom-protocol authority", () => {
  for (const url of ["http://framework0:5173/", "http://192.168.1.158:3000/", "http://localhost:1234/", "https://goalsapp.org/"]) expect(projectWebUrl(url)).toBe(url);
  for (const url of ["file:///etc/passwd", "javascript:alert(1)", "mailto:hello@example.org", "ssh://host", "http://user:secret@host/", "http://0.0.0.0:5173/", "http://[::]:5173/", "http://host/\nsecret", "", "x".repeat(2049)]) expect(projectWebUrl(url)).toBeNull();
});
