import assert from "node:assert/strict";
import {readFile} from "node:fs/promises";
const source=await readFile("cloudflare-pages/functions/api/admin/preorder-migration-audit.js","utf8");
const importer=await readFile("cloudflare-pages/functions/api/admin/migrate-preorders.js","utf8");
const authMock=`export async function authorizeStaff(request,{adminOnly}={}){
  if(!adminOnly||request.headers.get("Authorization")!=="Bearer verified-owner-token")
    throw Object.assign(new Error("access-denied"),{status:403});
  return {uid:"owner-test",role:"admin"};
}
export function errorJson(status,error){
  return new Response(JSON.stringify({error}),{status,headers:{"content-type":"application/json"}});
}
export function handlerError(error){return errorJson(error.status===403?403:503,
    error.status===403?"access-denied":"service-unavailable");}
`;
const stub="data:text/javascript;base64,"+Buffer.from(authMock).toString("base64");
const moduleCode=source.replace(
  'from "../../_lib/staff-auth.js"', 'from "'+stub+'"'
);
assert.notEqual(source,moduleCode,"Route must import verified owner authorization");
const api=await import("data:text/javascript;base64,"+Buffer.from(moduleCode).toString("base64"));
let aggRequests=0,aggregateFailure=false;
globalThis.fetch=async (url,init)=>{
  aggRequests++;
  assert(String(url).includes(":runAggregationQuery"));
  assert.equal(init.method,"POST");
  assert.equal(init.headers.Authorization,"Bearer verified-owner-token");
  const payload=JSON.parse(init.body);
  assert.equal(payload.structuredAggregationQuery.structuredQuery.from[0].collectionId,"orders");
  assert.equal(payload.structuredAggregationQuery.aggregations[0].alias,"orderCount");
  if(aggregateFailure)return new Response("quota",{status:429});
  return new Response(JSON.stringify([
    {result:{aggregateFields:{orderCount:{integerValue:"3"}}}}
  ]),{status:200,headers:{"Content-Type":"application/json"}});
};
const sql=[],db={prepare(statement){
  sql.push(statement);
  return {
    bind(){return this},
    first:async()=>{
      if(statement.includes("AS missing_items"))return {
        order_count:3,item_count:7,missing_items:0,broken_counters:0
      };
      if(statement.includes("migration_state"))return {
        status:"pending",record_count:3,updated_at_ms:100
      };
      throw Error("Unexpected SQL");
    }
  };
}};
const request=new Request("https://baliminsk.by/api/admin/preorder-migration-audit",{
  headers:{"Authorization":"Bearer verified-owner-token"}
});
const denied=await api.onRequestGet({request:new Request(request.url),env:{BALI_OPERATIONS_DB:db}});
assert.equal(denied.status,403,"Non-admin callers cannot see migration metadata");
assert.equal(aggRequests,0,"Unauthorized requests must make no source reads");
const response=await api.onRequestGet({request,env:{BALI_OPERATIONS_DB:db}});
assert.equal(response.status,200);
const result=await response.json();
assert.equal(result.sourceOrders,3);
assert.equal(result.stagedOrders,3);
assert.equal(result.stagedItems,7);
assert.equal(result.missingItems,0);
assert.equal(result.brokenCounters,0);
assert.equal(result.countsMatch,true);
assert.equal(result.structureValid,true);
assert.equal(result.cutoverAllowed,false);
assert.equal(result.needsRecordReconciliation,true);
assert.equal(result.activeBackend,"firestore");
assert.equal(aggRequests,1);
assert(sql.every(statement=>!/(?:DELETE|UPDATE|INSERT)\s+/i.test(statement)),
  "The audit is strictly read-only");
aggregateFailure=true;
const quota=await api.onRequestGet({request,env:{BALI_OPERATIONS_DB:db}});
assert.equal(quota.status,503,"A source quota failure cannot mark migration complete");
const badMethod=await api.onRequestPost();
assert.equal(badMethod.status,405);
// The staging endpoint must handle repeated source revisions safely,
// but cannot switch the operational preorder store.
assert(importer.includes("ON CONFLICT(id) DO UPDATE SET"),
  "Re-import must update existing order fields");
assert(importer.includes("DELETE FROM preorder_items WHERE order_id=?"),
  "Re-import must refresh items, including deletions");
assert(importer.includes("WHERE NOT EXISTS (SELECT 1 FROM preorder_audit"),
  "Repeated imports must not duplicate initial audit entries");
assert(importer.includes('state?.status==="complete"'),
  "Staging cannot rewrite an activated database");
assert(importer.includes("await db.batch(statements)"),
  "An order and its items must be imported atomically");
assert(importer.includes("cutover:false"),
  "Staging endpoint must never announce production cutover");
console.log("D1 preorder audit: owner-only, aggregate-count parity, read-only, fail-closed, idempotent stage PASS.");
