const {test, expect} = require('@playwright/test');

// Safe, network-isolated checks. This never signs in, writes to Firestore or
// attempts a real preorder.
test.beforeEach(async ({page}) => {
  await page.route('**/*', route => new URL(route.request().url()).hostname === '127.0.0.1'
    ? route.continue() : route.abort());
});

test('homepage keeps two distinct guest journeys and a clear mobile hero', async ({page}) => {
  await page.goto('/index.html');
  await expect(page.locator('#homeEventCarousel')).toHaveCount(1);
  await expect(page.locator('#baliHomeIdCard')).toHaveCount(1);
  await expect(page.locator('.bali-pc-about-links [data-bali-nav="about"]')).toHaveCount(1);
  await expect(page.locator('.bali-pc-about-links [data-bali-nav="events"]')).toHaveCount(1);
  await expect(page.locator('#baliMobileAboutBtn')).toHaveText('ПОДРОБНЕЕ О КЛУБЕ');
  await expect(page.locator('html')).toHaveCSS('--bali-x-radius','14px');
});

test('all menu modes explain their purpose without adding purchase controls', async ({page}) => {
  await page.goto('/index.html#menu');
  await expect(page.locator('#baliMenuPurpose')).toContainText('предзаказ');
  await page.evaluate(() => window.dispatchEvent(new CustomEvent(
    'bali:menu-mode-changed',{detail:{mode:'bar'}})));
  await expect(page.locator('#baliMenuPurpose')).toContainText('18+');
  await expect(page.locator('#baliMenuPurpose')).toContainText('Заказ — в клубе');
  await page.evaluate(() => window.dispatchEvent(new CustomEvent(
    'bali:menu-mode-changed',{detail:{mode:'hookah'}})));
  await expect(page.locator('#baliMenuPurpose')).toContainText('Кальянная карта');
  await page.evaluate(() => window.dispatchEvent(new CustomEvent(
    'bali:menu-mode-changed',{detail:{mode:'tea'}})));
  await expect(page.locator('#baliMenuPurpose')).toContainText('Чайная карта');
  await expect(page.locator('#baliMenuPurpose')).not.toContainText('18+');
  await expect(page.locator('#baliMenuModeSwitch button')).toHaveCount(4);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
});

test('calendar and staff design guidance are present', async ({page}) => {
  await page.goto('/index.html#events');
  await expect(page.locator('#baliCalendarPurpose')).toContainText('Выберите дату');
  await expect(page.locator('#baliCalendarPanel')).toHaveCount(1);
  await page.goto('/admin.html');
  await expect(page.locator('#adminDesignPanel .bali-experience-admin-guide')).toHaveCount(1);
  await expect(page.locator('.bali-experience-admin-guide summary'))
    .toContainText('Правила публикации');
});

test('About features the club video instead of an interior photo gallery', async ({page}) => {
  await page.goto('/about.html?embed=1');
  await expect(page.getByRole('heading',{name:'Видео о клубе'})).toBeVisible();
  await expect(page.locator('#videoBox #playVideo')).toBeVisible();
  await expect(page.locator('#photoTrack, #galleryPrev, #galleryNext, #viewer')).toHaveCount(0);
  await expect(page.locator('img[src*="assets/about/photos/"]')).toHaveCount(0);
  await page.locator('#playVideo').click();
  await expect(page.locator('#videoBox iframe')).toHaveAttribute('src',/youtube\.com\/embed\/8dwJTWfvsVY/);
  await page.evaluate(() => window.postMessage({type:'bali:about:pause'},location.origin));
  await expect(page.locator('#videoBox #playVideo')).toBeVisible();
});
