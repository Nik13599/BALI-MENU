import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
import {DatabaseSync} from "node:sqlite";
const dataURI=text=>"data:text/javascript;base64,"+Buffer.from(text).toString("base64");
const source=file=>readFileSync(file,"utf8");
const db=new DatabaseSync(":memory:");
db.exec(source("cloudflare-pages/d1/migrations/0001_preorders.sql"));
db.exec(source("cloudflare-pages/d1/migrations/0002_staff_status.sql"));
db.exec(source("cloudflare-pages/d1/migrations/0004_live_preorder_receipts.sql"));
const wrap={
 prepare(sql){
  const stmt=db.prepare(sql);
  const result=(args=[])=>({
    first:async()=>stmt.get(...args)||null,
    all:async()=>({results:stmt.all(...args)}),
    run:async()=>({meta:{changes:stmt.run(...args).changes}})
  });
  return {...result(),bind(...args){return result(args)}};
 },
 async batch(statements){
  db.exec("BEGIN IMMEDIATE");
  try{
    const results=[];
    for(const stmt of statements)results.push(await stmt.run());
    db.exec("COMMIT");return results;
  }catch(e){db.exec("ROLLBACK");throw e;}
 }
};
db.prepare("INSERT INTO migration_state (id,source,status,record_count,updated_at_ms) VALUES (?,?,?,?,?)")
 .run("preorders","test-fixture","complete",0,Date.now());
const orderModule=dataURI(source("cloudflare-pages/functions/_lib/d1-preorders.js"));
const authModule=dataURI(`
export const authorizeStaff=async (request,options={})=>{
  const token=request.headers.get("Authorization");
  if(token!=="Bearer "+ "T".repeat(128))throw Object.assign(Error("unauthorized"),{status:403});
  if(options.adminOnly)throw Object.assign(Error("Staff must not have owner rights"),{status:403});
  return {uid:"valid_staff_uid",role:"staff"};
};
export const authorizeUser=async request=>{
 const token=request.headers.get("Authorization");
 if(token!=="Bearer "+ "T".repeat(128))throw Object.assign(Error("unauthorized"),{status:401});
 return {uid:"valid_admin_uid",role:"guest"};
};
export const errorJson=(status,error)=>new Response(JSON.stringify({error}),{status});
export const handlerError=e=>errorJson(e.status||503,e.message);
`);
const statusSource=source("cloudflare-pages/functions/api/staff-preorder-status.js")
 .replace('from "../_lib/staff-auth.js"','from "'+authModule+'"');
const statusModule=dataURI(statusSource);
// Only push delivery is mocked here; order SQL and authorizations remain real.
globalThis.__baliPushTestCount=0;
const pushModule=dataURI("export async function notifyNewStaffOrder(){globalThis.__baliPushTestCount++}");
const staffSource=source("cloudflare-pages/functions/api/d1-preorders.js")
 .replace('from "../_lib/staff-auth.js"','from "'+authModule+'"')
 .replace('from "../_lib/d1-preorders.js"','from "'+orderModule+'"')
 .replace('from "./staff-preorder-status.js"','from "'+statusModule+'"')
 .replace('await import("../_lib/staff-web-push.js")','await import("'+pushModule+'")');
const staff=await import(dataURI(staffSource));
const ordersModule=dataURI(source("cloudflare-pages/functions/_lib/d1-orders.js")
 .replace('from "./staff-auth.js"','from "'+authModule+'"'));
const guest=await import(dataURI(source("cloudflare-pages/functions/api/bali-v3.js")
 .replace('await import("../_lib/d1-orders.js")','await import("'+ordersModule+'")')
 .replace('await import("../_lib/staff-web-push.js")','await import("'+pushModule+'")')));
const menu=[{name:"projects/demo/documents/menu/101",fields:{
  name:{stringValue:"Салат"},available:{booleanValue:true},
  price:{integerValue:"25"},id:{integerValue:"101"}
 }}];
const events=[{name:"projects/demo/documents/events/2099-10-23",fields:{
  date:{stringValue:"2099-10-23"},title:{stringValue:"NIGHT PARTY"},
  preorderEnabled:{booleanValue:true},closesAt:{timestampValue:"2099-10-23T20:00:00Z"}
 }}];
const kv={async get(key){
 if(key.endsWith(":events"))return {documents:events};
 if(key.endsWith(":menu"))return {documents:menu};
 throw Error("Unknown KV source");
}};
const env={BALI_OPERATIONS_DB:wrap,BALI_PUBLIC_CONTENT:kv,
 BALI_GUEST_TURNSTILE_SECRET:"test-secret"};
const base="https://baliminsk.by";
const customer={customerName:"Тестовый Гость",customerPhone:"+375291234567",
 tableNumber:"12",bookingId:"",notes:"",eventDate:"2099-10-23",
 eventId:"2099-10-23",items:[{id:101,quantity:2}]};
let googleSheetsRequests=0;
globalThis.fetch=async (url,options)=>{
 if(String(url).includes("/turnstile/v0/siteverify")){
  assert(String(options.body).includes("test-secret"));
  return new Response(JSON.stringify({success:true,hostname:"baliminsk.by",action:"guest_preorder"}));
 }
 googleSheetsRequests++;
 throw Error("Legacy upstream must not be contacted");
};
const postGuest=async requestId=>{
 const request=new Request(base+"/api/bali-v3",{
  method:"POST",headers:{"Origin":base,"Content-Type":"application/json"},
  body:JSON.stringify({action:"guestCreateOrder",token:"",
   turnstileToken:"valid-test-challenge-token",
   payload:{...customer,requestId,privacyConsent:true,internationalConsent:true}})
 });
 const r=await guest.onRequestPost({request,env});
 return {status:r.status,body:await r.json()};
};
let g=await postGuest("a".repeat(32));
assert.equal(g.status,200,JSON.stringify(g));
assert.equal(g.body.data.order.orderNumber,1);
assert.equal(g.body.data.order.total,50);
g=await postGuest("a".repeat(32));
assert.equal(g.status,200,"Same stable retry ID must be idempotent");
assert.equal(g.body.data.order.orderNumber,1);
g=await postGuest("b".repeat(32));
assert.equal(g.status,200);assert.equal(g.body.data.order.orderNumber,2);
assert.equal(googleSheetsRequests,0,"No Sheets requests after D1 cutover");
const adminRequest=(action,payload={})=>new Request(base+"/api/d1-preorders",{
 method:"POST",headers:{"Origin":base,"Content-Type":"application/json"},
 body:JSON.stringify({action,payload,token:"T".repeat(128)})
});
const run=async(action,payload)=>{
 const res=await staff.onRequestPost({request:adminRequest(action,payload),env});
 return {status:res.status,body:await res.json()};
};
let staffResult=await run("staffRecentOrders");
assert.equal(staffResult.status,200,JSON.stringify(staffResult));
assert.equal(staffResult.body.data.orders.length,2);
assert.equal(staffResult.body.data.canEditOrders,true);
let order=staffResult.body.data.orders.find(x=>x.id==="o_"+"a".repeat(32));
assert.equal(order.items.length,1);assert.equal(order.total,50);
let status=await run("staffStatus",{id:order.id,status:"confirmed",
 requestId:"c".repeat(32),expectedUpdatedAt:order.updatedAt});
assert.equal(status.status,200,JSON.stringify(status));
assert.equal(status.body.data.result.status,"confirmed");
let repeated=await run("staffStatus",{id:order.id,status:"confirmed",
 requestId:"c".repeat(32),expectedUpdatedAt:order.updatedAt});
assert.equal(repeated.status,200);
assert.equal(repeated.body.data.result.alreadyApplied,true);
let edit=await run("staffEditOrder",{
 id:order.id,expectedUpdatedAt:status.body.data.result.updatedAt,
 ...customer,status:"confirmed",customerName:"Обновлённый Гость",
 items:[{id:101,quantity:3}]
});
assert.equal(edit.status,200,JSON.stringify(edit));
assert.equal(edit.body.data.order.total,75);
assert.equal(edit.body.data.order.items[0].quantity,3);
let stale=await run("staffEditOrder",{
 id:order.id,expectedUpdatedAt:order.updatedAt,
 ...customer,status:"confirmed",items:[{id:101,quantity:2}]
});
assert.equal(stale.status,409,"Old edits must be rejected");
let created=await run("staffCreateOrder",{
 ...customer,requestId:"d".repeat(32),status:"pending"
});
assert.equal(created.status,200,JSON.stringify(created));
assert.equal(created.body.data.order.orderNumber,3);
const all=await run("staffOrders",{date:"2099-10-23"});
assert.equal(all.status,200);
assert.equal(all.body.data.orders.length,3);
const numbers=all.body.data.orders.map(x=>x.orderNumber).sort();
assert.deepEqual(numbers,[1,2,3]);
const sums=all.body.data.orders.map(x=>x.total).sort((a,b)=>a-b);
assert.deepEqual(sums,[50,50,75]);
// A plain employee may permanently delete a specific order after explicit
// confirmation. The stale version must not erase a newer edit.
const other=all.body.data.orders.find(x=>x.id==="o_"+"b".repeat(32));
assert(other);
let staleDelete=await run("staffDeleteOrder",{
  id:other.id,expectedUpdatedAt:"2001-01-01T00:00:00.000Z"
});
assert.equal(staleDelete.status,409,"Never delete a newer version");
assert(db.prepare("SELECT id FROM preorder_orders WHERE id=?").get(other.id));
const removed=await run("staffDeleteOrder",{
  id:other.id,expectedUpdatedAt:other.updatedAt
});
assert.equal(removed.status,200,JSON.stringify(removed));
assert.equal(removed.body.data.deleted,other.id);
assert.equal(db.prepare("SELECT id FROM preorder_orders WHERE id=?").get(other.id),undefined);
assert.equal(db.prepare("SELECT COUNT(*) AS n FROM preorder_items WHERE order_id=?").get(other.id).n,0);
assert.equal(db.prepare("SELECT action FROM preorder_audit ORDER BY id DESC LIMIT 1").get().action,"staff-delete");
// The legacy-compatible shared /api/bali-v3 Staff gateway must obey the same
// role, id and version contract, without elevating the Staff role to admin.
const sharedDelete=async(id,expectedUpdatedAt)=>{
  const request=new Request(base+"/api/bali-v3",{
    method:"POST",headers:{"Origin":base,"Content-Type":"application/json"},
    body:JSON.stringify({action:"staffDeleteOrder",token:"T".repeat(128),
      payload:{id,expectedUpdatedAt}})
  });
  const response=await guest.onRequestPost({request,env});
  return {status:response.status,body:await response.json()};
};
const latest=all.body.data.orders.find(x=>x.id==="o_"+"d".repeat(32));
assert(latest);
assert.equal((await sharedDelete(latest.id,"2001-01-01T00:00:00.000Z")).status,409);
const sharedResult=await sharedDelete(latest.id,latest.updatedAt);
assert.equal(sharedResult.status,200,JSON.stringify(sharedResult));
assert.equal(sharedResult.body.data.deleted,latest.id);
assert.equal(db.prepare("SELECT COUNT(*) AS n FROM preorder_orders WHERE id=?").get(latest.id).n,0);
assert.equal(db.prepare("SELECT COUNT(*) AS n FROM preorder_items WHERE order_id=?").get(latest.id).n,0);
const auditCount=db.prepare("SELECT COUNT(*) AS n FROM preorder_audit").get().n;
assert(auditCount>=6);
db.close();
console.log("BALI D1 live orders: Turnstile, guest create, retries, shared Staff queue, serials, optimistic edits, Staff-only permanent deletion and status replay PASS");
