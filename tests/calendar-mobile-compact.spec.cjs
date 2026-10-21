const {test,expect}=require("@playwright/test");

// Local-only browser fixtures; the tests never read production Firestore.
test.beforeEach(async({page})=>{
  await page.route("**/*",route=>new URL(route.request().url()).hostname==="127.0.0.1"
    ?route.continue():route.abort());
});

async function openCalendar(page){
  await page.goto("/index.html#events");
  await page.evaluate(()=>{
    document.getElementById("eventsSection").hidden=false;
    document.body.dataset.baliPage="events";
  });
  await expect(page.locator("#baliCalendarPanel")).toBeVisible();
  await expect.poll(()=>page.evaluate(()=>window.BaliCalendarShowcase?.mode)).toBe("stage");
}

test("phone shows every day in a six-week month with compact cells",async({page})=>{
  test.skip(page.viewportSize().width>767,"mobile-specific layout");
  await openCalendar(page);
  const dates=page.locator("#baliCalendarDays .bali-calendar-day");
  let found=false;
  for(let i=0;i<15;i++){
    const count=await dates.count();
    if(count===42){found=true;break;}
    await page.locator("#baliCalendarNext").click();
  }
  expect(found,"A month with all six calendar weeks").toBe(true);
  const state=await page.evaluate(()=>{
    const panel=document.getElementById("baliCalendarPanel").getBoundingClientRect();
    const days=[...document.querySelectorAll("#baliCalendarDays .bali-calendar-day")];
    const rects=days.map(d=>d.getBoundingClientRect());
    const grid=document.getElementById("baliCalendarDays").getBoundingClientRect();
    const stage=document.getElementById("eventsCarouselShell").getBoundingClientRect();
    return {count:days.length,height:rects[0].height,
      allVisible:days.every(d=>getComputedStyle(d).visibility!=="hidden"),
      lastBottom:Math.max(...rects.map(r=>r.bottom)),
      gridBottom:grid.bottom,panelBottom:panel.bottom,stageTop:stage.top,
      panelHeight:panel.height,stageHeight:stage.height};
  });
  expect(state.count).toBe(42);
  expect(state.allVisible).toBe(true);
  expect(state.height).toBeGreaterThanOrEqual(23);
  expect(state.height).toBeLessThanOrEqual(27.5);
  expect(state.lastBottom).toBeLessThanOrEqual(state.gridBottom+1);
  expect(state.gridBottom).toBeLessThanOrEqual(state.panelBottom+1);
  expect(state.panelBottom).toBeLessThan(state.stageTop+1);
  expect(state.stageHeight).toBeGreaterThan(125);
});

test("larger phone posters leave the existing action buttons at stage bottom",async({page})=>{
  test.skip(page.viewportSize().width>767,"mobile-specific layout");
  await page.clock.setFixedTime(new Date("2026-11-10T12:00:00+03:00"));
  await openCalendar(page);
  // Feed the real store so the new initial poster/date synchronization can
  // re-render a calendar range without discarding handcrafted DOM cards.
  await page.evaluate(()=>window.dispatchEvent(new CustomEvent("bali:events",{detail:{events:
    Array.from({length:3},(_,i)=>({id:"2026-11-"+(10+i),date:"2026-11-"+(10+i),
      title:"Тест мероприятия",startTime:"23:00",endTime:"06:00",poster_url:"assets/bali-id-card-readable.svg"}))
  }})));
  await expect(page.locator("#eventsGrid .event-card")).toHaveCount(3);
  await expect.poll(()=>page.evaluate(()=>getComputedStyle(document.getElementById("eventsGrid"))
    .getPropertyValue("--bali-event-slide-width").trim())).not.toBe("");
  const positions=await page.evaluate(()=>{
    const grid=document.getElementById("eventsGrid").getBoundingClientRect();
    const card=document.querySelector("#eventsGrid .event-card.is-active");
    const poster=card.querySelector(".bali-event-poster-wrap").getBoundingClientRect();
    const actions=card.querySelector(".bali-event-actions").getBoundingClientRect();
    const buttons=[...card.querySelectorAll(".bali-event-actions button")];
    return{grid:{w:grid.width,h:grid.height,bottom:grid.bottom},
      poster:{w:poster.width,h:poster.height,bottom:poster.bottom},
      actions:{top:actions.top,bottom:actions.bottom},
      labels:buttons.map(b=>b.textContent.trim()),
      actualWidth:parseFloat(document.getElementById("eventsGrid")
        .style.getPropertyValue("--bali-event-slide-width"))};
  });
  // The current layout also reserves equal gaps around the poster and actions.
  expect(positions.actualWidth).toBeGreaterThanOrEqual(100);
  expect(positions.actualWidth).toBeLessThanOrEqual(Math.min(390,positions.grid.w*.88));
  expect(positions.poster.w).toBeCloseTo(positions.actualWidth,0);
  expect(positions.poster.w/positions.poster.h).toBeCloseTo(1,1);
  expect(positions.actions.top).toBeGreaterThanOrEqual(positions.poster.bottom-2);
  expect(positions.actions.bottom).toBeLessThanOrEqual(positions.grid.bottom+2);
  expect(positions.grid.bottom-positions.actions.bottom).toBeLessThan(positions.grid.h/4);
  expect(positions.labels).toEqual(["Хочу пойти","Поделиться"]);
});
