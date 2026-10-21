const {test,expect}=require('@playwright/test');
test.beforeEach(async({page})=>{
 await page.route('**/*',r=>new URL(r.request().url()).hostname==='127.0.0.1'?r.continue():r.abort());
 await page.clock.setFixedTime(new Date('2026-10-21T12:00:00+03:00'));
 await page.addInitScript(()=>{window.BaliIdOnboarding={isAccepted:()=>true,open:async()=>true}});
});
async function calendar(page){
 await page.goto('/index.html#events');
 await page.evaluate(()=>window.dispatchEvent(new CustomEvent('bali:events',{detail:{events:[
  {id:'2026-10-20',date:'2026-10-20'},
  {id:'2026-10-21',date:'2026-10-21'},
  {id:'2026-10-22',date:'2026-10-22'},
  {id:'2026-10-22__2',date:'2026-10-22'},
  {id:'2026-10-23',date:'2026-10-23'}
 ].map(e=>({...e,title:'BALI PARTY',startTime:'23:00',endTime:'06:00',poster_url:'assets/bali-id-card-readable.svg'}))}})));
 await expect(page.locator('#eventsGrid .event-card')).toHaveCount(5);
}
const day=(page,date)=>page.locator('#baliCalendarDays [data-date="'+date+'"]');
test('all calendar states use contours, bold dots and only the active future date fills',async({page})=>{
 await calendar(page);
 await page.evaluate(()=>window.BaliCalendarShowcase.focusIndex(1,false));
 for(const today of await page.locator('.bali-calendar-day[data-date="2026-10-21"]').all()){
  await expect(today).toHaveCSS('outline-color','rgb(255, 255, 255)');
  await expect(today).toHaveCSS('outline-style','solid');
  await expect(today).toHaveCSS('background-color','rgb(185, 255, 81)');
 }
 const future=day(page,'2026-10-22'),past=day(page,'2026-10-20');
 await expect(future).toHaveCSS('background-color','rgba(0, 0, 0, 0)');
 await expect(future).toHaveCSS('border-color','rgb(185, 255, 81)');
 await expect(future.locator('.bali-calendar-event-dot')).toHaveCount(2);
 for(const dot of await future.locator('.bali-calendar-event-dot').all()){
  await expect(dot).toHaveCSS('width','5px');
  await expect(dot).toHaveCSS('background-color','rgb(185, 255, 81)');
  await expect(dot).toHaveCSS('outline-style','none');
  await expect(dot).toHaveCSS('box-shadow','none');
 }
 await page.evaluate(()=>window.BaliCalendarShowcase.focusIndex(0,false));
 await expect(past).toHaveAttribute('data-selected','true');
 await expect(past).toHaveCSS('background-color','rgba(0, 0, 0, 0)');
 await expect(past).toHaveCSS('border-color','rgb(250, 96, 112)');
 await day(page,'2026-10-24').click();
 await expect(day(page,'2026-10-24')).toHaveAttribute('data-selected','true');
 await expect(day(page,'2026-10-24')).toHaveCSS('background-color','rgba(0, 0, 0, 0)');
 // There must be no old 900/1100ms lock after opening or selecting a day.
 const instant=await page.evaluate(()=>{
  window.BaliCalendarShowcase.focusIndex(2,true);
  return {animating:window.BaliCalendarShowcase.getState().animating,
   date:document.querySelector('#baliCalendarDays [data-selected="true"]').dataset.date};
 });
 expect(instant).toEqual({animating:true,date:'2026-10-22'});
 await expect(future).toHaveCSS('background-color','rgb(185, 255, 81)');
});
test('custom event dot colours and saved plans survive calendar navigation',async({page})=>{
 await calendar(page);
 await page.evaluate(()=>window.dispatchEvent(new CustomEvent('bali:events',{detail:{events:[
  {id:'2026-10-22',date:'2026-10-22',title:'BALI PARTY',startTime:'23:00',endTime:'06:00',dotColor:'#ff00aa'}
 ]}})));
 await day(page,'2026-10-24').click(); // Select a different day to inspect the custom inactive dot.
 const future=day(page,'2026-10-22');
 // Move the selected day away: active dates intentionally use dark dots.
 await page.evaluate(()=>document.querySelector('#baliCalendarDays [data-date="2026-10-24"]').click());
 await expect(future).toHaveAttribute('data-selected','false');
 await expect(future.locator('.bali-calendar-event-dot').first()).toHaveCSS('background-color','rgb(255, 0, 170)');
 await page.evaluate(()=>window.dispatchEvent(new CustomEvent('bali:calendar:plans-changed',{detail:{dates:['2026-10-22']}})));
 await expect(future).toHaveCSS('background-color','rgb(185, 255, 81)');
 await expect(future.locator('.bali-calendar-event-dot').first()).toHaveCSS('background-color','rgb(21, 25, 16)');
 await page.evaluate(()=>window.dispatchEvent(new CustomEvent('bali:calendar:plans-changed',{detail:{dates:[]}})));
 await expect(future).toHaveCSS('background-color','rgba(0, 0, 0, 0)');
 await expect(future.locator('.bali-calendar-event-dot').first()).toHaveCSS('background-color','rgb(255, 0, 170)');
});
test('dragging updates the calendar before finger release and neighbours sit close behind the centre',async({page})=>{
 await calendar(page);
 await page.evaluate(()=>window.BaliCalendarShowcase.focusIndex(1,false));
 const result=await page.locator('#eventsGrid').evaluate(grid=>{
  const rect=grid.getBoundingClientRect(),card=grid.querySelector('.event-card.is-active');
  const width=card.getBoundingClientRect().width;
  const pointer=(type,dx)=>grid.dispatchEvent(new PointerEvent(type,{bubbles:true,isPrimary:true,button:0,pointerType:'touch',pointerId:801,clientX:rect.left+rect.width/2+dx,clientY:rect.top+40}));
  pointer('pointerdown',0);pointer('pointermove',-width*.6);
  const date=document.querySelector('#baliCalendarDays [data-selected="true"]').dataset.date;
  pointer('pointerup',-width*.6);
  return date;
 });
 expect(result).toBe('2026-10-22');
 await page.evaluate(()=>window.BaliCalendarShowcase.focusIndex(2,false));
 const readLayout=()=>page.locator('#eventsGrid').evaluate(grid=>{
  const box=selector=>grid.querySelector(selector).querySelector('.bali-event-poster-wrap').getBoundingClientRect();
  const left=box('[data-stage-side="left"]'),center=box('.is-active'),right=box('[data-stage-side="right"]');
  return {leftGap:center.left-left.right,rightGap:right.left-center.right,width:center.width,
   centerZ:+getComputedStyle(grid.querySelector('.is-active')).zIndex,sideZ:+getComputedStyle(grid.querySelector('.is-neighbor')).zIndex};
 });
 // Gesture release can schedule a final responsive stage measurement.
 // The date assertion above is immediate; final artwork geometry is polled.
 await expect.poll(async()=>{const value=await readLayout();return Math.max(value.leftGap,value.rightGap)}).toBeLessThanOrEqual(8);
 const layout=await readLayout();
 expect(layout.leftGap).toBeLessThanOrEqual(8);
 expect(layout.rightGap).toBeLessThanOrEqual(8);
 expect(layout.leftGap).toBeGreaterThan(-layout.width*.25);
 expect(layout.rightGap).toBeGreaterThan(-layout.width*.25);
 expect(layout.centerZ).toBeGreaterThan(layout.sideZ);
});
test('ID opens as a separate route, closes previous windows and uses a single identity type scale',async({page})=>{
 await page.goto('/index.html#contacts');
 await page.locator('#contactsSection [data-bali-nav="id"]').click();
 await expect(page).toHaveURL(/#id$/);
 await expect(page.locator('#baliIdSection')).toBeVisible();
 for(const id of ['homeSection','menuPage','eventsSection','profileSection','contactsSection','baliAboutSection']){
  await expect(page.locator('#'+id)).toBeHidden();
  await expect(page.locator('#'+id)).toHaveAttribute('inert','');
 }
 await page.evaluate(()=>{
  document.getElementById('baliIdFlipScene').dataset.baliLoading='false';
  document.getElementById('baliCardName').textContent='Александра Константинопольская';
  document.getElementById('baliCardNumber').textContent='123456';
  document.getElementById('baliCardTier').textContent='PRIVATE';
 });
 const fonts=await page.locator('#baliIdFlipScene').evaluate(scene=>['.bali-id-brand-label','#baliCardTier','#baliCardHeaderTier','#baliCardName','#baliCardNumber'].map(selector=>{
  const el=scene.querySelector(selector),s=getComputedStyle(el);
  return {size:s.fontSize,family:s.fontFamily,weight:s.fontWeight};
 }));
 for(const font of fonts)expect(font).toEqual(fonts[4]);
 const fit=await page.locator('#baliCardName').evaluate(el=>el.scrollWidth<=el.clientWidth+1);
 expect(fit).toBe(true);
 await expect(page.locator('#baliIdBonusStrip .bali-id-bonus svg')).toHaveCount(4);
 for(const icon of await page.locator('#baliIdBonusStrip .bali-id-bonus svg').all()){
  await expect(icon).toHaveAttribute('stroke-linecap','round');
  expect(await icon.evaluate(el=>parseFloat(getComputedStyle(el).width))).toBeGreaterThanOrEqual(22);
 }
 // History/back navigation restores the originating page without retaining ID.
 await page.goBack();
 await expect(page.locator('#contactsSection')).toBeVisible();
 await expect(page.locator('#baliIdSection')).toBeHidden();
});
test('About and Information fit each viewport and share Home button sizes without developer copy',async({page})=>{
 await page.goto('/index.html');
 const selector=page.viewportSize().width<768?'#baliMobileAboutBtn':'.bali-pc-about-links>button';
 const home=await page.locator(selector).first().evaluate(el=>({font:getComputedStyle(el).fontSize,min:getComputedStyle(el).minHeight}));
 await page.goto('/index.html#about');
 const about=page.frameLocator('#baliAboutFrame');
 await expect(about.locator('.hero h1')).toBeVisible();
 for(const button of await about.locator('.event-cta,.vaction').all()){
  expect(await button.evaluate(el=>({font:getComputedStyle(el).fontSize,min:getComputedStyle(el).minHeight}))).toEqual(home);
 }
 expect(await about.locator('html').evaluate(el=>el.scrollWidth<=el.clientWidth+1)).toBe(true);
 await page.goto('/index.html#contacts');
 const heading=await page.locator('#contactsHeading').boundingBox();
 const header=await page.locator('.header').boundingBox();
 if(page.viewportSize().width<1180)expect(heading.y).toBeGreaterThan(header.y+header.height);
 for(const button of await page.locator('#contactsSection .bali-info-inline-nav').all()){
  expect(await button.evaluate(el=>({font:getComputedStyle(el).fontSize,min:getComputedStyle(el).minHeight}))).toEqual(home);
 }
 expect(await page.locator('#contactsSection').evaluate(el=>el.scrollWidth<=el.clientWidth+1)).toBe(true);
 await expect(page.locator('#contactsSection')).not.toContainText(/не заменяет утверждённую|подготовлена и опубликована отдельно|не реализовано|в админке/);
 await page.locator('#contactsSection summary').filter({hasText:'Персональные данные'}).click();
 await expect(page.locator('#contactsSection a[href="privacy.html"]')).toBeVisible();
});
