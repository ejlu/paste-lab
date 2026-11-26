import { defineConfig } from "@playwright/test";

export default defineConfig({
  testDir: "./test/browser",
  use: { baseURL: "http://127.0.0.1:4198/paste-lab/" },
  webServer: {
    command:
      "npm run build && vite preview --host 127.0.0.1 --port 4198 --strictPort --base=/paste-lab/",
    url: "http://127.0.0.1:4198/paste-lab/",
    reuseExistingServer: false,
  },
});
