const {test, expect} = require('@playwright/test');

// The public About page is embedded in the guest app. No production services
// are called by this test and YouTube playback itself is not asserted.
test.beforeEach(async ({page}) => {
  await page.route('**/*', route => new URL(route.request().url()).hostname === '127.0.0.1'
    ? route.continue() : route.abort());
});

test('About presents the existing club video instead of all interior photos', async ({page}) => {
  await page.goto('/about.html?embed=1');
  await expect(page.getByRole('heading', {name: 'Видео о клубе'})).toBeVisible();
  await expect(page.locator('#videoBox')).toBeVisible();
  await expect(page.locator('#playVideo')).toBeVisible();

  await expect(page.getByText('Интерьер BALI')).toHaveCount(0);
  await expect(page.locator('#photoTrack, #galleryPrev, #galleryNext, #viewer')).toHaveCount(0);
  await expect(page.locator('img[src*="/about/photos/"]')).toHaveCount(0);

  await expect(page.getByRole('heading', {name:'Контакты'})).toBeVisible();
  await expect(page.getByRole('link', {name: /ОБСУДИТЬ МЕРОПРИЯТИЕ/}))
    .toHaveAttribute('href', 'tel:+375296700300');
});

test('video start, original link and pause behavior remain available', async ({page}) => {
  await page.goto('/about.html?embed=1');
  await page.locator('#playVideo').click();
  const player=page.locator('#videoBox iframe');
  await expect(player).toHaveCount(1);
  await expect(player).toHaveAttribute('src', /youtube\.com\/embed\/8dwJTWfvsVY/);
  await expect(page.locator('a[href="https://youtu.be/8dwJTWfvsVY"]')).toHaveCount(1);

  await page.evaluate(() => window.postMessage({type:'bali:about:pause'},location.origin));
  await expect(page.locator('#videoBox iframe')).toHaveCount(0);
  await expect(page.locator('#playVideo')).toBeVisible();
});
