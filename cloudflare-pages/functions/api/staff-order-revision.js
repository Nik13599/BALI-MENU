import {authorizeStaff} from "../_lib/staff-auth.js";
/* Lightweight revision probe for the authenticated BALI STAFF dashboard.
 * Polling this marker is cheaper than downloading 100 full orders every time.
 * The marker includes inserts, status changes, deletions and edits.
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
    const row=await db.prepare(
      "SELECT COUNT(*) AS total,COALESCE(MAX(created_at_ms),0) AS newest,"+
      "COALESCE(MAX(updated_at_ms),0) AS changed FROM preorder_orders"
    ).first();
    const total=Number(row?.total)||0,newest=Number(row?.newest)||0;
    const changed=Number(row?.changed)||0;
    return response(200,{ok:true,revision:[total,newest,changed].join(":")});
  }catch(error){
    return response(error?.status===401?401:error?.status===403?403:503,
      {ok:false,error:error?.status===401?"unauthenticated":
        error?.status===403?"permission-denied":"service-unavailable"});
  }
}
export async function onRequestPost(){return response(405,{ok:false,error:"method-not-allowed"});}
