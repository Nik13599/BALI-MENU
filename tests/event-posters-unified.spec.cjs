const {test,expect}=require("@playwright/test");

test.beforeEach(async({page})=>{
 await page.route("**/*",route=>new URL(route.request().url()).hostname==="127.0.0.1"
   ?route.continue():route.abort());
});

test("Home always shows square, caption-free event and SECRET tiles — three compact, five desktop",async({page})=>{
 await page.goto("/index.html");
 await page.evaluate(()=>{
   window.dispatchEvent(new CustomEvent("bali:events",{detail:{events:[]}}));
   window.BaliHomePlaceholder={
     posterTitle:"SECRET",kicker:"SECRET",footerTitle:"СКОРО В BALI",
     footerSubtitle:"Скоро",imageUrl:"",accentColor:"#b9ff51",backgroundColor:"#12171c"
   };
   renderHomeEvents();
 });
 const count=(page.viewportSize().width>=1180)?5:3;
 const tiles=page.locator("#homeEventCarousel>.bali-home-event-card");
 await expect(tiles).toHaveCount(count);
 await expect(page.locator("#homeEventCarousel>.bali-home-event-placeholder")).toHaveCount(count);
 for(const tile of await tiles.all()){
  const result=await tile.evaluate(el=>{
   const outer=el.getBoundingClientRect(),poster=el.querySelector(".bali-home-poster-wrap").getBoundingClientRect();
   return {outer:outer.width/outer.height,poster:poster.width/poster.height,
    caption:getComputedStyle(el.querySelector(".bali-home-event-info")).display,
    title:el.querySelector(".bali-home-placeholder-message")?.textContent,
    heart:!!el.querySelector(".bali-home-heart")};
  });
  expect(result.outer).toBeCloseTo(1,1);
  expect(result.poster).toBeCloseTo(1,1);
  expect(result.caption).toBe("none");
  expect(result.title).toBe("SECRET");
  expect(result.heart).toBe(false);
 }
});

test("Actual home event shows just a square poster and a small bare corner heart",async({page})=>{
 await page.goto("/index.html");
 await page.evaluate(()=>{
   window.dispatchEvent(new CustomEvent("bali:events",{detail:{events:[{
    id:"2099-10-30__2",date:"2099-10-30",title:"BALI TEST",
    description:"Подробное описание вечеринки",startTime:"23:00",endTime:"06:00",
    poster_url:"assets/bali-id-card-readable.svg",interestCount:0
   }]}}));
   renderHomeEvents();
 });
 const card=page.locator("#homeEventCarousel>.bali-home-event-card:not(.bali-home-event-placeholder)");
 await expect(card).toHaveCount(1);
 const state=await card.evaluate(el=>{
  const r=el.getBoundingClientRect(),poster=el.querySelector(".bali-home-poster-wrap").getBoundingClientRect();
  const heart=el.querySelector(".bali-home-heart"),h=heart.getBoundingClientRect(),hs=getComputedStyle(heart);
  return {ratio:r.width/r.height,posterRatio:poster.width/poster.height,
   caption:getComputedStyle(el.querySelector(".bali-home-event-info")).display,
   date:getComputedStyle(el.querySelector(".bali-home-date-badge")).display,
   background:hs.backgroundColor,border:hs.borderStyle,
   size:h.width,corner:Math.max(r.right-h.right,h.top-r.top)};
 });
 expect(state.ratio).toBeCloseTo(1,1);
 expect(state.posterRatio).toBeCloseTo(1,1);
 expect(state.caption).toBe("none");
 expect(state.date).toBe("none");
 expect(state.background).toBe("rgba(0, 0, 0, 0)");
 expect(state.border).toBe("none");
 expect(state.size).toBeLessThanOrEqual(26);
 expect(state.corner).toBeLessThanOrEqual(5);
});

test("Calendar image is square, surrounding metadata hidden, action buttons and detail dialog preserved",async({page})=>{
 await page.clock.setFixedTime(new Date('2099-10-30T12:00:00+03:00'));
 // This layout fixture supplies its own card, independently of backend errors.
 await page.route('**/menu-firestore.js*',route=>route.fulfill({contentType:'text/javascript',body:'export {};'}));
 await page.goto("/index.html");
 await page.evaluate(()=>{
  document.getElementById("eventsSection").hidden=false;
  document.body.dataset.baliPage="events";
  const grid=document.getElementById("eventsGrid");
  const card=document.createElement("article");card.className="event-card";
  card.dataset.eventDate="2099-10-30";card.dataset.eventId="2099-10-30__2";
  const poster=document.createElement("div");poster.className="bali-event-poster-wrap";
  const image=document.createElement("img");image.className="event-poster";
  image.src="assets/bali-id-card-readable.svg";poster.append(image);
  const date=document.createElement("time");date.className="bali-event-date-badge";date.textContent="30 ОКТ";poster.append(date);
  const body=document.createElement("div");body.className="event-card-body";
  const info=document.createElement("div");info.className="bali-event-info";
  info.innerHTML="<h3>Название события</h3><p class='bali-event-hours'>23:00–06:00</p><p class='bali-event-description'>Полный текст в модальном окне</p>";
  const actions=document.createElement("div");actions.className="bali-event-actions";
  const button=document.createElement("button");button.className="event-want-to-go";button.textContent="Хочу пойти";
  actions.append(button);body.append(info,actions);card.append(poster,body);grid.replaceChildren(card);
 });
 await expect.poll(()=>page.locator("#eventsGrid .bali-event-poster-wrap").evaluate(el=>el.hasAttribute("role"))).toBe(true);
 const geometry=await page.locator("#eventsGrid .event-card").evaluate(el=>{
  const image=el.querySelector(".bali-event-poster-wrap").getBoundingClientRect();
  const button=el.querySelector(".event-want-to-go");
  return {ratio:image.width/image.height,
   info:getComputedStyle(el.querySelector(".bali-event-info")).display,
   date:getComputedStyle(el.querySelector(".bali-event-date-badge")).display,
   button:getComputedStyle(button).display};
 });
 expect(geometry.ratio).toBeCloseTo(1,1);
 expect(geometry.info).toBe("none");
 expect(geometry.date).toBe("none");
 expect(geometry.button).not.toBe("none");
 await page.locator("#eventsGrid .bali-event-poster-wrap").evaluate(el=>el.click());
 await expect(page.locator("#baliEventDetailDialog")).toHaveJSProperty("open",true);
 await expect(page.locator("#baliEventDetailDescription")).toHaveText("Полный текст в модальном окне");
});

test("Administrator previews 1:1 for event artwork and editable SECRET placeholders",async({page})=>{
 await page.goto("/admin.html");
 const state=await page.evaluate(()=>{
  document.getElementById("adminView").hidden=false;
  const workspace=document.querySelector('[data-admin-panel="events"]');
  if(workspace)workspace.hidden=false;
  const poster=document.getElementById("eventPosterPreview");
  poster.hidden=false;
  const secret=document.getElementById("baliPlaceholderAdminPreview");
  const a=poster.getBoundingClientRect(),b=secret.getBoundingClientRect();
  return {poster:a.width/a.height,secret:b.width/b.height,
   legacyInputs:secret.closest("#baliEventPlaceholderEditor").querySelector(".bali-placeholder-legacy-fields")?.hidden,
   legacyFooter:getComputedStyle(document.getElementById("baliPlaceholderPreviewFooter")).display};
 });
 expect(state.poster).toBeCloseTo(1,1);
 expect(state.secret).toBeCloseTo(1,1);
 expect(state.legacyInputs).toBe(true);
 expect(state.legacyFooter).toBe("none");
});

test("Tablet uses mobile-style Home composition and footer navigation",async({page})=>{
 test.skip(page.viewportSize().width<768||page.viewportSize().width>=1180,"Tablet viewport only");
 await page.goto("/index.html");
 const state=await page.evaluate(()=>{
  const mobile=document.querySelector(".bali-mobile-home-hero");
  const nav=document.querySelector(".bali-bottom-nav");
  const sidebar=document.querySelector(".bali-pc-sidebar");
  return {hero:getComputedStyle(mobile).display,nav:getComputedStyle(nav).display,
    pcSidebar:getComputedStyle(sidebar).display};
 });
 expect(state.hero).not.toBe("none");
 expect(state.nav).not.toBe("none");
 expect(state.pcSidebar).toBe("none");
});

test("Home poster opens the event description instead of placing text on the image",async({page})=>{
 await page.goto("/index.html");
 await page.evaluate(()=>{
   window.dispatchEvent(new CustomEvent("bali:events",{detail:{events:[{
     id:"2026-10-30__2",date:"2026-10-30",title:"BALI POSTER DETAIL",
     description:"Полное описание отображается только после нажатия на афишу.",
     startTime:"23:00",endTime:"06:00",poster_url:"assets/bali-id-card-readable.svg"
   }]}}));
   renderHomeEvents();
 });
 await expect(page.locator("#homeEventCarousel .bali-home-open-event")).toHaveCount(1);
 await page.locator("#homeEventCarousel .bali-home-open-event").first().evaluate(el=>el.click());
 await expect(page.locator("#baliEventDetailDialog")).toHaveJSProperty("open",true,{timeout:7000});
 await expect(page.locator("#baliEventDetailDescription"))
   .toHaveText("Полное описание отображается только после нажатия на афишу.");
});
