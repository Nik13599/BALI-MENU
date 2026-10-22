import {authorizeStaff,handlerError,errorJson} from "../../_lib/staff-auth.js";
/* BALI owner-only migration audit.
 * No guest personal information is returned, no orders are changed,
 * and no database cutover is possible from this endpoint.
 */
const PROJECT="bali-menu-5a48b";
const API_KEY="AIzaSyAiGyt5O6x2V0pBNIJ2pOlXxXBgaYqzzUA";
const json=(value,status=200)=>new Response(JSON.stringify(value),{
  status,headers:{"Content-Type":"application/json; charset=utf-8",
    "Cache-Control":"no-store","X-Content-Type-Options":"nosniff",
    "Vary":"Authorization"}
});
async function sourceOrderCount(idToken){
  const endpoint="https://firestore.googleapis.com/v1/projects/"+PROJECT+
    "/databases/(default)/documents:runAggregationQuery?key="+API_KEY;
  const body={structuredAggregationQuery:{
    structuredQuery:{from:[{collectionId:"orders"}]},
    aggregations:[{alias:"orderCount",count:{}}]
  }};
  const upstream=await fetch(endpoint,{
    method:"POST",headers:{"Authorization":"Bearer "+idToken,
      "Content-Type":"application/json"},body:JSON.stringify(body),
    signal:AbortSignal.timeout(9000)
  });
  if(!upstream.ok)throw Object.assign(new Error("firestore-aggregate-unavailable"),
    {status:503});
  const records=await upstream.json();
  const raw=Array.isArray(records)?
    records.find(x=>x.result?.aggregateFields?.orderCount)?.result?.aggregateFields?.orderCount:
    records?.result?.aggregateFields?.orderCount;
  const n=Number(raw?.integerValue);
  if(!Number.isSafeInteger(n)||n<0)throw Object.assign(
    new Error("firestore-aggregate-invalid"),{status:503});
  return n;
}
export async function onRequestGet({request,env}){
  try{
    // A staff account cannot enumerate migration state or database sizes.
    await authorizeStaff(request,{adminOnly:true});
    const db=env?.BALI_OPERATIONS_DB;
    if(!db)return errorJson(503,"database-unavailable");
    const token=(request.headers.get("Authorization")||"").slice(7);
    // Count aggregation avoids downloading any personal preorder records.
    const [sourceCount,health,migration]=await Promise.all([
      sourceOrderCount(token),
      db.prepare(`
        SELECT
          (SELECT COUNT(*) FROM preorder_orders) AS order_count,
          (SELECT COUNT(*) FROM preorder_items) AS item_count,
          (SELECT COUNT(*) FROM preorder_orders AS o WHERE NOT EXISTS
            (SELECT 1 FROM preorder_items AS i WHERE i.order_id=o.id)) AS missing_items,
          (SELECT COUNT(*) FROM (
            SELECT event_id,MAX(order_number) AS maximum_number
            FROM preorder_orders GROUP BY event_id
          ) AS e LEFT JOIN preorder_counters AS c ON c.event_id=e.event_id
            WHERE c.event_id IS NULL OR c.last_number<e.maximum_number) AS broken_counters
      `).first(),
      db.prepare("SELECT status,record_count,updated_at_ms FROM migration_state WHERE id=?")
        .bind("preorders").first()
    ]);
    const count=Number(health?.order_count||0);
    const itemCount=Number(health?.item_count||0);
    const missingItems=Number(health?.missing_items||0);
    const brokenCounters=Number(health?.broken_counters||0);
    const countsMatch=count===sourceCount;
    const structureValid=missingItems===0&&brokenCounters===0;
    const report={
      activeBackend:"firestore",mode:"read-only-audit",
      sourceOrders:sourceCount,stagedOrders:count,stagedItems:itemCount,
      missingItems,brokenCounters,
      migrationStatus:migration?.status||"not-started",
      countsMatch,structureValid,
      // Matching counts do not prove per-order parity; migration is NOT live.
      needsRecordReconciliation:true,cutoverAllowed:false,
      checkedAt:new Date().toISOString()
    };
    return json(report);
  }catch(error){return handlerError(error);}
}
export async function onRequestPost(){return errorJson(405,"method-not-allowed");}
