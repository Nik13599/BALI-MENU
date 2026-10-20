const {test, expect} = require('@playwright/test');
const AxeBuilder = require('@axe-core/playwright').default;

// Isolated browser fixtures: never authenticate, read or write the live Firebase DB.
test.beforeEach(async ({page}) => {
  await page.route('**/*', route => new URL(route.request().url()).hostname === '127.0.0.1'
    ? route.continue() : route.abort());
});
function cartTrigger(page) { return page.locator(page.viewportSize().width >= 1180 ? '#baliPcCartBtn' : '#baliCartDock'); }
async function menu(page) {
  await page.goto('/index.html#menu');
  await page.evaluate(() => {
    window.BaliAuth = {requireProfile: async () => true, isRegistered: () => true,
      getProfile: () => ({uid: 'test-only', name: 'Тестовый гость', phone: '+375291234567', email: 'test@example.com'})};
    window.BaliOrders = {maxItems: 12, errorText: e => e.message};
    window.dispatchEvent(new CustomEvent('bali:menu', {detail: {items: Array.from({length: 14}, (_, i) => ({
      id: i + 1, name: i === 0 ? 'Сырное ассорти' : 'Блюдо ' + (i + 1),
      category: i < 7 ? 'Закуски' : 'Горячее', price: i + 10, available: true,
      description: 'Состав блюда: сыр, орехи и виноград', weight: '200 г'
    }))}}));
    window.dispatchEvent(new CustomEvent('bali:events', {detail: {events: [{date: '2099-10-24',
      title: 'Тестовая вечеринка', preorderEnabled: true, closesAt: {toDate: () => new Date('2099-10-24T18:00:00Z')}}]}}));
  });
}

test('approved hidden search, category filtering and safe rendering', async ({page}) => {
  await menu(page);
  await expect(page.locator('#baliMenuSearch')).toBeHidden();
  const tab = page.locator('[data-bali-menu-mode="kitchen"]');
  if (page.viewportSize().width < 768) {
    await expect(tab.locator('.bali-menu-mode-label')).toBeHidden();
    const box = await tab.boundingBox();
    expect(box.width).toBe(46);
    expect(box.height).toBe(46);
  } else {
    expect(await page.locator('#menuGrid .menu-category-products').first().evaluate(
      node => getComputedStyle(node).gridTemplateColumns.split(' ').length))
      .toBe(page.viewportSize().width >= 1180 ? 3 : 2);
  }
  await page.locator('#categoryFilter button').filter({hasText: /^Горячее$/}).click();
  await expect(page.locator('#menuGrid .menu-item')).toHaveCount(7);
  await page.evaluate(() => {
    window.dispatchEvent(new CustomEvent('bali:menu', {detail: {items: [{id: 1,
      name: '<img src=x onerror=alert(1)>', category: 'Тест', price: 10, available: true}]}}));
  });
  await expect(page.locator('#menuGrid .menu-item-name')).toHaveText('<img src=x onerror=alert(1)>');
  await expect(page.locator('#menuGrid img')).toHaveCount(0);
});

test('cart quantities, keyboard focus and dismissal', async ({page}) => {
  await menu(page);
  const card = page.locator('#menuGrid .menu-item').first();
  await card.locator('[data-menu-action="plus"]').click();
  await card.locator('[data-menu-action="add"]').click();
  await expect(page.locator('#baliDockCount')).toHaveText('2');
  await expect(page.locator('#baliDockTotal')).toHaveText('20.00 BYN');
  await cartTrigger(page).click();
  await expect(page.locator('#cartSidebar')).toHaveAttribute('aria-hidden', 'false');
  await expect(page.locator('#closeCart')).toBeFocused();
  await page.keyboard.press('Shift+Tab');
  await expect(page.locator('#checkoutBtn')).toBeFocused();
  await page.keyboard.press('Escape');
  await expect(page.locator('#cartSidebar')).toHaveAttribute('aria-hidden', 'true');
  await expect(cartTrigger(page)).toBeFocused();
  await expect(page.locator('#cartSidebar')).toBeHidden();
});

test('storage failure does not break the cart or a successful checkout', async ({page}) => {
  await page.addInitScript(() => {Storage.prototype.setItem = () => {throw new DOMException('Storage unavailable', 'QuotaExceededError')};});
  const errors = [];
  page.on('pageerror', e => errors.push(e.message));
  await menu(page);
  await page.evaluate(() => {
    addToCart(1);
    window.BaliOrders.save = async () => ({success: true, order_id: 'test-order', order_number: 1});
  });
  await cartTrigger(page).click();
  await page.locator('#checkoutBtn').click();
  await page.locator('#eventSelect').selectOption('2099-10-24');
  await page.locator('#tableNumber').fill('12');
  await page.locator('.submit-order-btn').click();
  await expect(page.locator('#successModal')).toHaveClass(/active/);
  await page.locator('#closeSuccess').click();
  await expect(page.locator('#baliDockCount')).toHaveText('0');
  expect(errors).toEqual([]);
});

test('cancelled editing creates a new order and failed submit stays usable', async ({page}) => {
  await menu(page);
  await page.evaluate(async () => {
    window.BaliOrders.getOrderWithItems = async () => ({status: 'pending', eventDate: '2099-10-24',
      tableNumber: '5', bookingId: '', items: [{id: 1, quantity: 2}]});
    window.savedEditIds = [];
    window.BaliOrders.save = async (_, editId) => {
      window.savedEditIds.push(editId);
      throw new Error('Тестовый отказ сервера');
    };
    await editMyOrder('old-order');
    closeCheckout();
    await openCheckout();
  });
  page.on('dialog', d => d.accept());
  await page.locator('.submit-order-btn').click();
  await expect(page.locator('.submit-order-btn')).toBeEnabled();
  await expect(page.locator('.submit-order-btn')).toHaveText('Отправить предзаказ');
  expect(await page.evaluate(() => window.savedEditIds)).toEqual([null]);
});

test('limits match order service and hidden kitchen cannot bypass age consent', async ({page}) => {
  await menu(page);
  page.on('dialog', d => d.accept());
  expect(await page.evaluate(() => {
    for (let id = 1; id <= 13; id++) addToCart(id);
    const result = [cart.length, addToCart(1, 50)];
    window.dispatchEvent(new CustomEvent('bali:menu-visibility', {detail: {kitchen: false, tea: false, bar: true, hookah: false}}));
    return [...result, window.BaliActiveMenuMode];
  })).toEqual([12, false, null]);
  await expect(page.locator('#baliBarContent')).toBeHidden();
  await page.evaluate(() => {window.BaliAgeGate = {confirm: async () => false};});
  await page.locator('[data-bali-menu-mode="bar"]').click();
  await expect(page.locator('#baliBarContent')).toBeHidden();
});

test('layouts fit the viewport and preserve menu navigation', async ({page}) => {
  const errors = [];
  page.on('pageerror', e => errors.push(e.message));
  await menu(page);
  for (const route of ['home', 'events', 'menu', 'profile', 'contacts', 'about']) {
    await page.evaluate(route => navigateGuestPage(route), route);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    await expect(page.locator('body')).toHaveAttribute('data-bali-page', route);
  }
  expect(errors).toEqual([]);
});

test('guest menu and cart meet key accessibility rules', async ({page}) => {
  await menu(page);
  let results = await new AxeBuilder({page}).withTags(['wcag2a', 'wcag2aa', 'wcag21aa']).analyze();
  expect(results.violations).toEqual([]);
  await page.locator('#menuGrid [data-menu-action="add"]').first().click();
  await cartTrigger(page).click();
  results = await new AxeBuilder({page}).withTags(['wcag2a', 'wcag2aa', 'wcag21aa']).analyze();
  expect(results.violations).toEqual([]);
});

test('legacy entry points lead to the supported authenticated apps', async ({page}) => {
  await page.goto('/track.html?id=old-order');
  await expect(page).toHaveURL(/index\.html\?view=orders#profile/);
  await page.goto('/delivery.html');
  await expect(page).toHaveURL(/admin\.html$/);
});
