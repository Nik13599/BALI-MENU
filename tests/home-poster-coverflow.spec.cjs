const {test,expect}=require('@playwright/test');

// Homepage posters are a static, date-ordered row. Only Calendar is a carousel.
test.beforeEach(async({page})=>{
 await page.route('**/*',route=>new URL(route.request().url()).hostname==='127.0.0.1'
   ?route.continue():route.abort());
});
async function prepare(page,events){
 await page.goto('/index.html');
 await page.evaluate(items=>{
   document.documentElement.classList.remove('bali-await-content');
   document.getElementById('homeSection').hidden=false;
   document.body.dataset.baliPage='home';
   window.dispatchEvent(new CustomEvent('bali:events',{detail:{events:items}}));
 },events);
 await expect.poll(()=>page.locator('#homeEventCarousel .bali-home-event-card').count()).toBe(
   page.viewportSize().width>=1180?5:3
 );
}
const fakeEvents=count=>Array.from({length:count},(_,i)=>({
 id:'party-'+i,date:'2099-11-'+String(i+1).padStart(2,'0'),
 title:'Мероприятие '+i,startTime:'23:00',endTime:'06:00',poster_url:''
}));
const snapshots=async page=>page.locator('#homeEventCarousel').evaluate(track=>{
 const cards=[...track.querySelectorAll(':scope>.bali-home-event-card')];
 const rect=el=>{const r=el.getBoundingClientRect();return {x:r.x,y:r.y,width:r.width,height:r.height}};
 return {
  cards:cards.map(card=>({
   id:card.dataset.eventId||null,
   placeholder:card.classList.contains('bali-home-event-placeholder'),
   position:getComputedStyle(card).position,
   transform:getComputedStyle(card).transform,
   visible:getComputedStyle(card).visibility,
   rect:rect(card)
  })),
  layout:getComputedStyle(track).display,
  horizontalOverflow:track.scrollWidth-track.clientWidth,
  label:track.getAttribute('aria-label'),
  arrows:track.querySelectorAll('.bali-home-coverflow-arrow').length,
  coverflow:track.hasAttribute('data-bali-coverflow'),
  scrollLeft:track.scrollLeft
 };
});

test('Mobile shows 3 static cards; desktop shows 5 without rotations or carousel controls',async({page})=>{
 await prepare(page,fakeEvents(6));
 const data=await snapshots(page);
 const count=page.viewportSize().width>=1180?5:3;
 expect(data.layout).toBe('grid');
 expect(data.cards.length).toBe(count);
 expect(data.arrows).toBe(0);
 expect(data.coverflow).toBe(false);
 expect(data.horizontalOverflow).toBeLessThanOrEqual(2);
 expect(data.scrollLeft).toBe(0);
 expect(data.label).not.toMatch(/карусел/i);
 expect(data.cards.map(x=>x.id)).toEqual(fakeEvents(count).map(x=>x.id));
 for(const card of data.cards){
   expect(card.position).toBe('relative');
   expect(card.transform).toBe('none');
   expect(card.visible).toBe('visible');
   expect(card.rect.width).toBeGreaterThan(15);
   expect(card.rect.height).toBeGreaterThan(15);
 }
 for(let i=1;i<data.cards.length;i++){
   expect(data.cards[i].rect.x).toBeGreaterThan(data.cards[i-1].rect.x);
   expect(Math.abs(data.cards[i].rect.y-data.cards[0].rect.y)).toBeLessThan(2);
 }
});

test('Mouse wheel and touch gestures do not swipe the homepage artwork',async({page})=>{
 await prepare(page,fakeEvents(6));
 const before=await snapshots(page);
 await page.locator('#homeEventCarousel').evaluate(track=>{
   track.dispatchEvent(new WheelEvent('wheel',{bubbles:true,deltaY:200}));
   track.dispatchEvent(new PointerEvent('pointerdown',{bubbles:true,isPrimary:true,pointerId:40,clientX:240,clientY:120}));
   track.dispatchEvent(new PointerEvent('pointerup',{bubbles:true,isPrimary:true,pointerId:40,clientX:100,clientY:120}));
 });
 const after=await snapshots(page);
 expect(after.cards.map(x=>x.id)).toEqual(before.cards.map(x=>x.id));
 expect(after.cards.map(x=>x.rect.x)).toEqual(before.cards.map(x=>x.rect.x));
 expect(after.scrollLeft).toBe(0);
 expect(after.arrows).toBe(0);
});

test('SECRET fills missing fixed slots only after genuine event data arrives',async({page})=>{
 await prepare(page,fakeEvents(1));
 const data=await snapshots(page);
 const expected=page.viewportSize().width>=1180?5:3;
 expect(data.cards).toHaveLength(expected);
 expect(data.cards[0].id).toBe('party-0');
 expect(data.cards.slice(1).every(c=>c.placeholder)).toBe(true);
 await expect(page.locator('#homeEventCarousel .bali-home-event-placeholder').first()).toContainText('SECRET');
});

test('After an overnight event ends it stays one hour, then disappears from Home',async({page})=>{
 await page.goto('/index.html');
 await page.evaluate(()=>{
   document.documentElement.classList.remove('bali-await-content');
   document.getElementById('homeSection').hidden=false;
   document.body.dataset.baliPage='home';
   Date.now=()=>Date.parse('2026-10-22T06:59:59+03:00');
   window.dispatchEvent(new CustomEvent('bali:events',{detail:{events:[
     {id:'overnight',date:'2026-10-21',title:'Первая',startTime:'23:00',endTime:'06:00',poster_url:''},
     {id:'second',date:'2026-10-22',title:'Вторая',startTime:'18:00',endTime:'22:00',poster_url:''},
     {id:'third',date:'2026-10-23',title:'Третья',startTime:'18:00',endTime:'22:00',poster_url:''},
     {id:'fourth',date:'2026-10-24',title:'Четвёртая',startTime:'18:00',endTime:'22:00',poster_url:''},
     {id:'fifth',date:'2026-10-25',title:'Пятая',startTime:'18:00',endTime:'22:00',poster_url:''}
   ]}}));
 });
 await expect.poll(async()=> (await snapshots(page)).cards[0]?.id).toBe('overnight');
 await page.evaluate(()=>{
   Date.now=()=>Date.parse('2026-10-22T07:00:00+03:00');
   window.dispatchEvent(new CustomEvent('bali:calendar:tick'));
 });
 await expect.poll(async()=> (await snapshots(page)).cards[0]?.id).toBe('second');
 const data=await snapshots(page);
 expect(data.cards.map(c=>c.id).filter(Boolean)).toEqual(
   page.viewportSize().width>=1180?['second','third','fourth','fifth']:['second','third','fourth']
 );
 expect(data.cards.every(c=>c.visible==='visible'&&c.transform==='none')).toBe(true);
});

test('Calendar keeps its separate event carousel script and controls',async({page})=>{
 await page.goto('/index.html#events');
 await expect.poll(()=>page.evaluate(()=>
   !!document.querySelector('script[src*="bali-calendar-coverflow.js"]')
 )).toBe(true);
 expect(await page.evaluate(()=>!!document.querySelector('script[src*="bali-home-coverflow.js"]'))).toBe(false);
});
