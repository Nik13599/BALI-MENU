/* Isolated integration checks for the guarded BALI D1 staff status API.
 * Exercises the ACTUAL SQL against SQLite, with authenticated staff mocked.
 * Production Firestore and Cloudflare accounts are never accessed.
 */
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
import {DatabaseSync} from "node:sqlite";
const schema=readFileSync("cloudflare-pages/d1/migrations/0001_preorders.sql","utf8");
const migration=readFileSync("cloudflare-pages/d1/migrations/0002_staff_status.sql","utf8");
const sql=new DatabaseSync(":memory:");
sql.exec(schema);
sql.exec(migration);
const asD1={
  prepare(query){
    const stmt=sql.prepare(query);
    return {bind(...args){return {
      first:async()=>stmt.get(...args)||null,
      all:async()=>({results:stmt.all(...args)}),
      run:async()=>({meta:{changes:stmt.run(...args).changes}})
    }}};
  },
  async batch(actions){
    sql.exec("BEGIN IMMEDIATE");
    try{
      const results=[];
      for(const stmt of actions)results.push(await stmt.run());
      sql.exec("COMMIT");
      return results;
    }catch(error){
      sql.exec("ROLLBACK");
      throw error;
    }
  }
};
const statusFile=readFileSync("cloudflare-pages/functions/api/staff-preorder-status.js","utf8");
const importer=/^import \{authorizeStaff,handlerError,errorJson\} from "\.\.\/_lib\/staff-auth\.js";/m;
assert.match(statusFile,importer,"Protected endpoint must import staff authorization");
const injected=`
const errorJson=(status,error)=>new Response(JSON.stringify({error}),{status});
const handlerError=e=>errorJson(e.status||503,"service-unavailable");
const authorizeStaff=async request=>{
  const token=request.headers.get("Authorization");
  if(token!=="Bearer staff-account")
    throw Object.assign(Error("Unauthorized"),{status:401});
  return {uid:"trusted_staff_uid",role:"staff"};
};
`;
const source=statusFile.replace(importer,injected);
const endpoint=await import("data:text/javascript;base64,"+
  Buffer.from(source).toString("base64"));
const orderId="test_order_0001",expected=1000;
sql.prepare("INSERT INTO preorder_orders "+
  "(id,event_id,event_date,event_title,order_number,customer_name,customer_phone,"+
  "status,source,created_at_ms,updated_at_ms) VALUES (?,?,?,?,?,?,?,?,?,?,?)")
  .run(orderId,"evt_123","2026-10-23","BALI EVENT",1,"Test","000",
    "pending","guest",expected,expected);
sql.prepare("INSERT INTO migration_state "+
  "(id,source,status,record_count,updated_at_ms) VALUES (?,?,?,?,?)")
  .run("preorders","firebase-firestore","pending",1,1000);
const request=({id=orderId,status="confirmed",requestId="a".repeat(32),
  expectedUpdatedAtMs=expected,origin="https://baliminsk.by",token="Bearer staff-account"}={})=>
  new Request("https://baliminsk.by/api/staff-preorder-status",{
    method:"POST",headers:{"Authorization":token,"Origin":origin,"Content-Type":"application/json"},
    body:JSON.stringify({id,status,requestId,expectedUpdatedAtMs})
  });
const invoke=async args=>{
  const result=await endpoint.onRequestPost({request:request(args),env:{BALI_OPERATIONS_DB:asD1}});
  return {status:result.status,body:await result.json()};
};
const count=table=>sql.prepare("SELECT COUNT(*) AS n FROM "+table).get().n;
let response=await invoke();
assert.equal(response.status,409);
assert.equal(response.body.error,"preorder-cutover-not-ready");
assert.equal(count("preorder_status_actions"),0);
assert.equal(sql.prepare("SELECT status FROM preorder_orders").get().status,"pending");
assert.equal((await invoke({token:"Bearer invalid"})).status,401);
assert.equal((await invoke({origin:"https://evil.example"})).status,403);
sql.prepare("UPDATE migration_state SET status='complete' WHERE id='preorders'").run();
assert.equal((await invoke({status:"hacked"})).status,400);
assert.equal((await invoke({id:"unknown_order_123"})).status,404);
response=await invoke();
assert.equal(response.status,200);
assert.equal(response.body.ok,true);
assert.equal(response.body.alreadyApplied,false);
assert.equal(response.body.status,"confirmed");
const updated=response.body.updatedAtMs;
assert(updated>expected);
assert.equal(count("preorder_status_actions"),1);
assert.equal(count("preorder_audit"),1);
assert.equal(sql.prepare("SELECT status FROM preorder_orders").get().status,"confirmed");
response=await invoke();
assert.equal(response.status,200);
assert.equal(response.body.alreadyApplied,true);
assert.equal(count("preorder_audit"),1,"Replays may not create additional audit entries");
assert.equal((await invoke({status:"cancelled"})).status,409,"Request ID cannot be reused for a new intent");
assert.equal((await invoke({status:"cancelled",requestId:"b".repeat(32)})).status,409,
  "Stale update must not overwrite another staff change");
assert.equal(count("preorder_status_actions"),1,"Stale actions do not leave committed rows");
response=await invoke({status:"cancelled",requestId:"c".repeat(32),expectedUpdatedAtMs:updated});
assert.equal(response.status,200);
assert.equal(response.body.alreadyApplied,false);
assert.equal(count("preorder_status_actions"),2);
assert.equal(count("preorder_audit"),2);
assert.equal(sql.prepare("SELECT status FROM preorder_orders").get().status,"cancelled");
const trusted=sql.prepare("SELECT actor_uid FROM preorder_audit ORDER BY id DESC LIMIT 1").get();
assert.equal(trusted.actor_uid,"trusted_staff_uid");
response=await invoke({status:"cancelled",requestId:"d".repeat(32),expectedUpdatedAtMs:expected});
assert.equal(response.status,200);
assert.equal(response.body.alreadyApplied,true);
assert.equal(count("preorder_status_actions"),2,"No-op actions do not create audit rows");
sql.close();
console.log("BALI D1 Staff: cutover locked, status atomicity, optimistic version, idempotent replay, audit and role PASS.");
