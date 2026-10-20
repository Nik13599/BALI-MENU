const {test,expect}=require('@playwright/test');
test.beforeEach(async({page})=>{
  await page.route('**/*',route=>new URL(route.request().url()).hostname==='127.0.0.1'
    ?route.continue():route.abort());
});
async function openCalendar(page){
  await page.goto('/index.html#events');
  await page.evaluate(()=>{
    document.getElementById('eventsSection').hidden=false;
    document.body.dataset.baliPage='events';
  });
  await expect(page.locator('#baliCalendarPanel')).toBeVisible();
  await expect.poll(()=>page.evaluate(()=>!!window.BaliCalendarShowcase)).toBe(true);
}
async function insertEvents(page){
  await page.evaluate(()=>{
    const grid=document.getElementById('eventsGrid');
    const fragment=document.createDocumentFragment();
    for(const [i,date] of ['2026-10-23','2026-10-24','2026-10-30'].entries()){
      const card=document.createElement('article');
      card.className='event-card';card.dataset.eventDate=date;
      const photo=document.createElement('div');photo.className='bali-event-poster-wrap';
      const img=document.createElement('img');
      img.className='event-poster';img.src='assets/bali-id-card-readable.svg';
      img.alt='Афиша тест '+(i+1);photo.append(img);
      const body=document.createElement('div');body.className='event-card-body';
      const info=document.createElement('div');info.className='bali-event-info';
      const title=document.createElement('h3');title.textContent='Событие '+(i+1);
      const hours=document.createElement('p');hours.className='bali-event-hours';
      hours.textContent='23:00–06:00';
      const desc=document.createElement('p');desc.className='bali-event-description';
      desc.textContent='Подробное описание мероприятия '+(i+1);
      info.append(title,hours,desc);
      const actions=document.createElement('div');actions.className='bali-event-actions';
      const attend=document.createElement('button');
      attend.className='event-want-to-go';attend.textContent='Хочу пойти';
      actions.append(attend);body.append(info,actions);card.append(photo,body);
      fragment.append(card);
    }
    grid.replaceChildren(fragment);
  });
  await expect(page.locator('#eventsGrid .event-card')).toHaveCount(3);
  await expect(page.locator('#eventsGrid .event-share')).toHaveCount(3);
  await page.waitForTimeout(200);
}
test('two responsive reference layouts keep a background-free calendar',async({page})=>{
  await openCalendar(page);
  const state=await page.evaluate(()=>{
    const cal=document.getElementById('baliCalendarPanel');
    const poster=document.getElementById('eventsCarouselShell');
    const p=cal.getBoundingClientRect(),a=poster.getBoundingClientRect();
    return {calLeft:p.left,calTop:p.top,posterLeft:a.left,posterTop:a.top,
      background:getComputedStyle(cal).backgroundColor,
      blur:getComputedStyle(cal).backdropFilter,
      grid:getComputedStyle(document.getElementById('baliCalendarGrid')).display,
      previous:getComputedStyle(document.getElementById('baliPosterPrevious')).display};
  });
  expect(state.background).toBe('rgba(0, 0, 0, 0)');
  expect(state.blur).toBe('none');
  expect(state.grid).toBe('flex');
  if(page.viewportSize().width>=1180){
    expect(state.posterLeft).toBeLessThan(state.calLeft);
    expect(state.previous).toBe('grid');
  }else{
    expect(state.calTop).toBeLessThan(state.posterTop);
    expect(state.previous).toBe('none');
  }
  await expect(page.locator('#baliCalendarDays .bali-calendar-day')).toHaveCount(42);
});
test('posters stay image-only with caption outside and details open on click',async({page})=>{
  await openCalendar(page);
  await insertEvents(page);
  const poster=page.locator('#eventsGrid .bali-event-poster-wrap').first();
  await expect(poster).toHaveAttribute('role','button');
  await expect(page.locator('#eventsGrid .bali-event-date-badge')).toHaveCount(0);
  const content=await page.locator('#eventsGrid .event-card').first().evaluate(n=>{
    const wrapper=n.querySelector('.bali-event-poster-wrap').getBoundingClientRect();
    const body=n.querySelector('.event-card-body').getBoundingClientRect();
    const image=n.querySelector('.event-poster');
    return {imageTop:wrapper.top,captionTop:body.top,ratio:wrapper.width/wrapper.height,
      imageVisible:getComputedStyle(image).display,
      desc:getComputedStyle(n.querySelector('.bali-event-description')).display};
  });
  expect(content.ratio).toBeGreaterThan(.9);expect(content.ratio).toBeLessThan(1.1);
  expect(content.captionTop).toBeGreaterThan(content.imageTop);
  expect(content.desc).toBe('none');
  await poster.click();
  await expect(page.locator('#baliEventDetailDialog')).toHaveAttribute('open','');
  await expect(page.locator('#baliEventDetailTitle')).toHaveText('Событие 1');
  await expect(page.locator('#baliEventDetailDescription')).toContainText('Подробное описание');
  await page.locator('#baliEventDetailClose').click();
  await expect(page.locator('#baliEventDetailDialog')).not.toHaveAttribute('open','');
});
test('desktop arrows move carousel and inverted wheel maps down to left',async({page})=>{
  await openCalendar(page);await insertEvents(page);
  if(page.viewportSize().width<1180)return;
  const next=page.locator('#baliPosterNext');
  await next.click();
  await expect.poll(()=>page.evaluate(()=>window.BaliCalendarShowcase.getState().activeIndex),
    {timeout:6000}).toBe(1);
  await page.locator('#eventsCarouselShell').evaluate(node=>{
    node.dispatchEvent(new WheelEvent('wheel',{bubbles:true,cancelable:true,deltaY:140}));
  });
  await expect.poll(()=>page.evaluate(()=>window.BaliCalendarShowcase.getState().activeIndex),
    {timeout:6000}).toBe(0);
});
test('BALI ID keeps all four sides of the card on-screen, and shows right-hand title',async({page})=>{
  await page.goto('/index.html#id');
  await page.evaluate(()=>{
    document.getElementById('baliIdSection').hidden=false;
    document.body.dataset.baliPage='id';
  });
  await expect(page.locator('#baliIdFlipScene')).toBeVisible();
  const layout=await page.evaluate(()=>{
    const area=document.getElementById('baliIdSection');
    const container=area.querySelector('.container');
    const card=document.getElementById('baliIdFlipScene');
    const title=document.getElementById('baliIdPageHeading');
    const rect=card.getBoundingClientRect(),head=title.getBoundingClientRect();
    const w=window.innerWidth;
    const overflow=getComputedStyle(container).overflow;
    return {left:rect.left,right:rect.right,width:rect.width,viewport:w,
      titleRight:head.right,titleText:title.textContent.trim(),
      overflow,pageScrollable:document.documentElement.scrollHeight>window.innerHeight+5};
  });
  expect(layout.left).toBeGreaterThanOrEqual(8);
  expect(layout.right).toBeLessThanOrEqual(layout.viewport-8);
  expect(layout.titleRight).toBeLessThanOrEqual(layout.viewport);
  expect(layout.titleText).toContain('цифровая карта гостя');
  expect(layout.overflow).toBe('visible');
  expect(layout.pageScrollable).toBe(false);
  await expect.poll(()=>page.evaluate(()=>!!window.BaliIdMotion)).toBe(true);
  const scene=page.locator('#baliIdFlipScene');
  const rect=await scene.boundingBox();
  await page.mouse.click(rect.x+rect.width*.5,rect.y+rect.height*.5);
  await expect.poll(()=>page.evaluate(()=>window.BaliIdMotion.getState().flipped)).toBe(true);
});
