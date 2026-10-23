import {authorizeStaff,handlerError,errorJson} from "../../_lib/staff-auth.js";
/* Owner-only READ-ONLY parity and migration readiness. Never says ready
 * based solely on counts. No personal guest data appears in responses.
 */
const response=(data,status=200)=>new Response(JSON.stringify(data),{
 status,headers:{"Content-Type":"application/json;charset=utf-8",
 "Cache-Control":"no-store","Vary":"Authorization",
 "X-Content-Type-Options":"nosniff"}
});
export async function onRequestGet({request,env}){
 try{
  await authorizeStaff(request,{adminOnly:true});
  const db=env?.BALI_OPERATIONS_DB;
  if(!db)return errorJson(503,"database-unavailable");
  const [counts,preorderState,checkpointRows]=await Promise.all([
   db.prepare(`
     SELECT
       (SELECT COUNT(*) FROM preorder_orders) AS orders,
       (SELECT COUNT(*) FROM preorder_items) AS lines,
       (SELECT COUNT(*) FROM preorder_import_proofs) AS proofs,
       (SELECT COUNT(*) FROM preorder_import_proofs WHERE source_backend='sheets') AS sheets,
       (SELECT COUNT(*) FROM preorder_import_proofs WHERE source_backend='firestore') AS firestore,
       (SELECT COUNT(*) FROM preorder_orders o LEFT JOIN preorder_import_proofs p
         ON o.id=p.order_id WHERE p.order_id IS NULL) AS unproved_orders,
       (SELECT COUNT(*) FROM preorder_import_proofs p
          LEFT JOIN (
            SELECT order_id, COUNT(*) AS line_count,
            SUM(quantity*unit_price_minor) AS sum_minor
            FROM preorder_items GROUP BY order_id
          ) AS i ON i.order_id=p.order_id
        WHERE i.line_count IS NULL OR i.line_count<>p.expected_item_count
           OR i.sum_minor<>p.expected_total_minor) AS amount_mismatches,
       (SELECT COUNT(*) FROM preorder_orders o
          WHERE NOT EXISTS(SELECT 1 FROM preorder_items i WHERE i.order_id=o.id)) AS without_items,
       (SELECT COUNT(*) FROM bali_guest_profiles_staging) AS profiles,
       (SELECT COUNT(*) FROM bali_id_cards_staging) AS cards,
       (SELECT COUNT(*) FROM bali_bonus_grants_staging) AS grants,
       (SELECT COUNT(*) FROM bali_wallet_operations_staging) AS bonus_operations,
       (SELECT COUNT(*) FROM bali_coin_balances_staging) AS coin_balances,
       (SELECT COUNT(*) FROM bali_coin_operations_staging) AS coin_operations
   `).first(),
   db.prepare("SELECT source,status,record_count,updated_at_ms FROM migration_state WHERE id='preorders'").first(),
   db.prepare("SELECT scope,source_backend,source_count,staged_count,missing_count,mismatched_count,status,snapshot_at_ms,checked_at_ms FROM bali_migration_checkpoints").all()
  ]);
  const checks=checkpointRows?.results||[];
  // Snapshot count is a useful diagnostic but never authorizes cutover.
  const sourceReconComplete=checks.length===5&&
    checks.every(x=>x.status==="verified"&&x.missing_count===0&&
      x.mismatched_count===0&&x.source_count===x.staged_count&&
      x.checked_at_ms>=x.snapshot_at_ms);
  const locallyValid=Number(counts?.unproved_orders||0)===0&&
    Number(counts?.amount_mismatches||0)===0&&
    Number(counts?.without_items||0)===0;
  return response({
    activeBackend:{preorders:"firestore+google-sheets",baliId:"firebase"},
    mode:"read-only-migration-audit",
    staged:{
      orders:Number(counts?.orders||0),items:Number(counts?.lines||0),
      proofs:Number(counts?.proofs||0),
      sheetsOrders:Number(counts?.sheets||0),
      firestoreOrders:Number(counts?.firestore||0),
      profiles:Number(counts?.profiles||0),cards:Number(counts?.cards||0),
      bonusGrants:Number(counts?.grants||0),bonusOperations:Number(counts?.bonus_operations||0),
      coinBalances:Number(counts?.coin_balances||0),
      coinOperations:Number(counts?.coin_operations||0)
    },
    discrepancies:{
      unprovedOrders:Number(counts?.unproved_orders||0),
      amountOrItemMismatches:Number(counts?.amount_mismatches||0),
      ordersWithoutItems:Number(counts?.without_items||0)
    },
    sourceReconciliationComplete:sourceReconComplete,
    localParityPassed:locallyValid,
    migrationStatus:preorderState?.status||"not-started",
    checkpoints:checks,
    // Additional permissions tests, source exports, frozen-write window,
    // rollback plan and production smoke tests are mandatory before cutover.
    cutoverAllowed:false,
    checkedAt:new Date().toISOString()
  });
 }catch(error){return handlerError(error);}
}
export async function onRequestPost(){return errorJson(405,"method-not-allowed");}
