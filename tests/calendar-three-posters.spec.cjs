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
      event.className='event-card';event.dataset.eventDate='2026-10-'+String(i+22).padStart(2,'0');
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
test('desktop brings mirrored side posters behind the center',async({page})=>{
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
  // Neighbours tuck behind the centre with a symmetric, modest overlap.
  expect(left.left).toBeLessThan(center.left);
  expect(right.right).toBeGreaterThan(center.right);
  expect(left.right).toBeLessThan(center.left+center.width*.2);
  expect(right.left).toBeGreaterThan(center.right-center.width*.2);
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

test('planned future date stays green with three dark dots until unplanned',async({page})=>{
  await prepare(page,4);
  await page.evaluate(()=>{
    const events=[
      {id:'2026-12-25',date:'2026-12-25',title:'BALI Xmas Main',dotColor:'#123456'},
      {id:'2026-12-25__2',date:'2026-12-25',title:'BALI Xmas Special',dotColor:'#ee8855'},
      {id:'2026-12-25__3',date:'2026-12-25',title:'BALI Xmas Afterparty',dotColor:'#7744cc'}
    ];
    window.dispatchEvent(new CustomEvent('bali:events',{detail:{events}}));
    window.dispatchEvent(new CustomEvent('bali:interests',{detail:{dates:['2026-12-25']}}));
    // December 2026
    const now=document.getElementById('baliCalendarMonthName').textContent;
    const month=document.getElementById('baliCalendarPanel');
    // Navigate calendar months via existing arrow controls, without stubbing the module clock.
  });
  // December is selectable via the public calendar UI.
  for(let attempts=0;attempts<24;attempts++){
    const label=await page.locator('#baliCalendarMonthName').textContent();
    if(label.includes('декабрь')&&label.includes('2026'))break;
    const monthNumber=new Date().getMonth()+1;
    await page.locator('#baliCalendarNext').click();
  }
  const day=page.locator('#baliCalendarDays [data-date="2026-12-25"]');
  await expect(day).toBeVisible();
  // Move away from the automatically selected poster: a saved plan must
  // remain highlighted independently of the currently selected date.
  await page.evaluate(()=>document.querySelector('#baliCalendarDays [data-date="2026-12-26"]').click());
  await expect(day).toHaveAttribute('data-planned','true');
  await expect(day).toHaveAttribute('data-event-count','3');
  await expect(day.locator('.bali-calendar-event-dot')).toHaveCount(3);
  await expect(day).toHaveAttribute('data-lifecycle-status','upcoming');
  await expect(day).toHaveCSS('background-image','none');
  await expect(day).toHaveCSS('background-color','rgb(185, 255, 81)');
  await expect(day).toHaveCSS('border-color','rgb(185, 255, 81)');
  expect(await day.locator('.bali-calendar-day-number').evaluate(n=>getComputedStyle(n).color))
    .toBe('rgb(21, 25, 16)');
  for(const dot of await day.locator('.bali-calendar-event-dot').all())
    expect(await dot.evaluate(n=>getComputedStyle(n).backgroundColor)).toBe('rgb(21, 25, 16)');
  await page.evaluate(()=>window.dispatchEvent(new CustomEvent('bali:interests',{detail:{dates:[]}})));
  await expect(day).toHaveAttribute('data-planned','false');
  await expect(day).toHaveCSS('background-color','rgba(0, 0, 0, 0)');
  const colors=await day.locator('.bali-calendar-event-dot').evaluateAll(nodes=>nodes.map(n=>getComputedStyle(n).backgroundColor));
  expect(colors).toEqual(['rgb(18, 52, 86)','rgb(238, 136, 85)','rgb(119, 68, 204)']);
});
test('poster edges dissolve while the desktop page heading is absent',async({page})=>{
  await prepare(page,6);
  await page.evaluate(()=>window.BaliCalendarShowcase.focusIndex(2,false));
  await expect(page.locator('#eventsSection .events-topbar')).toHaveCSS('display','none');
  await expect(page.locator('#eventsGrid .event-card[data-stage-side="left"]')).toHaveCount(1);
  await expect(page.locator('#eventsGrid .event-card[data-stage-side="right"]')).toHaveCount(1);
  const fades=await page.locator('#eventsGrid').evaluate(n=>({
    left:getComputedStyle(n,'::before').backgroundImage,
    right:getComputedStyle(n,'::after').backgroundImage,
    mask:getComputedStyle(n.querySelector('.event-card[data-stage-side="left"]')).maskImage,
    crisp:getComputedStyle(n.querySelector('.event-card.is-active')).maskImage
  }));
  expect(fades.left).toContain('linear-gradient');
  expect(fades.right).toContain('linear-gradient');
  expect(fades.mask).toContain('linear-gradient');
  expect(fades.crisp).toBe('none');
});

test('center poster retains a crisp perimeter without glow or decorative backing',async({page})=>{
  await prepare(page,3);
  const style=await page.locator('#eventsGrid .event-card.is-active>.bali-event-poster-wrap').evaluate(el=>{
    const computed=getComputedStyle(el);
    const pseudo=getComputedStyle(el,'::before');
    const card=getComputedStyle(el.closest('.event-card'));
    return {
      background:computed.backgroundColor,
      image:computed.backgroundImage,
      shadow:computed.boxShadow,
      border:computed.borderTopWidth,
      overlay:pseudo.display,
      cardBackground:card.backgroundColor,
      cardShadow:card.boxShadow,
      photoVisible:getComputedStyle(el.querySelector('.event-poster')).display
    };
  });
  expect(style.background).toBe('rgba(0, 0, 0, 0)');
  expect(style.image).toBe('none');
  expect(style.shadow).toBe('none');
  expect(style.border).toBe('1px');
  expect(style.overlay).toBe('none');
  expect(style.cardBackground).toBe('rgba(0, 0, 0, 0)');
  expect(style.cardShadow).toBe('none');
  expect(style.photoVisible).not.toBe('none');
});

test('centered poster stays above both mirrored side posters',async({page})=>{
  await prepare(page,5);
  await page.evaluate(()=>window.BaliCalendarShowcase.focusIndex(2,false));
  const layers=await page.locator('#eventsGrid>.event-card').evaluateAll(cards=>
    cards.filter(card=>getComputedStyle(card).visibility==='visible')
      .map(card=>({
        active:card.classList.contains('is-active'),
        z:Number(getComputedStyle(card).zIndex),
        turn:parseFloat(card.style.getPropertyValue('--bali-stage-angle')),
        side:card.dataset.stageSide
      }))
  );
  const center=layers.find(x=>x.active);
  const left=layers.find(x=>x.side==='left');
  const right=layers.find(x=>x.side==='right');
  expect(center).toBeTruthy();
  expect(left).toBeTruthy();
  expect(right).toBeTruthy();
  expect(center.z).toBeGreaterThan(left.z);
  expect(center.z).toBeGreaterThan(right.z);
  expect(center.turn).toBe(0);
  expect(left.turn).toBeGreaterThanOrEqual(60);
  expect(right.turn).toBeLessThanOrEqual(-60);
});


test('solid-color overlap regression: right plane cannot paint over active square',async({page})=>{
  await prepare(page,5);
  await page.evaluate(async()=>{
    window.BaliCalendarShowcase.focusIndex(2,false);
    const cards=[...document.querySelectorAll('#eventsGrid>.event-card')];
    const svg=color=>`<svg xmlns="http://www.w3.org/2000/svg" width="200" height="200"><rect width="200" height="200" fill="${color}"/></svg>`;
    for(const [i,card] of cards.entries()){
      const color=i===2?'#e82c35':i===3?'#2456eb':'#28d65c';
      const img=card.querySelector('.event-poster');
      img.src='data:image/svg+xml;charset=utf-8,'+encodeURIComponent(svg(color));
    }
    await Promise.all(cards.map(card=>card.querySelector('img').decode()));
    // Force a measurable visual intersection, not merely CSS z-index.
    // If the old preserve-3d scene returns, blue may render above red.
    const right=cards[3];
    const width=parseFloat(document.getElementById('eventsGrid').style.getPropertyValue('--bali-event-slide-width'));
    right.style.setProperty('--bali-stage-x',(width*.30).toFixed(2)+'px');
  });
  const locations=await page.evaluate(()=>{
    const center=document.querySelector('#eventsGrid>.event-card.is-active>.bali-event-poster-wrap').getBoundingClientRect();
    const right=document.querySelector('#eventsGrid>.event-card[data-stage-side="right"]>.bali-event-poster-wrap').getBoundingClientRect();
    const x=center.left+center.width*.75;
    const y=center.top+center.height*.5;
    return {x,y,centerRight:center.right,rightLeft:right.left,rightRight:right.right,
      gridStyle:getComputedStyle(document.getElementById('eventsGrid')).transformStyle};
  });
  expect(locations.rightLeft).toBeLessThan(locations.x);
  expect(locations.rightRight).toBeGreaterThan(locations.x);
  expect(locations.gridStyle).toBe('flat');
  const shot=await page.screenshot({animations:'disabled'});
  const sharp=require('sharp');
  const pixels=await sharp(shot).ensureAlpha().raw().toBuffer({resolveWithObject:true});
  const pos=(Math.floor(locations.y)*pixels.info.width+Math.floor(locations.x))*pixels.info.channels;
  const [red,green,blue]=pixels.data.subarray(pos,pos+3);
  expect(red,`Center right-quarter pixel RGB=${red},${green},${blue}`).toBeGreaterThan(145);
  expect(blue,`Side blue must NOT obscure the central red square`).toBeLessThan(125);
});

test('mobile controls rise before the poster travel ends',async({page})=>{
  test.skip(page.viewportSize().width>767,'phone only');
  await prepare(page,4);
  const timing=await page.locator('#eventsGrid .event-card.is-active .bali-event-actions').evaluate(el=>{
    const style=getComputedStyle(el);
    return {durations:style.transitionDuration.split(',').map(x=>parseFloat(x)),
      delay:style.transitionDelay};
  });
  expect(Math.max(...timing.durations)).toBeLessThanOrEqual(.18);
  expect(timing.delay).not.toContain('0.2s');
});

test('desktop calendar has one seamless background and vertically centered poster group',async({page})=>{
  test.skip(page.viewportSize().width<1180,'Desktop-only centering; phone uses equal-gap layout');
  await prepare(page,4);
  await page.evaluate(()=>window.BaliCalendarShowcase.focusIndex(1,false));
  const scene=await page.evaluate(()=>{
    const section=document.getElementById('eventsSection');
    const grid=document.getElementById('eventsGrid');
    const card=grid.querySelector('.event-card.is-active');
    const stageBox=grid.getBoundingClientRect();
    const cardBox=card.getBoundingClientRect();
    const sectionStyle=getComputedStyle(section);
    const gridStyle=getComputedStyle(grid);
    return {
      offset:Math.abs((stageBox.top+stageBox.bottom)/2-(cardBox.top+cardBox.bottom)/2),
      pageBackground:sectionStyle.backgroundColor,
      pageImage:sectionStyle.backgroundImage,
      stageBackground:gridStyle.backgroundColor,
      stageImage:gridStyle.backgroundImage,
      sideFade:getComputedStyle(grid,'::before').backgroundImage,
      bounds:{top:cardBox.top,bottom:cardBox.bottom,stageTop:stageBox.top,stageBottom:stageBox.bottom}
    };
  });
  expect(scene.pageBackground).toBe('rgb(8, 11, 17)');
  expect(scene.pageImage).toBe('none');
  expect(scene.stageBackground).toBe('rgba(0, 0, 0, 0)');
  expect(scene.stageImage).toBe('none');
  expect(scene.sideFade).toContain('linear-gradient');
  expect(scene.offset).toBeLessThan(3);
  expect(scene.bounds.top).toBeGreaterThan(scene.bounds.stageTop);
  expect(scene.bounds.bottom).toBeLessThan(scene.bounds.stageBottom);
});
