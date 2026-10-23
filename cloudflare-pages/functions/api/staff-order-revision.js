import {authorizeStaff} from "../_lib/staff-auth.js";
/* Lightweight revision probe for the authenticated BALI STAFF dashboard.
 * Polling this marker is cheaper than downloading 100 full orders every time.
 * The marker covers audited inserts, status changes and edits; periodic
 * full reconciliation handles unaudited maintenance and archival changes.
 * It does not reveal customers, item details or other private order fields.
 */
const response=(status,data)=>new Response(JSON.stringify(data),{status,headers:{
  "Content-Type":"application/json; charset=utf-8",
  "Cache-Control":"private, no-store",
  "X-Content-Type-Options":"nosniff",
  "Vary":"Authorization"
}});
export async function onRequestGet({request,env}){
  try{
    const origin=request.headers.get("Origin");
    if(origin&&origin!==new URL(request.url).origin)
      return response(403,{ok:false,error:"invalid-origin"});
    await authorizeStaff(request,{env});
    const db=env?.BALI_OPERATIONS_DB;
    if(!db)return response(503,{ok:false,error:"database-unavailable"});
    const migration=await db.prepare(
      "SELECT status FROM migration_state WHERE id='preorders'"
    ).first();
    if(migration?.status!=="complete")
      return response(503,{ok:false,error:"preorders-not-ready"});
    // The audit id is an indexed INTEGER PRIMARY KEY. This needs only the
    // latest audit entry; scanning COUNT/MAX over all orders would waste D1 rows.
    // Creation is audited atomically in the same D1 order transaction.
    const row=await db.prepare(
      "SELECT id FROM preorder_audit ORDER BY id DESC LIMIT 1"
    ).first();
    return response(200,{ok:true,revision:String(row?.id||0)});
  }catch(error){
    return response(error?.status===401?401:error?.status===403?403:503,
      {ok:false,error:error?.status===401?"unauthenticated":
        error?.status===403?"permission-denied":"service-unavailable"});
  }
}
export async function onRequestPost(){return response(405,{ok:false,error:"method-not-allowed"});}
