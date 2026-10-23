const {test,expect}=require('@playwright/test');
test.beforeEach(async({page})=>{
  // Exercise the real page router with an already accepted fixture account.
  await page.addInitScript(()=>{window.BaliIdOnboarding={isAccepted:()=>true,open:async()=>true}});
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
  await expect(page.locator('#eventsGrid .bali-share-trigger')).toHaveCount(3);
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
  const days=await page.locator('#baliCalendarDays .bali-calendar-day').count();
  expect(days).toBeGreaterThanOrEqual(28);
  expect(days%7).toBe(0);
});
test('posters stay image-only with caption outside and details open on click',async({page})=>{
  await openCalendar(page);
  await insertEvents(page);
  const poster=page.locator('#eventsGrid .event-card.is-active .bali-event-poster-wrap');
  await expect(poster).toHaveAttribute('role','button');
  await expect(page.locator('#eventsGrid .bali-event-date-badge')).toHaveCount(0);
  const content=await page.locator('#eventsGrid .event-card.is-active').evaluate(n=>{
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
  await expect(page.locator('#baliEventDetailDescription')).toContainText('Подробное описание мероприятия 1');
  await page.locator('#baliEventDetailClose').click();
  await expect(page.locator('#baliEventDetailDialog')).not.toHaveAttribute('open','');
});
test('desktop arrows and inverted wheel move fixed-center 3D posters in reference directions',async({page})=>{
  await openCalendar(page);await insertEvents(page);
  if(page.viewportSize().width<1180)return;
  await page.evaluate(()=>window.BaliCalendarShowcase.focusIndex(1,false));
  await expect(page.locator('#eventsGrid')).toHaveCSS('overflow-x','hidden');
  await expect.poll(()=>page.evaluate(()=>window.BaliCalendarShowcase.getState().activeIndex)).toBe(1);
  const angles=await page.locator('#eventsGrid .event-card').evaluateAll(nodes=>nodes.map(n=>({
    angle:n.style.getPropertyValue('--bali-stage-angle'),
    x:parseFloat(n.style.getPropertyValue('--bali-stage-x'))
  })));
  expect(parseFloat(angles[0].angle)).toBeGreaterThan(40);
  expect(angles[0].x).toBeLessThan(0);
  expect(parseFloat(angles[2].angle)).toBeLessThan(-40);
  expect(angles[2].x).toBeGreaterThan(0);
  // Arrow next pushes the central card to the left.
  await page.locator('#baliPosterNext').click();
  await expect.poll(()=>page.evaluate(()=>window.BaliCalendarShowcase.getState().activeIndex),
    {timeout:6000}).toBe(2);
  // Wheel UP: current card moves right, previously viewed card returns.
  await page.locator('#eventsCarouselShell').evaluate(node=>{
    node.dispatchEvent(new WheelEvent('wheel',{bubbles:true,cancelable:true,deltaY:-140}));
  });
  await expect.poll(()=>page.evaluate(()=>window.BaliCalendarShowcase.getState().activeIndex),
    {timeout:6000}).toBe(1);
  await page.waitForTimeout(470);
  // Wheel DOWN: center moves left and next moves into center.
  await page.locator('#eventsCarouselShell').evaluate(node=>{
    node.dispatchEvent(new WheelEvent('wheel',{bubbles:true,cancelable:true,deltaY:140}));
  });
  await expect.poll(()=>page.evaluate(()=>window.BaliCalendarShowcase.getState().activeIndex),
    {timeout:6000}).toBe(2);
});
test('BALI ID keeps its enlarged card on-screen without redundant heading',async({page})=>{
  await page.goto('/index.html#id');
  await page.evaluate(()=>{
    navigateGuestPage('id');
    document.body.dataset.baliPage='id';
  });
  await expect(page.locator('#baliIdFlipScene')).toBeVisible();
  const layout=await page.evaluate(()=>{
    const area=document.getElementById('baliIdSection');
    const container=area.querySelector('.container');
    const card=document.getElementById('baliIdFlipScene');
    const rect=card.getBoundingClientRect();
    const w=window.innerWidth;
    const overflow=getComputedStyle(container).overflow;
    return {left:rect.left,right:rect.right,width:rect.width,viewport:w,
      accessibleName:area.getAttribute('aria-label'),
      overflow,pageScrollable:document.documentElement.scrollHeight>window.innerHeight+5};
  });
  expect(layout.left).toBeGreaterThanOrEqual(8);
  expect(layout.right).toBeLessThanOrEqual(layout.viewport-8);
  expect(layout.accessibleName).toBe('BALI ID');
  await expect(page.locator('#baliIdPageHeading')).toHaveCount(0);
  expect(layout.overflow).toBe('visible');
  expect(layout.pageScrollable).toBe(false);
  await expect.poll(()=>page.evaluate(()=>!!window.BaliIdMotion)).toBe(true);
  const scene=page.locator('#baliIdFlipScene');
  // Locator click waits until the card really receives pointer input. A raw
  // coordinate mouse click can race the initial loading/consent overlay,
  // creating a false negative under heavy parallel CI load.
  await scene.click();
  await expect.poll(()=>page.evaluate(()=>window.BaliIdMotion.getState().flipped)).toBe(true);
});

test('3D carousel keeps older posters mounted through several changes',async({page})=>{
  await openCalendar(page);
  const grid=page.locator('#eventsGrid');
  // Feed the real event store so calendar-range updates retain all six records.
  await page.evaluate(()=>{
    const now=new Date(),year=now.getUTCFullYear(),month=String(now.getUTCMonth()+1).padStart(2,'0');
    const events=Array.from({length:6},(_,i)=>({
      id:`${year}-${month}-${String(i+10).padStart(2,'0')}`,
      date:`${year}-${month}-${String(i+10).padStart(2,'0')}`,
      title:'Событие '+(i+1),description:'Описание '+(i+1),
      poster_url:'assets/bali-id-card-readable.svg'
    }));
    window.dispatchEvent(new CustomEvent('bali:events',{detail:{events}}));
  });
  await expect(grid.locator('.event-card')).toHaveCount(6);
  await expect.poll(()=>page.evaluate(()=>window.BaliCalendarShowcase.getState().cardCount)).toBe(6);
  await page.evaluate(()=>window.BaliCalendarShowcase.focusIndex(4,false));
  const layout=await grid.locator('.event-card').evaluateAll(nodes=>nodes.map((n,i)=>({
    i,angle:parseFloat(n.style.getPropertyValue('--bali-stage-angle')),
    x:parseFloat(n.style.getPropertyValue('--bali-stage-x')),
    display:getComputedStyle(n).display,
    z:parseInt(n.style.zIndex,10)
  })));
  expect(layout).toHaveLength(6);
  expect(layout.filter(card=>card.display!=='none')).toHaveLength(6);
  expect(layout[0].x).toBeLessThan(layout[3].x);
  expect(layout[2].z).toBeLessThan(layout[3].z);
  expect(layout[3].x).toBeLessThan(0);
  expect(layout[4].x).toBeCloseTo(0,0);
  expect(layout[5].x).toBeGreaterThan(0);
});
test('mobile has no top BALI calendar heading, square close posters and no carousel arrows',async({page})=>{
  await openCalendar(page);await insertEvents(page);
  if(page.viewportSize().width>767)return;
  await page.evaluate(()=>window.BaliCalendarShowcase.focusIndex(1,false));
  await expect(page.locator('#eventsSection .events-topbar')).toHaveCSS('display','none');
  await expect(page.locator('#baliPosterPrevious')).toHaveCSS('display','none');
  const layout=await page.evaluate(()=>{
    const grid=document.getElementById('eventsGrid');
    const card=grid.querySelector('.event-card.is-active');
    const wrapper=card.querySelector('.bali-event-poster-wrap').getBoundingClientRect();
    const calendar=document.getElementById('baliCalendarPanel').getBoundingClientRect();
    const positions=[...grid.querySelectorAll('.event-card')].map(n=>parseFloat(n.style.getPropertyValue('--bali-stage-x')));
    return {ratio:wrapper.width/wrapper.height,
      positions,calendarBottom:calendar.bottom,posterTop:wrapper.top,
      scroll:parseFloat(getComputedStyle(grid).overflowX==='hidden'?0:1)};
  });
  expect(layout.ratio).toBeCloseTo(1,1);
  expect(layout.positions[0]).toBeLessThan(0);
  expect(layout.positions[1]).toBeCloseTo(0,0);
  expect(layout.positions[2]).toBeGreaterThan(0);
  // The deliberately larger central poster needs a slightly wider 3D slot.
  expect(layout.positions[2]).toBeLessThan(340);
  expect(layout.calendarBottom).toBeLessThan(layout.posterTop+15);
  expect(layout.scroll).toBe(0);
});
test('touch swipes directly move the 3D cards left and right without native scrolling',async({page})=>{
  await openCalendar(page);await insertEvents(page);
  const result=await page.evaluate(()=>{
    const grid=document.getElementById('eventsGrid');
    const rect=grid.getBoundingClientRect(),x=rect.left+rect.width*.5,y=rect.top+Math.min(55,rect.height*.25);
    const pointer=(type,id,dx)=>grid.dispatchEvent(new PointerEvent(type,{
      bubbles:true,isPrimary:true,button:0,pointerType:'touch',pointerId:id,
      clientX:x+dx,clientY:y
    }));
    pointer('pointerdown',70,0);
    pointer('pointermove',70,-120);
    const progress=window.BaliCalendarShowcase.getState().position;
    const visual=grid.querySelector('.event-card').style.getPropertyValue('--bali-stage-x');
    pointer('pointerup',70,-120);
    return {progress,visual,index:window.BaliCalendarShowcase.getState().activeIndex,
      scrollLeft:grid.scrollLeft};
  });
  expect(result.progress).toBeGreaterThan(.25);
  expect(result.visual).toContain('px');
  expect(result.index).toBe(1);
  expect(result.scrollLeft).toBe(0);
});

test('completed parties retain an unfilled red outline; today has a white contour', async ({page}) => {
  await openCalendar(page);
  const dates=await page.evaluate(()=>{
    const pieces=new Intl.DateTimeFormat('en-GB',{
      timeZone:'Europe/Minsk',year:'numeric',month:'2-digit',day:'2-digit'
    }).formatToParts(new Date());
    const p=Object.fromEntries(pieces.map(x=>[x.type,x.value]));
    const today=p.year+'-'+p.month+'-'+p.day;
    const shift=delta=>{
      const date=new Date(today+'T12:00:00Z');
      date.setUTCDate(date.getUTCDate()+delta);
      return date.toISOString().slice(0,10);
    };
    const past=shift(-1),future=shift(1);
    window.dispatchEvent(new CustomEvent('bali:events',{detail:{events:[
      {id:past,date:past,title:'Прошедшая вечеринка',dotColor:'#b9ff51'},
      {id:past+'__2',date:past,title:'Прошедшая вечеринка 2',dotColor:'#b9ff51'},
      {id:future,date:future,title:'Будущая вечеринка',dotColor:'#b9ff51'}
    ]}}));
    window.dispatchEvent(new CustomEvent('bali:calendar:plans-changed',{
      detail:{dates:[past,today]}
    }));
    return {past,today,future};
  });
  const locate=async date=>{
    // The calendar also renders adjacent-month days. Move a month if
    // the requested date is outside those visible cells.
    await page.evaluate(()=>window.dispatchEvent(new Event('bali:calendar:open')));
    let cell=page.locator('#baliCalendarDays .bali-calendar-day[data-date="'+date+'"]');
    if(!(await cell.count()))await page.locator(date<dates.today?'#baliCalendarPrev':'#baliCalendarNext').click();
    await expect(cell).toHaveCount(1);
    return cell;
  };
  const today=await locate(dates.today);
  await expect(today).toHaveAttribute('data-today','true');
  await expect(today).toHaveAttribute('data-planned','true');
  await expect(today).toHaveCSS('background-color','rgba(0, 0, 0, 0)');
  await expect(today).toHaveCSS('border-color','rgb(255, 255, 255)');
  await expect(today).toHaveCSS('border-top-width','1px');
  await expect(today).toHaveCSS('border-radius','5px');
  await expect(today).toHaveCSS('outline-style','none');
  await expect(today.locator('.bali-calendar-day-number')).toHaveCSS('color','rgb(237, 244, 234)');
  const past=await locate(dates.past);
  await expect(past).toHaveAttribute('data-past','true');
  await expect(past).toHaveAttribute('data-planned','true');
  await expect(past).toHaveAttribute('data-event-count','2');
  await expect(past).toHaveAttribute('data-lifecycle-status','past');
  await expect(past).toHaveCSS('background-color','rgba(0, 0, 0, 0)');
  await expect(past).toHaveAttribute('data-ring','none');
  await expect(past).toHaveCSS('border-color','rgba(0, 0, 0, 0)');
  await expect(past).toHaveCSS('background-image','none');
  await expect(past.locator('.bali-calendar-event-dot')).toHaveCount(2);
  for(const dot of await past.locator('.bali-calendar-event-dot').all())
    await expect(dot).toHaveCSS('background-color','rgb(250, 96, 112)');
  await past.click();
  await expect(past).toHaveAttribute('data-selected','true');
  // Selecting or planning an archived event must never fill its date.
  await expect(past).toHaveCSS('background-color','rgba(0, 0, 0, 0)');
  // Only the actively browsed poster receives a red ring; saving an old plan
  // must never fill the cell or change the archival color of its event dots.
  expect(['past','none']).toContain(await past.getAttribute('data-ring'));
  for(const dot of await past.locator('.bali-calendar-event-dot').all())
    await expect(dot).toHaveCSS('background-color','rgb(250, 96, 112)');
  const future=await locate(dates.future);
  await expect(future).toHaveAttribute('data-past','false');
  await expect(future.locator('.bali-calendar-event-dot')).toHaveCSS('background-color','rgb(185, 255, 81)');
});
