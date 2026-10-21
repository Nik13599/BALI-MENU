const {test,expect}=require("@playwright/test");
test.beforeEach(async({page})=>page.route("**/*",r=>new URL(r.request().url()).hostname==="127.0.0.1"?r.continue():r.abort()));
test("Minsk start/end and overnight 23:00–06:00 are accurate",async({page})=>{
 await page.goto("/index.html#events");
 const value=await page.evaluate(()=>{
  const {state,homeVisible,monthRange}=window.BaliEventLifecycle;
  const at=s=>Date.parse(s);
  const d={date:"2026-10-21",startTime:"18:00",endTime:"22:00"};
  const n={date:"2026-10-21",startTime:"23:00",endTime:"06:00"};
  return {
   range:monthRange(2026,10),
   before:state(d,at("2026-10-21T17:59:59+03:00")),
   start:state(d,at("2026-10-21T18:00:00+03:00")),
   end:state(d,at("2026-10-21T22:00:00+03:00")),
   overnight:state(n,at("2026-10-22T05:59:59+03:00")),
   overnightEnd:state(n,at("2026-10-22T06:00:00+03:00")),
   homeStillVisible:homeVisible(n,at("2026-10-22T06:59:59+03:00")),
   homeExpired:homeVisible(n,at("2026-10-22T07:00:00+03:00")),
   sameDayStillVisible:homeVisible(d,at("2026-10-21T22:59:59+03:00")),
   sameDayExpired:homeVisible(d,at("2026-10-21T23:00:00+03:00"))
  };
 });
 expect(value.range.start).toBe("2026-09-28");
 expect(value.range.end).toBe("2026-11-01");
 expect(value.before).toBe("upcoming");
 expect(value.start).toBe("live");
 expect(value.end).toBe("past");
 expect(value.overnight).toBe("live");
 expect(value.overnightEnd).toBe("past");
 expect(value.homeStillVisible).toBe(true);
 expect(value.homeExpired).toBe(false);
 expect(value.sameDayStillVisible).toBe(true);
 expect(value.sameDayExpired).toBe(false);
});
test("same date preserves event statuses and shows two solid dots without status sectors",async({page})=>{
 await page.goto("/index.html#events");
 await page.evaluate(()=>{
  document.getElementById("eventsSection").hidden=false;
  document.body.dataset.baliPage="events";
  const day=window.BaliEventLifecycle.nowDate();
  const events=[
   {id:day,date:day,title:"Идёт",startTime:"00:00",endTime:"23:58"},
   {id:day+"__2",date:day,title:"Скоро",startTime:"23:59",endTime:"23:00"}
  ];
  window.dispatchEvent(new CustomEvent("bali:events",{detail:{events}}));
 });
 const today=await page.evaluate(()=>window.BaliEventLifecycle.nowDate());
 const day=page.locator('#baliCalendarDays .bali-calendar-day[data-date="'+today+'"]');
 await expect(day).toHaveAttribute("data-event-count","2");
 await expect(day).toHaveAttribute("data-live","true");
 await expect(day.locator(".bali-calendar-event-dot")).toHaveCount(2);
 const state=await day.evaluate(el=>({
  statuses:[...el.querySelectorAll(".bali-calendar-event-dot")].map(x=>x.dataset.status),
  fill:getComputedStyle(el).backgroundImage
 }));
 expect(state.statuses).toEqual(["live","upcoming"]);
 expect(state.fill).toBe("none");
});
test("expired dates show a passive notice while future events have share + heart icons",async({page})=>{
 await page.goto("/index.html#events");
 await page.evaluate(()=>{
  document.getElementById("eventsSection").hidden=false;
  document.body.dataset.baliPage="events";
  const day=window.BaliEventLifecycle.nowDate();
  const next=new Date(Date.parse(day+"T12:00:00Z")+86400000).toISOString().slice(0,10);
  window.dispatchEvent(new CustomEvent("bali:events",{detail:{events:[
   {id:day,date:day,title:"Прошло",startTime:"00:00",endTime:"00:01",poster_url:""},
   {id:next,date:next,title:"Скоро",startTime:"18:00",endTime:"23:00",poster_url:""}
  ]}}));
 });
 const past=page.locator('#eventsGrid .event-card[data-event-status="past"]');
 await expect(past).toHaveCount(1);
 await expect(past.locator(".bali-event-ended")).toHaveText("Мероприятие прошло");
 await expect(past.locator(".bali-event-actions button")).toHaveCount(0);
 const upcoming=page.locator('#eventsGrid .event-card[data-event-status="upcoming"]');
 await expect(upcoming.locator(".event-want-to-go svg.bali-event-action-icon")).toHaveCount(1);
 await expect(upcoming.locator(".bali-share-trigger svg.bali-share-plane")).toHaveCount(1);
});