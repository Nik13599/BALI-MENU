import assert from "node:assert/strict";
import {readFile} from "node:fs/promises";
import {pathToFileURL} from "node:url";
const load=async file=>readFile(file,"utf8");
const metrics=await import(pathToFileURL(process.cwd()+"/bali-preorder-metrics.js"));
const {filterBaliPreorders,sumBaliPreorders,dashboardBaliPreorders}=metrics;
const rows=[
 {id:"f1",eventDate:"2099-10-24",eventId:"2099-10-24",status:"pending",
  items:[{id:1,name:"Закуска",quantity:2,unitPrice:10.15}]},
 {id:"f2",eventDate:"2099-10-24",eventId:"2099-10-24__2",status:"confirmed",
  items:[{id:1,name:"Закуска",quantity:3,unitPrice:10.15},{id:2,name:"Суп",quantity:1,unitPrice:8.22}]},
 {id:"G-ABCDEF12",eventDate:"2099-10-24",eventId:"2099-10-24__2",status:"pending",
  source:"guest-kv",email:"",items:[{id:2,name:"Суп",quantity:2,unitPrice:8.22}]},
 {id:"c3",eventDate:"2099-10-24",eventId:"2099-10-24__2",status:"cancelled",
  items:[{id:1,name:"Закуска",quantity:4,unitPrice:10.15}]},
 {id:"a4",eventDate:"2099-10-25",eventId:"2099-10-25",status:"confirmed",archived:true,
  items:[{id:2,name:"Суп",quantity:8,unitPrice:8.22}]}
];
const all=filterBaliPreorders([...rows,rows[0]],{archive:true});
assert.equal(all.length,5,"All rows deduplicate by stable order reference");
assert.equal(sumBaliPreorders(all).amountMinor,18177);
assert.equal(sumBaliPreorders(all).portions,20);
const date=filterBaliPreorders(rows,{date:"2099-10-24"});
assert.equal(date.length,4,"Date includes both same-date events plus guest");
const event=filterBaliPreorders(rows,{date:"2099-10-24",eventId:"2099-10-24__2"});
assert.equal(event.length,3,"Event filter must not include other events that same day");
const kitchen=sumBaliPreorders(event,{kitchen:true});
assert.equal(kitchen.count,2,"Cancelled order excluded from kitchen");
assert.equal(kitchen.portions,6);
assert.equal(kitchen.amountMinor,5511);
assert.equal(kitchen.dishes.find(x=>x.id===2).quantity,3);
const visible=filterBaliPreorders(rows,{archive:false});
const dash=dashboardBaliPreorders(visible);
assert.deepEqual({all:dash.count,pending:dash.pending,confirmed:dash.confirmed,cancelled:dash.cancelled},
 {all:4,pending:2,confirmed:1,cancelled:1});
const reportSource=await load("bali-preorder-reports.js");
assert(reportSource.includes('from "./bali-preorder-metrics.js"'));
const privacy=await load("cloudflare-pages/functions/api/guest-preorders.js");
assert(!privacy.includes("firestore.googleapis.com"));
assert(!privacy.includes("BALI_OPERATIONS_DB"));
assert(privacy.includes("siteVerify(token,env.BALI_GUEST_TURNSTILE_SECRET"));
assert(privacy.includes('source:"guest-kv"'));
const html=await load("index.html"),app=await load("app.js");
assert(html.includes("baliGuestTurnstile")&&html.includes('value="guest"')&&
  html.includes('id="customerPhone"')&&html.includes("baliGuestPrivacyAccepted"));
assert(app.includes("const result=guest")&&app.includes("guestCheckout())"));
assert(!html.includes('<script type="module" src="orders-firestore.js'));
const staff=await load("preorders.html"),admin=await load("admin-orders.js");
assert(staff.includes("baliScopeOrdersPdf")&&staff.includes("baliScopeDishesTelegram")&&
  staff.includes("bali-staff-guest-inbox.js"));
assert(admin.includes('...guestMatching.filter(')&&admin.includes("exportScopedReport(kind,format)")&&
  admin.includes("where(\"createdAt\",\">=\",Timestamp.fromMillis"));
console.log("BALI guest + Firestore totals: all/date/event, archive, cancellation, portions, BYN, private-only delivery PASS.");
