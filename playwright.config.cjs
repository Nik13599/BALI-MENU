const {defineConfig} = require('@playwright/test');
module.exports = defineConfig({
  testDir: './tests',
  timeout: 25000,
  fullyParallel: true,
  workers: 3,
  reporter: 'list',
  use: {
    baseURL: 'http://127.0.0.1:4173',
    launchOptions: process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH
      ? {executablePath: process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH} : {},
    trace: 'retain-on-failure'
  },
  projects: [
    {name: 'phone', use: {viewport: {width: 390, height: 844}}},
    {name: 'small-phone', use: {viewport: {width: 320, height: 640}}},
    {name: 'desktop', use: {viewport: {width: 1440, height: 900}}}
  ],
  webServer: {
    command: 'python3 -m http.server 4173 --bind 127.0.0.1',
    url: 'http://127.0.0.1:4173',
    reuseExistingServer: !process.env.CI,
    stdout: 'ignore', stderr: 'ignore'
  }
});
