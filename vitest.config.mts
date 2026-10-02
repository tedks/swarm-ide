import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    // tools/cli, tools/container and tools/supervisor use node:test via Bazel.
    include: ["tests/**/*.test.{ts,tsx,mjs}",
      "tools/session-registration/registration.test.ts", "tools/conversation-cockpit/response.test.mjs"],
    exclude: ["**/node_modules/**", "**/.git/**", "**/bazel-*/**"],
  },
});
