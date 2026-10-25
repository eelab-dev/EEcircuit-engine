import { defineConfig, devices } from '@playwright/test';

export default defineConfig({
    testDir: 'test',
    testMatch: '**/*.spec.{js,ts,mts,cts}',
    testIgnore: '**/local/**',
    projects: [
        {
            name: 'chrome',
            use: { ...devices['Desktop Chrome'] },
        },
    ],
});
