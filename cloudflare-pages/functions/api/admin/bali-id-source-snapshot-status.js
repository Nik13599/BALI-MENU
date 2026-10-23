import {authorizeStaff,handlerError,errorJson} from "../../_lib/staff-auth.js";
/* Owner-only source snapshot audit. Never returns card numbers, guest PII,
 * raw Firebase UIDs, QR tokens, wallet balances or operation bodies.
 * A verified SOURCE snapshot still does not authorize BALI ID cutover.
 */
const out=data=>new Response(JSON.stringify(data),{status:200,headers:{
 "Content-Type":"application/json;charset=utf-8",
 "Cache-Control":"private,no-store","Vary":"Authorization",
 "X-Content-Type-Options":"nosniff"
}});
export async function onRequestGet({request,env}){
 try{
  await authorizeStaff(request,{adminOnly:true});
  const db=env?.BALI_OPERATIONS_DB;
  if(!db)return errorJson(503,"database-unavailable");
  const row=await db.prepare("SELECT snapshot_id,source_project,state,document_count,"+
    "source_manifest_digest,staged_manifest_digest,started_at_ms,finished_at_ms "+
    "FROM bali_snapshot_manifests ORDER BY started_at_ms DESC LIMIT 1").first();
  if(!row)return out({mode:"read-only",snapshot:"not-started",
    sourceOfTruth:"firebase",cutoverAllowed:false});
  const grouped=await db.prepare("SELECT scope,COUNT(*) AS count FROM ("+
    "SELECT scope FROM bali_source_snapshots WHERE snapshot_id=? UNION ALL "+
    "SELECT scope FROM bali_nested_source_snapshots WHERE snapshot_id=? UNION ALL "+
    "SELECT scope FROM bali_loyalty_source_snapshots WHERE snapshot_id=?"+
    ") GROUP BY scope ORDER BY scope")
    .bind(row.snapshot_id,row.snapshot_id,row.snapshot_id).all();
  const counts=Object.fromEntries((grouped.results||[])
    .map(x=>[x.scope,Number(x.count)]));
  const actual=Object.values(counts).reduce((sum,n)=>sum+n,0);
  const matching=actual===Number(row.document_count)&&
    row.source_manifest_digest===row.staged_manifest_digest;
  return out({
    mode:"read-only",
    sourceOfTruth:"firebase",
    snapshotId:row.snapshot_id,
    state:row.state,
    sourceProject:row.source_project,
    expectedDocuments:Number(row.document_count),
    stagedDocuments:actual,
    scopes:counts,
    manifestConsistent:matching,
    sourceVerified:row.state==="verified"&&matching,
    startedAtMs:Number(row.started_at_ms),
    finishedAtMs:Number(row.finished_at_ms),
    cutoverAllowed:false
  });
 }catch(e){return handlerError(e);}
}
export async function onRequestPost(){return errorJson(405,"method-not-allowed");}
