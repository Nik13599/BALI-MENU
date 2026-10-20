const {test, expect} = require('@playwright/test');

// Run entirely against the static app; do not authenticate or call production Firebase.
test.beforeEach(async ({page}) => {
  await page.route('**/*', route => new URL(route.request().url()).hostname === '127.0.0.1'
    ? route.continue() : route.abort());
});

test('venue inquiry and About journeys stay distinct across viewports', async ({page}) => {
  await page.goto('/index.html');
  if (page.viewportSize().width >= 1180) {
    const preview = page.locator('#baliPcAboutPreview');
    await expect(preview).toBeVisible();
    await expect(preview.locator('.bali-pc-about-hook')).toHaveText('Ваша идея. Наша сцена.');
    await expect(preview.locator('.bali-pc-about-booking-link'))
      .toHaveAttribute('href', 'tel:+375296700300');
    await expect(preview.locator('.bali-pc-about-events-link')).toHaveAttribute('href', '#events');
    await preview.locator('.bali-pc-about-action').click();
    await expect(page).toHaveURL(/#about$/);
  } else {
    const mobileAbout = page.locator('#baliMobileAboutBtn');
    await expect(mobileAbout).toHaveText('ПОДРОБНЕЕ О КЛУБЕ');
    await expect(mobileAbout).toBeVisible();
  }
});

test('editorial stylesheet loads without replacing existing guest interactions', async ({page}) => {
  await page.goto('/index.html');
  await expect(page.locator('link[href^="bali-editorial-conversion.css"]')).toHaveCount(1);
  await expect(page.locator('#menuNavBtn')).toHaveCount(1);
  await expect(page.locator('#homeEventCarousel')).toHaveCount(1);
});
