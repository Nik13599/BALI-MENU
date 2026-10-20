const {test,expect}=require('@playwright/test');

test.beforeEach(async({page})=>{
  await page.route('**/*',route=>new URL(route.request().url()).hostname==='127.0.0.1'
    ?route.continue():route.abort());
});
async function prepare(page,count=10){
  await page.goto('/index.html#events');
  await page.evaluate(()=>{
    document.getElementById('eventsSection').hidden=false;
    document.body.dataset.baliPage='events';
  });
  await expect.poll(()=>page.evaluate(()=>window.BaliCalendarShowcase?.mode)).toBe('stage');
  await page.evaluate(n=>{
    const root=document.getElementById('eventsGrid');
    const frag=document.createDocumentFragment();
    for(let i=0;i<n;i++){
      const event=document.createElement('article');
      event.className='event-card';event.dataset.eventDate='2026-10-'+String(i+1).padStart(2,'0');
      const poster=document.createElement('div');poster.className='bali-event-poster-wrap';
      const img=document.createElement('img');img.src='assets/bali-id-card-readable.svg';
      img.className='event-poster';poster.append(img);
      const body=document.createElement('div');body.className='event-card-body';
      const info=document.createElement('div');info.className='bali-event-info';
      const h=document.createElement('h3');h.textContent='Событие '+(i+1);
      const time=document.createElement('p');time.className='bali-event-hours';time.textContent='23:00–06:00';
      info.append(h,time);
      const actions=document.createElement('div');actions.className='bali-event-actions';
      const want=document.createElement('button');want.className='event-want-to-go';
      want.textContent='Хочу пойти';actions.append(want);
      body.append(info,actions);event.append(poster,body);frag.append(event);
    }
    root.replaceChildren(frag);
  },count);
  await expect(page.locator('#eventsGrid .event-card')).toHaveCount(count);
  await expect(page.locator('#eventsGrid .bali-share-trigger')).toHaveCount(count);
  await page.waitForTimeout(150);
}
async function geometry(page){
  return page.evaluate(()=>{
    const root=document.getElementById('eventsGrid');
    const scene=root.getBoundingClientRect();
    const poster=(card)=>card.querySelector('.bali-event-poster-wrap').getBoundingClientRect();
    const entries=[...root.querySelectorAll('.event-card')];
    const visible=entries.map((card,index)=>({
      index,
      hidden:card.getAttribute('aria-hidden'),
      visibility:getComputedStyle(card).visibility,
      angle:parseFloat(card.style.getPropertyValue('--bali-stage-angle')),
      computedTransform:getComputedStyle(card).transform,
      xvar:card.style.getPropertyValue('--bali-stage-x'),
      sceneWidth:scene.width,
      rect:poster(card),
      card:card.getBoundingClientRect()
    })).filter(c=>c.visibility==='visible');
    return {
      stageWidth:scene.width,viewport:innerWidth,
      stageLeft:scene.left,stageRight:scene.right,
      visible:visible.map(v=>({index:v.index,hidden:v.hidden,angle:v.angle,
        left:v.rect.left,right:v.rect.right,width:v.rect.width,
        computedTransform:v.computedTransform,xvar:v.xvar,sceneWidth:v.sceneWidth,
        height:v.rect.height})),
      total:entries.length,
      calendarWidth:document.getElementById('baliCalendarPanel').getBoundingClientRect().width,
      shellWidth:document.getElementById('eventsCarouselShell').getBoundingClientRect().width
    };
  });
}
test('ten published events show at most three distinct posters: no hidden pile',async({page})=>{
  await prepare(page,10);
  let g=await geometry(page);
  expect(g.visible.map(x=>x.index)).toEqual([0,1]);
  expect(g.visible).toHaveLength(2);
  // The first upcoming event has no phantom left-hand poster.
  await page.evaluate(()=>window.BaliCalendarShowcase.focusIndex(1,false));
  g=await geometry(page);
  expect(g.visible.map(x=>x.index)).toEqual([0,1,2]);
  await page.evaluate(()=>window.BaliCalendarShowcase.focusIndex(7,false));
  g=await geometry(page);
  expect(g.total).toBe(10);
  expect(g.visible.map(x=>x.index)).toEqual([6,7,8]);
  expect(g.visible).toHaveLength(3);
  await page.evaluate(()=>window.BaliCalendarShowcase.focusIndex(0,false));
  g=await geometry(page);
  expect(g.visible.map(x=>x.index)).toEqual([0,1]);
  await page.evaluate(()=>window.BaliCalendarShowcase.focusIndex(9,false));
  g=await geometry(page);
  expect(g.visible.map(x=>x.index)).toEqual([8,9]);
});
test('no rectangular footer or event name below square poster: only two buttons',async({page})=>{
  await prepare(page,6);
  const state=await page.locator('#eventsGrid .event-card.is-active').evaluate(card=>{
    const photo=card.querySelector('.bali-event-poster-wrap');
    const body=card.querySelector('.event-card-body');
    const info=card.querySelector('.bali-event-info');
    const actions=card.querySelector('.bali-event-actions');
    const p=photo.getBoundingClientRect(),b=body.getBoundingClientRect();
    const s=getComputedStyle(body),a=getComputedStyle(actions);
    return {ratio:p.width/p.height,bodyY:b.y,photoBottom:p.bottom,
      infoDisplay:getComputedStyle(info).display,background:s.backgroundColor,
      image:s.backgroundImage,shadow:s.boxShadow,actionBackground:a.backgroundColor,
      labels:[...actions.querySelectorAll('button')].map(x=>x.textContent.trim())};
  });
  expect(state.ratio).toBeCloseTo(1,1);
  expect(state.bodyY).toBeGreaterThanOrEqual(state.photoBottom-2);
  expect(state.infoDisplay).toBe('none');
  expect(state.background).toBe('rgba(0, 0, 0, 0)');
  expect(state.image).toBe('none');
  expect(state.shadow).toBe('none');
  expect(state.actionBackground).toBe('rgba(0, 0, 0, 0)');
  expect(state.labels).toHaveLength(2);
  expect(state.labels[0]).toMatch(/Хочу пойти/);
  expect(state.labels[1]).toMatch(/Поделиться/);
});
test('desktop spends the left column on three non-overlapping 58° cards',async({page})=>{
  await prepare(page,10);
  if(page.viewportSize().width<1180)return;
  await page.evaluate(()=>window.BaliCalendarShowcase.focusIndex(1,false));
  const g=await geometry(page);
  const [left,center,right]=g.visible;
  expect(g.stageWidth).toBeGreaterThan(g.calendarWidth*1.3);
  expect(g.shellWidth).toBeGreaterThan(g.calendarWidth*1.3);
  expect(left.angle).toBeGreaterThan(54);
  expect(right.angle).toBeLessThan(-54);
  expect(center.angle).toBe(0);
  // Perspective geometry must not lay side artwork on top of the center.
  expect(left.right,JSON.stringify(g)).toBeLessThanOrEqual(center.left+7);
  expect(right.left).toBeGreaterThanOrEqual(center.right-7);
  expect(center.width).toBeGreaterThan(g.stageWidth*.40);
  await page.evaluate(()=>window.BaliCalendarShowcase.focusIndex(5,false));
  const q=await geometry(page);
  expect(q.visible).toHaveLength(3);
});
test('phone scene and calendar use all viewport width, square posters and swipe-only controls',async({page})=>{
  await prepare(page,10);
  if(page.viewportSize().width>=1180)return;
  await page.evaluate(()=>window.BaliCalendarShowcase.focusIndex(1,false));
  const g=await geometry(page);
  expect(g.stageWidth).toBeGreaterThanOrEqual(g.viewport-14);
  expect(g.stageLeft).toBeLessThanOrEqual(8);
  expect(g.stageRight).toBeGreaterThanOrEqual(g.viewport-8);
  const center=g.visible[1];
  expect(center.width/center.height).toBeCloseTo(1,1);
  expect(center.width).toBeGreaterThan(g.viewport*.37);
  await expect(page.locator('#baliPosterPrevious')).toHaveCSS('display','none');
  await expect(page.locator('#baliPosterNext')).toHaveCSS('display','none');
});
