import { defineConfig, devices } from '@playwright/test';

const API_PORT = 4100;
const WEB_PORT = 5174;

/**
 * Clicks through the real website and API as a guest and the three demo personas.
 * `npm run e2e` starts both servers (an in-memory, freshly seeded database) and stops them after.
 */
export default defineConfig({
  testDir: 'e2e',
  fullyParallel: false,
  workers: 1,
  timeout: 60_000,
  expect: { timeout: 10_000 },
  retries: process.env.CI ? 1 : 0,
  reporter: process.env.CI ? [['list'], ['html', { open: 'never' }]] : 'list',
  use: {
    baseURL: `http://localhost:${WEB_PORT}`,
    trace: 'retain-on-failure',
    ...devices['Desktop Chrome']
  },
  webServer: [
    {
      command: 'npm run e2e:api -w @illi-knows/api',
      url: `http://localhost:${API_PORT}/api/health`,
      timeout: 120_000,
      reuseExistingServer: false,
      env: { E2E_API_PORT: String(API_PORT), E2E_WEB_ORIGIN: `http://localhost:${WEB_PORT}` }
    },
    {
      command: 'npm run dev -w @illi-knows/web',
      url: `http://localhost:${WEB_PORT}`,
      timeout: 120_000,
      reuseExistingServer: false,
      env: {
        WEB_PORT: String(WEB_PORT),
        API_PROXY: `http://localhost:${API_PORT}`,
        // Placeholders so the Firebase SDK starts; the tests sign in through demo personas instead.
        VITE_FIREBASE_API_KEY: 'e2e-placeholder-key',
        VITE_FIREBASE_AUTH_DOMAIN: 'localhost',
        VITE_FIREBASE_PROJECT_ID: 'demo-illi-knows',
        VITE_FIREBASE_APP_ID: '1:000000000000:web:e2e',
        VITE_USE_AUTH_EMULATOR: 'false',
        VITE_API_URL: ''
      }
    }
  ]
});
