const {test,expect}=require('@playwright/test');

test.beforeEach(async({page})=>{
 await page.route('**/*',route=>new URL(route.request().url()).hostname==='127.0.0.1'
   ?route.continue():route.abort());
});
async function sample(page){
 await page.goto('/index.html');
 await expect.poll(()=>page.evaluate(()=>Boolean(window.BaliHomeCarousel))).toBe(true);
 await page.evaluate(()=>{
   document.documentElement.classList.remove('bali-await-content');
   document.getElementById('homeSection').hidden=false;
   document.body.dataset.baliPage='home';
   const track=document.getElementById('homeEventCarousel');
   track.replaceChildren();
   for(let i=0;i<5;i++){
     const card=document.createElement('article');
     card.className='bali-home-event-card';
     card.dataset.eventId='party-'+i;
     card.dataset.eventDate='2026-11-0'+(i+1);
     const poster=document.createElement('div');
     poster.className='bali-home-poster-wrap';
     const img=document.createElement('img');
     img.src='assets/bali-id-card-readable.svg';poster.append(img);
     const button=document.createElement('button');
     button.className='bali-home-open-event';
     button.textContent='Афиша '+i;
     card.append(poster,button);track.append(card);
   }
 });
 await expect.poll(()=>page.evaluate(()=>window.BaliHomeCarousel.getState().count)).toBe(5);
 await expect(page.locator('#homeEventCarousel')).toHaveAttribute('data-bali-coverflow','on');
}
test('Home carousel keeps all published cards and shows at most three at a time',async({page})=>{
 await sample(page);
 const state=async()=>page.locator('#homeEventCarousel').evaluate(track=>({
   visible:[...track.querySelectorAll('.bali-home-event-card')].map((n,i)=>({
     index:i,visible:getComputedStyle(n).visibility,active:n.classList.contains('is-home-active'),
     square:(()=>{const b=n.getBoundingClientRect();return b.width/b.height})()
   })).filter(n=>n.visible==='visible'),
   total:track.querySelectorAll('.bali-home-event-card').length
 }));
 let result=await state();
 expect(result.total).toBe(5);
 expect(result.visible.map(x=>x.index)).toEqual([0,1,2]);
 await page.evaluate(()=>window.BaliHomeCarousel.move(2));
 result=await state();
 expect(result.visible.map(x=>x.index)).toEqual([2,3,4]);
 expect(result.visible.filter(x=>x.active).map(x=>x.index)).toEqual([3]);
 for(const x of result.visible)expect(x.square).toBeCloseTo(1,1);
});
test('Desktop carousel arrows and wheel change active event while keeping it above neighbors',async({page})=>{
 test.skip(page.viewportSize().width<1180,'desktop carousel controls');
 await sample(page);
 const forward=page.locator('#homeEventCarousel .bali-home-coverflow-next');
 await expect(forward).toBeVisible();
 await forward.click();
 await expect.poll(()=>page.evaluate(()=>window.BaliHomeCarousel.getState().index)).toBe(2);
 const cards=await page.locator('#homeEventCarousel .bali-home-event-card').evaluateAll(nodes=>nodes.map(n=>({
   z:Number(getComputedStyle(n).zIndex),angle:n.style.getPropertyValue('--bali-home-turn'),
   visible:getComputedStyle(n).visibility
 })));
 expect(cards[1].z).toBeGreaterThan(cards[0].z);
 expect(cards[0].angle).toContain('45deg');
 expect(cards[2].angle).toContain('-45deg');
 const track=page.locator('#homeEventCarousel');
 const box=await track.boundingBox();
 await page.mouse.move(box.x+box.width*.5,box.y+box.height*.5);
 await page.mouse.wheel(0,450);
 await expect.poll(()=>page.evaluate(()=>window.BaliHomeCarousel.getState().index)).toBe(3);
});
test('Touch-size home carousel swipes while arrows stay out of view',async({page})=>{
 test.skip(page.viewportSize().width>=1180,'touch-size carousel');
 await sample(page);
 await expect(page.locator('#homeEventCarousel .bali-home-coverflow-arrow').first()).toBeHidden();
 await page.evaluate(()=>{
   const track=document.getElementById('homeEventCarousel');
   track.dispatchEvent(new PointerEvent('pointerdown',{bubbles:true,isPrimary:true,button:0,pointerId:48,clientX:240,clientY:200}));
   track.dispatchEvent(new PointerEvent('pointerup',{bubbles:true,isPrimary:true,button:0,pointerId:48,clientX:130,clientY:201}));
 });
 await expect.poll(()=>page.evaluate(()=>window.BaliHomeCarousel.getState().index)).toBe(2);
});
test('Reloading Home cards preserves the selected event by its real ID',async({page})=>{
 await sample(page);
 await page.evaluate(()=>{
   window.BaliHomeCarousel.move(2);
   const track=document.getElementById('homeEventCarousel');
   const copies=[...track.querySelectorAll('.bali-home-event-card')].map(n=>n.cloneNode(true));
   track.replaceChildren(...copies);
 });
 await expect.poll(()=>page.evaluate(()=>window.BaliHomeCarousel.getState().key)).toBe('party-3');
 await expect.poll(()=>page.evaluate(()=>window.BaliHomeCarousel.getState().index)).toBe(3);
});

test('Home automatically advances one hour after the end, including overnight parties',async({page})=>{
 await page.goto('/index.html');
 await page.evaluate(()=>{
   document.documentElement.classList.remove('bali-await-content');
   document.getElementById('homeSection').hidden=false;
   document.body.dataset.baliPage='home';
   Date.now=()=>Date.parse('2026-10-22T06:59:59+03:00');
   window.dispatchEvent(new CustomEvent('bali:events',{detail:{events:[
     {id:'overnight',date:'2026-10-21',title:'Вечеринка',startTime:'23:00',endTime:'06:00',poster_url:''},
     {id:'next',date:'2026-10-22',title:'Следующая',startTime:'18:00',endTime:'22:00',poster_url:''},
     {id:'later',date:'2026-10-23',title:'Позже',startTime:'18:00',endTime:'22:00',poster_url:''},
     {id:'last',date:'2026-10-24',title:'Последняя',startTime:'18:00',endTime:'22:00',poster_url:''}
   ]}}));
 });
 const realIds=()=>page.locator('#homeEventCarousel .bali-home-event-card[data-event-id]')
   .evaluateAll(cards=>cards.map(card=>card.dataset.eventId));
 expect((await realIds())[0]).toBe('overnight');
 await expect.poll(()=>page.evaluate(()=>window.BaliHomeCarousel.getState().key)).toBe('next');
 await page.evaluate(()=>{
   Date.now=()=>Date.parse('2026-10-22T07:00:00+03:00');
   window.dispatchEvent(new CustomEvent('bali:calendar:tick'));
 });
 await expect.poll(async()=>(await realIds())[0]).toBe('next');
 await expect.poll(()=>page.evaluate(()=>window.BaliHomeCarousel.getState().key)).toBe('later');
 const visible=await page.locator('#homeEventCarousel .bali-home-event-card').evaluateAll(
   cards=>cards.map((card,i)=>getComputedStyle(card).visibility==='visible'?i:null).filter(i=>i!==null)
 );
 expect(visible).toEqual([0,1,2]);
});
test('SECRET fills every unused visible homepage slot after event data arrives',async({page})=>{
 await page.goto('/index.html');
 await page.evaluate(()=>{
   document.documentElement.classList.remove('bali-await-content');
   document.getElementById('homeSection').hidden=false;
   document.body.dataset.baliPage='home';
   window.dispatchEvent(new CustomEvent('bali:events',{detail:{events:[
     {id:'far-event',date:'2099-12-30',title:'Будущее',startTime:'23:00',endTime:'06:00',poster_url:''}
   ]}}));
 });
 const data=await page.locator('#homeEventCarousel').evaluate(track=>({
   total:track.querySelectorAll('.bali-home-event-card').length,
   placeholders:track.querySelectorAll('.bali-home-event-placeholder').length,
   visibles:[...track.querySelectorAll('.bali-home-event-card')]
     .filter(card=>getComputedStyle(card).visibility==='visible').length,
   first:track.querySelector('.bali-home-event-card')?.dataset.eventId
 }));
 const desktop=page.viewportSize().width>=1180;
 expect(data.total).toBe(desktop?5:3);
 expect(data.placeholders).toBe(data.total-1);
 expect(data.visibles).toBe(3);
 expect(data.first).toBe('far-event');
 await expect(page.locator('#homeEventCarousel .bali-home-event-placeholder').first()).toContainText('SECRET');
});
