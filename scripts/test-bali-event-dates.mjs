import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
import vm from "node:vm";

const admin=readFileSync("admin-firestore.js","utf8");
const guest=readFileSync("app.js","utf8");
const staff=readFileSync("admin-orders.js","utf8");
const dateHelpers=admin.slice(admin.indexOf("const adminTodayMinsk="),admin.indexOf("function eventRender()"));
assert.ok(dateHelpers.startsWith("const adminTodayMinsk="),"Missing admin date classification");
const classify=vm.runInNewContext(dateHelpers+"\n({adminTodayMinsk,adminDateState,adminReadableDate})",{
  Intl,Date
});
const today=classify.adminTodayMinsk();
assert.match(today,/^\d{4}-\d{2}-\d{2}$/);
const shifted=days=>new Date(Date.parse(today+"T12:00:00Z")+days*86400000).toISOString().slice(0,10);
const past=shifted(-1),future=shifted(1);
assert.equal(classify.adminDateState(past,today),"past");
assert.equal(classify.adminDateState(today,today),"today");
assert.equal(classify.adminDateState(future,today),"upcoming");
assert.match(classify.adminReadableDate(today),/^\d{2}\.\d{2}\.\d{4}$/);
assert.ok(admin.includes('row.classList.add("bali-admin-event-row"'));

// Both the guest selector and staff shortcuts have to make the exact same
// eligibility decision: enabled, local event date not past, and cutoff open.
const cutoff=offset=>new Date(Date.now()+offset*3600000);
const examples=[
  {id:"today-open",date:today,preorderEnabled:true,closesAt:cutoff(2)},
  {id:"future-open",date:future,preorderEnabled:true,closesAt:cutoff(48)},
  {id:"yesterday-still-open",date:past,preorderEnabled:true,closesAt:cutoff(2)},
  {id:"today-expired",date:today,preorderEnabled:true,closesAt:cutoff(-2)},
  {id:"future-disabled",date:future,preorderEnabled:false,closesAt:cutoff(48)}
];
const guestEvents=examples.map(event=>({...event,closesAt:{
  toDate:()=>event.closesAt
}}));
const guestFn=guest.slice(guest.indexOf("function availablePreorderEvents()"),
  guest.indexOf("function populateEventNames("));
assert.ok(guestFn.startsWith("function availablePreorderEvents()"));
const guestIds=vm.runInNewContext(
  guestFn+"\navailablePreorderEvents().map(event=>event.id)",{
    Date,minskDateToday:()=>today,availableEvents:guestEvents,
    checkoutCalendarEvents:null,
    document:{getElementById:()=>({classList:{contains:()=>false}})}
  });
assert.deepEqual(Array.from(guestIds),["today-open","future-open"]);
const staffHelpers=staff.slice(staff.indexOf("const activeCalendarEvent="),
  staff.indexOf("const calendarValue="));
assert.ok(staffHelpers.startsWith("const activeCalendarEvent="));
const staffAllowed=vm.runInNewContext(staffHelpers+"\n[...events.values()].filter(activeCalendarEvent).map(event=>event.id)",{
  Date,minskToday:()=>today,
  events:new Map(examples.map(event=>[event.id,{
    ...event,closesAt:event.closesAt.toISOString()
  }])),
  calendarSourceLoaded:true
});
assert.deepEqual(Array.from(staffAllowed),["today-open","future-open"]);
assert.match(readFileSync("preorders-workspace.css","utf8"),
  /ordersDateFilter\[data-date-state="today"\]/);
assert.ok(readFileSync("admin.html","utf8").includes("bali-calendar-date-status-20261023"));
assert.ok(readFileSync("index.html","utf8").includes("bali-calendar-date-status-20261023"));
console.log("BALI admin dates, guest eligible events and staff date colors PASS");
