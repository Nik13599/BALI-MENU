const {test,expect}=require('@playwright/test');
test.beforeEach(async({page})=>{
 await page.route('**/*',route=>new URL(route.request().url()).hostname==='127.0.0.1'?route.continue():route.abort());
});
test('guest status notices are deduplicated and cleared on logout',async({page})=>{
 await page.goto('/index.html#profile');
 await page.evaluate(()=>{
  const send=status=>window.dispatchEvent(new CustomEvent('bali:orders',{detail:{ownerUid:'guest-a',orders:[{id:'order-one',orderNumber:1,status}]}}));
  send('pending');send('confirmed');send('confirmed');
 });
 await page.locator('#baliOrderNoticeLive').click();
 await expect(page.locator('#baliOrderNoticeList button')).toHaveCount(1);
 await expect(page.locator('#baliOrderNoticeList')).toContainText('подтверждён');
 await page.evaluate(()=>window.dispatchEvent(new CustomEvent('bali:auth-state',{detail:{signedIn:false}})));
 await expect(page.locator('#baliOrderNoticeList button')).toHaveCount(0);
});
test('empty initial admin queue still notifies about the first incoming order',async({page})=>{
 await page.goto('/admin.html');
 await page.evaluate(()=>{
  const send=orders=>window.dispatchEvent(new CustomEvent('bali:admin:orders',{detail:{ownerUid:'staff',orders}}));
  send([]);send([{id:'order-one',status:'pending',orderNumber:1}]);send([{id:'order-one',status:'pending',orderNumber:1}]);
 });
 expect(await page.locator('#baliOrderNoticeList button').count()).toBe(1);
 await expect(page.locator('#baliOrderNoticeList')).toContainText('Новый предзаказ');
});
test('diagnostics discard messages and content checks do not invent facts',async({page})=>{
 await page.goto('/admin.html');
 expect(await page.evaluate(()=>{
  window.BaliMonitor.report('catalog',{code:'permission-denied',message:'secret@example.com token=private'});
  return JSON.stringify(window.BaliMonitor.history()).includes('secret@example.com');
 })).toBe(false);
 expect(await page.evaluate(()=>window.BaliContentAudit.inspect([{id:1,name:'Блюдо',description:''}],[{date:'2099-01-01',title:'Вечеринка'}]).length)).toBe(2);
 await page.evaluate(()=>{document.getElementById('adminView').hidden=false;document.getElementById('eventEndTime').value='01:00';});
 await page.locator('[data-bali-time-preset="19:00,22:30"]').dispatchEvent('click');
 await expect(page.locator('#eventStartTime')).toHaveValue('19:00');
 await expect(page.locator('#eventEndTime')).toHaveValue('22:30');
});
test('About video replaces the old photo gallery and retains fullscreen controls',async({page})=>{
 await page.goto('/about.html?embed=1');
 await expect(page.locator('#photoTrack, .shot, #viewer')).toHaveCount(0);
 await expect(page.locator('#videoBox #playVideo')).toBeVisible();
 await expect(page.locator('#expandVideo')).toBeVisible();
 await expect(page.locator('#restartVideo')).toBeVisible();
 await page.locator('#playVideo').click();
 await expect(page.locator('#videoBox iframe')).toHaveAttribute('src',/youtube\\.com\\/embed\\/8dwJTWfvsVY/);
 await page.evaluate(()=>window.postMessage({type:'bali:about:pause'},location.origin));
 await expect(page.locator('#videoBox #playVideo')).toBeVisible();
});
test('tea typography is readable without changing names, prices or approved grid',async({page})=>{
 // Run the real tea renderer against its retained local seed, with Firebase transport stubbed.
 await page.route('https://www.gstatic.com/firebasejs/10.14.1/firebase-app.js',r=>r.fulfill({contentType:'text/javascript',body:'export const getApps=()=>[];export const getApp=()=>({});export const initializeApp=()=>({});'}));
 await page.route('https://www.gstatic.com/firebasejs/10.14.1/firebase-firestore.js',r=>r.fulfill({contentType:'text/javascript',body:'export const getFirestore=()=>({});export const collection=()=>({});export const onSnapshot=(q,cb)=>{cb({docs:[]});return ()=>{};};'}));
 await page.goto('/index.html#menu');
 await page.locator('[data-bali-menu-mode="tea"]').click();
 const cards=page.locator('#baliTeaList .bali-tea-item');
 await expect(cards).toHaveCount(32);
 await expect(page.locator('#baliTeaList .menu-details-btn')).toHaveCount(0);
 await expect(cards.nth(1).locator('button')).toHaveCount(0);
 await expect(cards.first().locator('.menu-item-name')).toHaveText('Лун Цзин');
 await expect(cards.first().locator('.bali-tea-amount')).toHaveText('18');
 await expect(cards.first().locator('.bali-tea-currency')).toHaveText('BYN');
 await expect(page.locator('#baliTeaList .menu-category-title').first()).toHaveText('Зелёные чаи');
 if(page.viewportSize().width>=1180)expect(await page.locator('#baliTeaList .menu-category-products').first().evaluate(n=>getComputedStyle(n).gridTemplateColumns.split(' ').length)).toBe(6);
 const long=cards.filter({hasText:'Жасминовая Жемчужина Дракона'}).locator('.menu-item-name');
 expect(await long.evaluate(n=>n.scrollWidth<=n.clientWidth+1)).toBe(true);
 await cards.first().locator('.bali-tea-readmore').click();
 await expect(page.locator('#baliTeaDetailsDialog')).toBeVisible();
 await expect(page.locator('#baliTeaDetailsDialog')).toContainText('Колодец Дракона');
 await expect(page.locator('#baliTeaDetailsDialog')).not.toContainText(/методичк|страниц|Описание составлено/i);
 await expect(page.locator('#baliTeaDetailsDialog .bali-tea-details-source')).toHaveCount(0);
});
