/* BALI migration gates, real SQLite, fake verified identity and fake upstream.
 * No cloud accounts, credentials or guest records are contacted.
 */
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
import {DatabaseSync} from "node:sqlite";
const db=new DatabaseSync(":memory:");
for(const file of ["0001_preorders.sql","0002_staff_status.sql","0003_unified_staging.sql"])
 db.exec(readFileSync("cloudflare-pages/d1/migrations/"+file,"utf8"));
const wrap={
 prepare(sql){const stmt=db.prepare(sql);return {
  bind(...args){return {
   first:async()=>stmt.get(...args)||null,
   all:async()=>({results:stmt.all(...args)}),
   run:async()=>({meta:{changes:stmt.run(...args).changes}})
  }}
 }},
 async batch(actions){
  db.exec("BEGIN IMMEDIATE");
  try{const results=[];for(const q of actions)results.push(await q.run());
   db.exec("COMMIT");return results;
  }catch(e){db.exec("ROLLBACK");throw e;}
 }
};
const auth=`
 const errorJson=(status,error)=>new Response(JSON.stringify({error}),{
   status,headers:{"Content-Type":"application/json"}
 });
 const authorizeStaff=async (request,{adminOnly=false}={})=>{
   if(request.headers.get("Authorization")!=="Bearer verified-owner")throw Object.assign(
     Error("forbidden"),{status:403});
   if(!adminOnly)throw Error("owner role is required");
   return {uid:"owner_UID",role:"admin"};
 };
 const handlerError=e=>errorJson(e.status===403?403:503,e.status===403?"access-denied":"service-unavailable");
`;
const load=async path=>{
 let src=readFileSync(path,"utf8");
 const marker=/^import \{authorizeStaff,handlerError,errorJson\} from "\.\.\/\.\.\/_lib\/staff-auth\.js";/m;
 assert.match(src,marker);
 src=src.replace(marker,auth);
 return import("data:text/javascript;base64,"+Buffer.from(src).toString("base64"));
};
const route=await load("cloudflare-pages/functions/api/admin/migrate-sheets-preorders.js");
const audit=await load("cloudflare-pages/functions/api/admin/unified-migration-audit.js");
let upstreamRows=[];
let upstreamCalls=0;
globalThis.fetch=async (_url,options)=>{
 upstreamCalls++;
 assert.equal(options.method,"POST");
 const body=JSON.parse(options.body);
 assert.equal(body.action,"staffOrders");
 assert.equal(body.token,"verified-owner");
 assert.equal(body.bridgeKey,"test-server-secret");
 return new Response(JSON.stringify({ok:true,data:{orders:upstreamRows}}),{
  headers:{"Content-Type":"application/json"}
 });
};
const eventDate="2026-12-20",eventId="E123456789";
const create=(id,number,price,quantity=2)=>({
 id,eventDate,eventId,orderNumber:number,status:"pending",
 eventTitle:"BALI EVENT",createdAt:"2026-10-23T00:01:00Z",
 updatedAt:"2026-10-23T00:02:00Z",ownerUid:"test_guest_UID",
 customerName:"Sample",customerPhone:"+375291234567",
 tableNumber:"10",bookingId:"",notes:"",
 total:price*quantity,
 items:[{id:"101",name:"Тест",quantity,unitPrice:price,total:price*quantity}]
});
const request=(date=eventDate,event=eventId,token="verified-owner")=>
 new Request("https://baliminsk.by/api/admin/migrate-sheets-preorders",{
  method:"POST",headers:{"Authorization":"Bearer "+token,
   "Origin":"https://baliminsk.by","Content-Type":"application/json"},
  body:JSON.stringify({date,eventId:event})
 });
const env={BALI_OPERATIONS_DB:wrap,SHEETS_SCRIPT_URL:"https://example.invalid/script",
 BALI_BRIDGE_KEY:"test-server-secret"};
const call=async()=>{const r=await route.onRequestPost({request:request(),env});return {status:r.status,body:await r.json()};};
const count=t=>db.prepare("SELECT COUNT(*) AS n FROM "+t).get().n;
assert.equal((await route.onRequestPost({request:request(eventDate,eventId,"other"),env})).status,403);
assert.equal(upstreamCalls,0,"Unauthorized users must not fetch any data");
assert.equal((await audit.onRequestGet({request:new Request("https://baliminsk.by/api/admin/unified-migration-audit"),env})).status,403);
upstreamRows=[create("o_test_alpha_1234",1,12.5),create("o_test_beta_5678",2,7.25)];
let x=await call();assert.equal(x.status,200,JSON.stringify(x.body));
assert.equal(x.body.cutover,false);assert.equal(x.body.staged,2);
assert.equal(count("preorder_orders"),2);assert.equal(count("preorder_items"),2);
assert.equal(count("preorder_import_proofs"),2);
assert.equal(db.prepare("SELECT status FROM migration_state WHERE id='preorders'").get().status,"pending");
x=await call();assert.equal(x.status,200,"Repeated import is idempotent");
assert.equal(count("preorder_orders"),2);assert.equal(count("preorder_items"),2);
let y=await audit.onRequestGet({request:new Request(
 "https://baliminsk.by/api/admin/unified-migration-audit",{headers:{"Authorization":"Bearer verified-owner"}}),env});
assert.equal(y.status,200);const auditData=await y.json();
assert.equal(auditData.staged.sheetsOrders,2);assert.equal(auditData.discrepancies.amountOrItemMismatches,0);
assert.equal(auditData.cutoverAllowed,false);
upstreamRows=[create("o_test_gamma_5678",3,5)];
upstreamRows[0].total=999;
x=await call();assert.equal(x.status,422,"Wrong source sum must reject import");
assert.equal(count("preorder_orders"),2);
upstreamRows=[create("o_test_gamma_5678",1,5)];
x=await call();assert.equal(x.status,503,"Same event and serial number cannot silently overwrite a different order");
assert.equal(count("preorder_orders"),2,"Failed D1 batch must roll back all rows");
assert.equal(count("preorder_import_proofs"),2,"Failed batch must not write migration receipts");
upstreamRows=[create("o_test_gamma_5678",3,5)];
x=await call();assert.equal(x.status,200,"Valid new order is staged");
assert.equal(count("preorder_orders"),3);
const cardId="test_guest_UID",digest="a".repeat(64);
db.prepare("INSERT INTO bali_guest_profiles_staging(firebase_uid,display_name,source_updated_at_ms,source_digest,staged_at_ms) VALUES (?,?,?,?,?)")
 .run(cardId,"Sample",1000,digest,2000);
db.prepare("INSERT INTO bali_id_cards_staging(firebase_uid,card_number,level,active,source_updated_at_ms,source_digest,staged_at_ms) VALUES (?,?,?,?,?,?,?)")
 .run(cardId,"000000101","Member",1,1000,digest,2000);
db.prepare("INSERT INTO bali_bonus_grants_staging(grant_id,firebase_uid,kind,original_quantity,remaining,transferable,unlimited,source_digest) VALUES (?,?,?,?,?,?,?,?)")
 .run("grant_01",cardId,"shot",2,2,1,0,digest);
assert.throws(()=>db.prepare("INSERT INTO bali_bonus_grants_staging(grant_id,firebase_uid,kind,original_quantity,remaining,transferable,unlimited,source_digest) VALUES (?,?,?,?,?,?,?,?)")
 .run("grant_negative",cardId,"shot",2,-1,1,0,digest));
assert.throws(()=>db.prepare("INSERT INTO bali_id_cards_staging(firebase_uid,card_number,level,active,source_updated_at_ms,source_digest,staged_at_ms) VALUES (?,?,?,?,?,?,?)")
 .run("second_UID","000000101","Gold",1,1000,digest,2000));
db.prepare("INSERT INTO bali_coin_balances_staging(firebase_uid,balance,source_digest,source_updated_at_ms) VALUES (?,?,?,?)")
 .run(cardId,0,digest,1000);
assert.throws(()=>db.prepare("UPDATE bali_coin_balances_staging SET balance=-1 WHERE firebase_uid=?").run(cardId));
assert.equal(db.prepare("SELECT COUNT(*) AS n FROM bali_id_cards_staging").get().n,1);
y=await audit.onRequestGet({request:new Request("https://baliminsk.by/api/admin/unified-migration-audit",{
 headers:{"Authorization":"Bearer verified-owner"}}),env});
assert.equal((await y.json()).cutoverAllowed,false);
db.close();
console.log("BALI migration: Firebase UID keys, strict totals, conflict rollback, idempotent import, read-only audit and fail-closed cutover PASS");
