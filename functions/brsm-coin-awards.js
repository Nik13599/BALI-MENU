"use strict";
/* Award/reverse BRSM attendance COIN inside the same Firestore transaction
 * that records or reverses a guest visit. No guest browser request is required.
 */
const {createHash}=require("node:crypto");
const sha=value=>createHash("sha256").update(value).digest("hex");
module.exports=({db,TS,fail,coinRollout})=>{
  const rollout=coinRollout||require("./coin-rollout")({fail});
  const refs=(uid,campaignId,eventId)=>{
    const requestId="visit_"+sha(campaignId+"|"+eventId);
    const id=sha(uid+"|"+requestId);
    return {
      account:db.doc("baliCoinAccounts/"+uid),
      op:db.doc("baliCoinRequests/"+id),
      history:db.doc("baliCoinAccounts/"+uid+"/history/"+id),
      reward:db.doc("baliCoinRewards/"+sha(campaignId+"|EVENT|"+eventId)),
      historyRoot:"baliCoinAccounts/"+uid+"/history/"+id
    };
  };
  const validBalance=value=>Number.isSafeInteger(value)&&value>=0&&value<=999999999;
  async function award(tx,{uid,campaignId,eventId}){
    // Preserve attendance even if the financial ledger has not been released.
    if(!rollout.eligible([uid]))return {amount:0,rolloutFrozen:true};
    const r=refs(uid,campaignId,eventId);
    const [rate,previous,account]=await Promise.all([
      tx.get(r.reward),tx.get(r.op),tx.get(r.account)
    ]);
    if(previous.exists&&previous.data().action==="award"&&!previous.data().revoked)
      return {amount:0,alreadyProcessed:true};
    if(!rate.exists||rate.data().active!==true||!Number.isSafeInteger(rate.data().amount)||
      rate.data().amount<=0)return {amount:0,notConfigured:true};
    // QR attendance must succeed even if the guest's old wallet has
    // not been reconciled. COIN is deferred until that balance exists.
    if(rollout.phase==="live"&&!account.exists)
      return {amount:0,sourceWalletUnverified:true};
    if(account.exists&&account.data().source==="legacy-sheets-migration"&&
      account.data().migrationComplete!==true)
      fail("failed-precondition","История BALI COIN ещё переносится.");
    const amount=rate.data().amount,before=account.exists?account.data().balance:0;
    if(!validBalance(before)||!validBalance(before+amount))
      fail("failed-precondition","Некорректный или переполненный баланс BALI COIN.");
    const at=TS.now(),after=before+amount;
    const priorCount=previous.exists?Number(previous.data().reissues||0):0;
    const issueCount=previous.exists?priorCount+1:0;
    const historyRef=issueCount?
      db.doc(r.historyRoot+"_reissue_"+issueCount):r.history;
    tx.set(r.account,{balance:after,updatedAt:at},{merge:true});
    if(previous.exists){
      if(previous.data().action!=="award"||previous.data().uid!==uid)
        fail("already-exists","Конфликт истории BALI COIN.");
      tx.update(r.op,{revoked:false,reissues:issueCount,amount,balance:after,updatedAt:at});
    }else{
      tx.create(r.op,{action:"award",uid,amount,reason:"Посещение "+eventId,
        balance:after,reissues:0,revoked:false,createdAt:at});
    }
    tx.create(historyRef,{type:"credit",count:amount,balance:after,
      reason:"Посещение "+eventId,createdAt:at});
    return {amount,balance:after};
  }
  async function reverse(tx,{uid,campaignId,eventId,reason,staffUid}){
    const r=refs(uid,campaignId,eventId);
    const [previous,account]=await Promise.all([tx.get(r.op),tx.get(r.account)]);
    if(!previous.exists||previous.data().revoked)return {amount:0};
    // Do not cancel credited attendance without reversing its COIN receipt.
    rollout.assertWrite([uid]);
    if(account.exists&&account.data().source==="legacy-sheets-migration"&&
      account.data().migrationComplete!==true)
      fail("failed-precondition","История BALI COIN ещё переносится.");
    const value=previous.data(),before=account.exists?account.data().balance:0;
    if(value.action!=="award"||value.uid!==uid||!validBalance(before)||
      !Number.isSafeInteger(value.amount)||value.amount<1)
      fail("failed-precondition","Ошибка журнала начислений.");
    if(before<value.amount)
      fail("failed-precondition","Баллы за ошибочный вход уже потрачены. Сначала урегулируйте баланс с руководством.");
    const at=TS.now(),after=before-value.amount;
    const iteration=Number(value.reissues||0);
    const entry=db.doc(r.historyRoot+"_undo_"+iteration);
    tx.set(r.account,{balance:after,updatedAt:at},{merge:true});
    tx.update(r.op,{revoked:true,revokedBy:staffUid,revokedAt:at,balance:after});
    tx.create(entry,{type:"debit",count:value.amount,balance:after,
      reason:"Отмена посещения "+eventId+": "+reason,by:staffUid,createdAt:at});
    return {amount:value.amount,balance:after};
  }
  return {award,reverse};
};
