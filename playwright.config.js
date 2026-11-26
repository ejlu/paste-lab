import { defineConfig } from "@playwright/test";

export default defineConfig({
  testDir: "./test/browser",
  use: { baseURL: "http://127.0.0.1:4198" },
  webServer: {
    command: "npm run dev -- --port 4198 --strictPort",
    url: "http://127.0.0.1:4198",
    reuseExistingServer: false,
  },
});
