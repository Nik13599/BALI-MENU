import {authorizeStaff,handlerError,errorJson} from "../../_lib/staff-auth.js";
/* Private, read-only reconciliation status. Never returns names, phone numbers,
 * UIDs, QR tokens, wallet data or individual balances.
 * A successful local count is NOT authorization to switch financial balances.
 */
const send=data=>new Response(JSON.stringify(data),{status:200,headers:{
 "Content-Type":"application/json;charset=utf-8",
 "Cache-Control":"no-store","Vary":"Authorization",
 "X-Content-Type-Options":"nosniff"
}});
export async function onRequestGet({request,env}){
 try{
  await authorizeStaff(request,{adminOnly:true});
  const db=env?.BALI_OPERATIONS_DB;
  if(!db)return errorJson(503,"database-unavailable");
  const [totals,checkpoints]=await Promise.all([
   db.prepare(
    "SELECT "+
    "(SELECT COUNT(*) FROM bali_guest_profiles_staging) AS profiles,"+
    "(SELECT COUNT(*) FROM bali_id_cards_staging) AS cards,"+
    "(SELECT COUNT(*) FROM bali_bonus_grants_staging) AS grants,"+
    "(SELECT COUNT(*) FROM bali_wallet_operations_staging) AS bonusOperations,"+
    "(SELECT COUNT(*) FROM bali_coin_balances_staging) AS coinWallets,"+
    "(SELECT COUNT(*) FROM bali_coin_operations_staging) AS coinOperations,"+
    "(SELECT COUNT(*) FROM bali_id_cards_staging c LEFT JOIN "+
       "bali_guest_profiles_staging p ON p.firebase_uid=c.firebase_uid "+
       "WHERE p.firebase_uid IS NULL) AS cardsWithoutProfiles,"+
    "(SELECT COUNT(*) FROM bali_bonus_grants_staging g LEFT JOIN "+
       "bali_id_cards_staging c ON c.firebase_uid=g.firebase_uid "+
       "WHERE c.firebase_uid IS NULL) AS orphanGrants,"+
    "(SELECT COUNT(*) FROM bali_wallet_operations_staging o LEFT JOIN "+
       "bali_id_cards_staging c ON c.firebase_uid=o.firebase_uid "+
       "WHERE c.firebase_uid IS NULL) AS orphanOperations"
   ).first(),
   db.prepare("SELECT scope,source_backend,source_count,staged_count,"+
    "missing_count,mismatched_count,status,snapshot_at_ms,checked_at_ms "+
    "FROM bali_migration_checkpoints WHERE scope IN "+
    "('bali-id','bali-bonuses','bali-coin','qr-history') ORDER BY scope").all()
  ]);
  const checks=checkpoints?.results||[];
  const verified=checks.length===4&&checks.every(x=>
   x.status==="verified"&&Number(x.missing_count)===0&&
   Number(x.mismatched_count)===0&&
   Number(x.source_count)===Number(x.staged_count)&&
   Number(x.checked_at_ms)>=Number(x.snapshot_at_ms)
  );
  const unlinked=Number(totals?.cardsWithoutProfiles||0)+
   Number(totals?.orphanGrants||0)+Number(totals?.orphanOperations||0);
  return send({
   sourceOfTruth:"firebase",
   mode:"read-only",
   stagedCounts:{
    profiles:Number(totals?.profiles||0),cards:Number(totals?.cards||0),
    bonusGrants:Number(totals?.grants||0),
    bonusOperations:Number(totals?.bonusOperations||0),
    coinWallets:Number(totals?.coinWallets||0),
    coinOperations:Number(totals?.coinOperations||0)
   },
   orphanedRecords:unlinked,
   snapshotReconciliationVerified:verified&&unlinked===0,
   checkpoints:checks,
   cutoverAllowed:false,
   reason:"Requires authenticated Firebase Admin export, UID-level digest comparison, immutable operation history and rollback test."
  });
 }catch(e){return handlerError(e)}
}
export async function onRequestPost(){return errorJson(405,"method-not-allowed")}
