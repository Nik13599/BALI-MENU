import {authorizeStaff,handlerError,errorJson} from "../_lib/staff-auth.js";
/* POST /api/staff-preorder-status
 * Safe D1-only staff status update. Firestore orders remain the source of truth
 * until an independently audited migration sets preorders to COMPLETE.
 * A staff action has a server-derived actor, a unique request ID and an
 * optimistic version check. Replaying a previously applied action is harmless.
 */
const ID=/^[A-Za-z0-9_-]{8,128}$/;
const REQUEST=/^[a-f0-9]{32}$/;
const STATES=new Set(["pending","confirmed","cancelled"]);
const response=(data,status=200)=>new Response(JSON.stringify(data),{
  status,headers:{"Content-Type":"application/json; charset=utf-8",
    "Cache-Control":"no-store","X-Content-Type-Options":"nosniff",
    "Vary":"Authorization"}
});
const sameAction=(old,{id,status,requestId,expectedUpdatedAtMs})=>
  old&&old.request_id===requestId&&old.order_id===id&&
  old.new_status===status&&Number(old.expected_updated_at_ms)===expectedUpdatedAtMs;
export async function onRequestPost({request,env}){
  try{
    const actor=await authorizeStaff(request,{env});
    const origin=request.headers.get("Origin");
    if(origin&&origin!==new URL(request.url).origin)
      return errorJson(403,"invalid-origin");
    const length=Number(request.headers.get("Content-Length")||0);
    if(!Number.isFinite(length)||length>1024)return errorJson(413,"request-too-large");
    let body;
    try{
      const raw=await request.text();
      if(raw.length>1024)return errorJson(413,"request-too-large");
      body=JSON.parse(raw);
    }catch{return errorJson(400,"invalid-json");}
    const {id,status,requestId,expectedUpdatedAtMs}=body||{};
    if(typeof id!=="string"||!ID.test(id)||
       typeof status!=="string"||!STATES.has(status)||
       typeof requestId!=="string"||!REQUEST.test(requestId)||
       !Number.isSafeInteger(expectedUpdatedAtMs)||expectedUpdatedAtMs<1)
      return errorJson(400,"invalid-status-action");
    const db=env?.BALI_OPERATIONS_DB;
    if(!db)return errorJson(503,"database-unavailable");
    const migration=await db.prepare("SELECT status FROM migration_state WHERE id=?")
      .bind("preorders").first();
    if(migration?.status!=="complete")
      return errorJson(409,"preorder-cutover-not-ready");
    const existing=()=>db.prepare(
      "SELECT actor_uid,request_id,order_id,new_status,expected_updated_at_ms,"+
      "applied_updated_at_ms FROM preorder_status_actions "+
      "WHERE actor_uid=? AND request_id=?"
    ).bind(actor.uid,requestId).first();
    const replay=await existing();
    if(replay)return sameAction(replay,{id,status,requestId,expectedUpdatedAtMs})
      ?response({ok:true,id,status,requestId,updatedAtMs:replay.applied_updated_at_ms,
        alreadyApplied:true})
      :errorJson(409,"request-id-reused");
    const current=await db.prepare(
      "SELECT status,updated_at_ms FROM preorder_orders WHERE id=?"
    ).bind(id).first();
    if(!current)return errorJson(404,"preorder-not-found");
    if(current.status===status)
      return response({ok:true,id,status,requestId,
        updatedAtMs:current.updated_at_ms,alreadyApplied:true});
    if(Number(current.updated_at_ms)!==expectedUpdatedAtMs)
      return errorJson(409,"preorder-changed");
    const now=Math.max(Date.now(),expectedUpdatedAtMs+1);
    const details=JSON.stringify({before:current.status,after:status,requestId});
    const changes=[
      db.prepare(
        "INSERT INTO preorder_status_actions (actor_uid,request_id,order_id,"+
        "new_status,expected_updated_at_ms,applied_updated_at_ms,created_at_ms) "+
        "SELECT ?,?,?,?,?,?,? WHERE EXISTS ("+
        "SELECT 1 FROM preorder_orders WHERE id=? AND updated_at_ms=? AND status<>?)"
      ).bind(actor.uid,requestId,id,status,expectedUpdatedAtMs,now,now,
        id,expectedUpdatedAtMs,status),
      db.prepare("UPDATE preorder_orders SET status=?,updated_at_ms=? "+
        "WHERE id=? AND updated_at_ms=? AND status<>? AND EXISTS ("+
        "SELECT 1 FROM preorder_status_actions WHERE actor_uid=? AND request_id=? "+
        "AND order_id=? AND applied_updated_at_ms=?)")
        .bind(status,now,id,expectedUpdatedAtMs,status,actor.uid,requestId,id,now),
      db.prepare(
        "INSERT INTO preorder_audit (order_id,actor_uid,action,created_at_ms,details) "+
        "SELECT ?,?,?,?,? WHERE EXISTS ("+
        "SELECT 1 FROM preorder_status_actions WHERE actor_uid=? AND request_id=? "+
        "AND order_id=? AND applied_updated_at_ms=?)"
      ).bind(id,actor.uid,"status",now,details,actor.uid,requestId,id,now)
    ];
    let result;
    try{result=await db.batch(changes);}
    catch(error){
      // A simultaneous retry can hit the unique request index. Read the
      // committed receipt; never reapply the status after an ambiguous error.
      const saved=await existing().catch(()=>null);
      if(saved&&sameAction(saved,{id,status,requestId,expectedUpdatedAtMs}))
        return response({ok:true,id,status,requestId,
          updatedAtMs:saved.applied_updated_at_ms,alreadyApplied:true});
      if(saved)return errorJson(409,"request-id-reused");
      throw error;
    }
    if(Number(result?.[0]?.meta?.changes)!==1||
       Number(result?.[1]?.meta?.changes)!==1||
       Number(result?.[2]?.meta?.changes)!==1)
      return errorJson(409,"preorder-changed");
    return response({ok:true,id,status,requestId,updatedAtMs:now,alreadyApplied:false});
  }catch(error){return handlerError(error);}
}
export async function onRequestGet(){return errorJson(405,"method-not-allowed");}
