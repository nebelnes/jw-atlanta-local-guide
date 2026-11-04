// Browser smoke tests. Run: npm run test:e2e
// Uses the locally installed Google Chrome (channel "chrome"), which is also
// preinstalled on GitHub's Ubuntu runners, so no browser download is needed.

import { defineConfig } from "playwright/test";

const PORT = 4173;

export default defineConfig({
  testDir: "tests/e2e",
  timeout: 30_000,
  forbidOnly: !!process.env.CI,
  reporter: process.env.CI ? "github" : "list",
  use: {
    baseURL: `http://127.0.0.1:${PORT}`,
    channel: "chrome",
    reducedMotion: "reduce",
  },
  projects: [
    { name: "phone", use: { viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true } },
    { name: "desktop", use: { viewport: { width: 1280, height: 800 } } },
  ],
  webServer: {
    command: `node scripts/serve.mjs`,
    env: { PORT: String(PORT) },
    url: `http://127.0.0.1:${PORT}/index.html`,
    reuseExistingServer: !process.env.CI,
  },
});
