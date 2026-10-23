import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
import {DatabaseSync} from "node:sqlite";
const source=readFileSync("cloudflare-pages/functions/api/staff-order-revision.js","utf8");
const injected=`
const authorizeStaff=async request=>{
  if(request.headers.get("Authorization")!=="Bearer trusted")
    throw Object.assign(Error("unauthorized"),{status:403});
  return {uid:"trusted_staff",role:"staff"};
};
`;
const endpoint=await import("data:text/javascript;base64,"+
  Buffer.from(source.replace(/^import \{authorizeStaff\} from "\.\.\/_lib\/staff-auth\.js";/m,injected)).toString("base64"));
const db=new DatabaseSync(":memory:");
db.exec(readFileSync("cloudflare-pages/d1/migrations/0001_preorders.sql","utf8"));
db.exec("INSERT INTO migration_state(id,source,status,record_count,updated_at_ms) VALUES('preorders','d1','complete',0,1)");
let inspectedSQL="";
const env={BALI_OPERATIONS_DB:{prepare(sql){
  inspectedSQL=sql;
  return {async first(){return db.prepare(sql).get();}};
}}};
const request=(token="trusted",origin="https://baliminsk.by")=>new Request(
  "https://baliminsk.by/api/staff-order-revision",{
    headers:{"Authorization":"Bearer "+token,"Origin":origin}
});
const call=async(token,origin)=>endpoint.onRequestGet({request:request(token,origin),env});
let res=await call("trusted");
assert.equal(res.status,200);
assert.equal((await res.json()).revision,"0");
assert.match(inspectedSQL,/FROM preorder_audit ORDER BY id DESC LIMIT 1/);
assert(!/COUNT\(\*\)|MAX\(/i.test(inspectedSQL),"Do not scan all order rows for changes");
assert.match(res.headers.get("Cache-Control"),/no-store/);
db.prepare("INSERT INTO preorder_audit(order_id,actor_uid,action,created_at_ms) VALUES(?,?,?,?)")
  .run("o_test0001","guest","create",2);
res=await call("trusted");assert.equal((await res.json()).revision,"1");
res=await call("invalid");assert.equal(res.status,403);
res=await call("trusted","https://attacker.example");assert.equal(res.status,403);
db.close();
const sw=readFileSync("bali-staff-sw.js","utf8");
assert.match(sw,/client\.postMessage\(\{type:"bali-staff:new-order"/);
assert.match(sw,/self\.registration\.showNotification/);
const client=readFileSync("admin-orders.js","utf8");
assert.match(client,/pushActive\?45000:10000/);
assert.match(client,/document\.visibilityState!=="visible"/);
assert.match(client,/lastFullAt>=60000/);
assert.match(client,/showNewStaffOrders\(added\)/);
console.log("BALI STAFF live D1 revision + authenticated delivery + push refresh PASS");
