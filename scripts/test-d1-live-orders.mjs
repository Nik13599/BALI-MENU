import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
import {webcrypto} from "node:crypto";
import {DatabaseSync} from "node:sqlite";
globalThis.crypto??=webcrypto;
const sql=new DatabaseSync(":memory:");
for(const name of ["0001_preorders.sql","0002_staff_status.sql","0004_live_preorder_receipts.sql"])
 sql.exec(readFileSync("cloudflare-pages/d1/migrations/"+name,"utf8"));
sql.prepare("INSERT INTO migration_state(id,source,status,record_count,updated_at_ms) VALUES (?,?,?,?,?)")
 .run("preorders","test","complete",0,Date.now());
const db={
 prepare(statement){const stmt=sql.prepare(statement);
  const run=(args=[])=>({
   first:async()=>stmt.get(...args)||null,
   all:async()=>({results:stmt.all(...args)}),
   run:async()=>({meta:{changes:stmt.run(...args).changes}})
  });
  return {...run(),bind(...args){return run(args);}};
 },
 async batch(commands){sql.exec("BEGIN IMMEDIATE");try{
  const results=[];for(const cmd of commands)results.push(await cmd.run());
  sql.exec("COMMIT");return results;
 }catch(e){sql.exec("ROLLBACK");throw e;}}
};
const menu={name:"projects/demo/documents/menu/101",fields:{
 id:{integerValue:"101"},name:{stringValue:"Тестовое блюдо"},
 price:{integerValue:"19"},available:{booleanValue:true}}};
const event={name:"projects/demo/documents/events/2099-12-20",fields:{
 date:{stringValue:"2099-12-20"},title:{stringValue:"Тестовое мероприятие"},
 preorderEnabled:{booleanValue:true},closesAt:{timestampValue:"2099-12-21T03:00:00Z"}}};
const env={BALI_OPERATIONS_DB:db,BALI_PUBLIC_CONTENT:{async get(key){
 if(key.endsWith(":menu"))return {documents:[menu]};
 if(key.endsWith(":events"))return {documents:[event]};
 throw Error("Unexpected public KV key");
}}};
const src=readFileSync("cloudflare-pages/functions/_lib/d1-orders.js","utf8");
const marker='import {authorizeStaff,authorizeUser} from "./staff-auth.js";';
assert(src.includes(marker));
const stubs=[
 'const authorizeStaff=async r=>{if(r.headers.get("Authorization")!=="Bearer staff-test")throw Object.assign(Error("denied"),{status:403});return {uid:"staff_0001",role:"admin"};};',
 'const authorizeUser=async r=>{if(r.headers.get("Authorization")!=="Bearer user-test")throw Object.assign(Error("denied"),{status:401});return {uid:"user_0001",role:"guest"};};'
].join("\n");
const diagnostic=src.replace(marker,stubs).replace(" }catch(e){\n  if(e.status===401)",
 " }catch(e){console.error(\"D1 test backend error:\",e);\n  if(e.status===401)");
const {handleD1OrderAction}=await import("data:text/javascript;base64,"+
 Buffer.from(diagnostic).toString("base64"));
const request=new Request("https://baliminsk.by/api/bali-v3");
const call=(name,payload={},token="")=>handleD1OrderAction({action:name,payload,token},request,env);
const key=n=>n.toString(16).padStart(32,"0");
const guest=n=>({requestId:key(n),eventDate:"2099-12-20",eventId:"2099-12-20",
 customerName:"Гость BALI",customerPhone:"+375291234567",tableNumber:"12",
 items:[{id:101,quantity:2}],privacyConsent:true,internationalConsent:true,guestVerified:true});
let result=await call("guestCreateOrder",guest(1));
assert.equal(result.status,200,JSON.stringify(result));
assert.equal(result.data.order.orderNumber,1);
assert.equal(result.data.order.total,38);
const first=result.data.order;
result=await call("guestCreateOrder",guest(1));
assert.equal(result.status,200);
assert.equal(result.data.order.id,first.id);
result=await call("guestCreateOrder",{...guest(1),tableNumber:"99"});
assert.equal(result.status,409);
const bulk=await Promise.all(Array.from({length:24},(_,i)=>call("guestCreateOrder",guest(i+2))));
assert(bulk.every(v=>v.status===200),JSON.stringify(bulk.filter(v=>v.status!==200)));
assert.equal(new Set(bulk.map(v=>v.data.order.orderNumber)).size,24);
assert.equal(sql.prepare("SELECT COUNT(*) AS n FROM preorder_orders").get().n,25);
assert.equal(sql.prepare("SELECT COUNT(*) AS n FROM preorder_items").get().n,25);
assert.equal(sql.prepare("SELECT COUNT(*) AS n FROM preorder_request_receipts").get().n,25);
result=await call("staffRecentOrders",{},"staff-test");
assert.equal(result.status,200);
assert.equal(result.data.orders.length,25);
assert.equal(result.data.canEditOrders,true);
result=await call("staffRecentOrders",{},"unauthorized");
assert.equal(result.status,403);
result=await call("staffStatus",{id:first.id,status:"confirmed",requestId:key(250),expectedUpdatedAt:first.updatedAt},"staff-test");
assert.equal(result.status,200,JSON.stringify(result));
const updated=result.data.result.updatedAt;
result=await call("staffStatus",{id:first.id,status:"confirmed",requestId:key(250),expectedUpdatedAt:first.updatedAt},"staff-test");
assert.equal(result.status,200);
assert.equal(sql.prepare("SELECT COUNT(*) AS n FROM preorder_status_actions").get().n,1);
result=await call("staffEditOrder",{id:first.id,expectedUpdatedAt:updated,eventId:"2099-12-20",eventDate:"2099-12-20",
 customerName:"Гость изменён",customerPhone:"+375291234567",tableNumber:"12",items:[{id:101,quantity:1}],status:"confirmed"},"staff-test");
assert.equal(result.status,200,JSON.stringify(result));
assert.equal(result.data.order.total,19);
result=await call("staffCreateOrder",{...guest(251),status:"pending"},"staff-test");
assert.equal(result.status,200,JSON.stringify(result));
assert.equal(result.data.order.orderNumber,26);
result=await call("createOrder",guest(252),"user-test");
assert.equal(result.status,200,JSON.stringify(result));
const own=result.data.order;
result=await call("myOrders",{},"user-test");
assert.equal(result.status,200);
assert.deepEqual(result.data.orders.map(v=>v.id),[own.id]);
result=await call("cancelOrder",{id:own.id},"user-test");
assert.equal(result.status,200);
assert.equal(sql.prepare("SELECT status FROM preorder_orders WHERE id=?").get(own.id).status,"cancelled");
result=await call("createOrder",{...guest(253),items:[{id:101,quantity:3,price:0.01}]},"user-test");
assert.equal(result.status,200);
assert.equal(result.data.order.total,57);
const before=sql.prepare("SELECT COUNT(*) AS n FROM preorder_orders").get().n;
result=await call("guestCreateOrder",{...guest(254),eventId:"missing-event"});
assert.notEqual(result.status,200);
assert.equal(sql.prepare("SELECT COUNT(*) AS n FROM preorder_orders").get().n,before);
sql.prepare("UPDATE migration_state SET status='pending' WHERE id='preorders'").run();
result=await call("guestCreateOrder",guest(255));
assert.equal(result.status,503);
sql.close();
console.log("BALI D1 orders: 24 concurrent guests, atomic numbering, replays, Staff edits and status, account history, cancellation, backend guard PASS");
