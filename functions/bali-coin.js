"use strict";
/* Shared BALI COIN across every BALI ID tier, including BRSM.
 * Single Firestore ledger; all balance mutations happen in transactions.
 * No Cloudflare Worker / Apps Script / browser writes.
 */
const {randomBytes,createHash}=require("node:crypto");
module.exports=({api,admin,db,TS,verified,privileged,fail,nameAndId})=>{
  const hash=s=>createHash("sha256").update(s).digest("hex");
  const text=(s,n=100)=>typeof s==="string"?s.trim().slice(0,n):"";
  const validId=s=>typeof s==="string"&&/^[A-Za-z0-9_-]{3,80}$/.test(s);
  const validUid=s=>typeof s==="string"&&/^[A-Za-z0-9_-]{8,128}$/.test(s);
  const validNumber=s=>typeof s==="string"&&/^\d{6}$/.test(s)&&Number(s)>0;
  const validNonce=s=>typeof s==="string"&&/^[a-zA-Z0-9_-]{12,80}$/.test(s);
  const coins=n=>Number.isSafeInteger(n)&&n>=0&&n<=999999999;
  const positive=n=>Number.isSafeInteger(n)&&n>0&&n<=1000000;
  const acct=uid=>db.doc("baliCoinAccounts/"+uid);
  const hist=(uid,id)=>db.doc("baliCoinAccounts/"+uid+"/history/"+id);
  const ownVoucher=(uid,id)=>db.doc("baliCoinAccounts/"+uid+"/vouchers/"+id);
  const nonceRef=(uid,id)=>db.doc("baliCoinRequests/"+hash(uid+"|"+id));
  const lotRef=(campaignId,lotId)=>db.doc("baliCoinLots/"+campaignId+"_"+lotId);
  const voucherRef=code=>db.doc("baliCoinVouchers/"+hash(code));
  const rewardRef=(campaignId,kind,itemId)=>db.doc("baliCoinRewards/"+hash(campaignId+"|"+kind+"|"+itemId));
  const balance=snap=>{
    if(snap.exists&&snap.data().source==="legacy-sheets-migration"&&snap.data().migrationComplete!==true)
      fail("failed-precondition","Перенос истории BALI COIN ещё не завершён.");
    const value=snap.exists?snap.data().balance:0;
    if(!coins(value))fail("failed-precondition","Нарушена целостность баланса BALI COIN.");
    return value;
  };
  async function role(uid){
    const [a,r,preorders]=await Promise.all([
      db.doc("admins/"+uid).get(),
      db.doc("staffRoles/"+uid).get(),
      db.doc("preorderStaff/"+uid).get()
    ]);
    if(a.exists&&a.data().active===true)return "admin";
    if(r.exists&&r.data().active===true&&r.data().role==="director")return "director";
    if(r.exists&&r.data().active===true&&["staff","coinBarStaff"].includes(r.data().role))
      return "staff";
    // Existing BALI STAFF login/password uses preorderStaff, not staffRoles.
    // It gets ONLY permission to mark a paid bar voucher served.
    if(preorders.exists&&preorders.data().active===true&&preorders.data().role==="preorders")
      return "staff";
    return "guest";
  }
  const director=async req=>{
    const uid=verified(req);
    if(!await privileged(uid))fail("permission-denied","Нужен доступ директора или администратора.");
    return uid;
  };
  const operator=async req=>{
    const uid=verified(req),r=await role(uid);
    if(r==="guest")fail("permission-denied","Нет доступа к выдаче призов.");
    return uid;
  };
  async function recipient(sender,number){
    if(!validNumber(number))fail("invalid-argument","Введите шестизначный BALI ID.");
    const rows=await db.collection("baliIds").where("number","==",Number(number)).limit(1).get();
    if(rows.empty)fail("not-found","BALI ID не найдена.");
    const person=await nameAndId(rows.docs[0].id);
    if(person.uid===sender)fail("invalid-argument","Перевести себе нельзя.");
    return person;
  }
  const coinMe=api("coinMe",async req=>{
    const uid=verified(req);return {role:await role(uid)};
  });
  const coinCard=api("coinCard",async req=>{
    const uid=verified(req);
    const [person,snap,tier]=await Promise.all([
      nameAndId(uid),acct(uid).get(),db.doc("guestPrivileges/"+uid).get()
    ]);
    return {card:{uid,number:person.number,name:person.name,activated:true,agreed:true,
      tier:tier.exists?tier.data().tier:"Member",benefits:tier.exists?tier.data().benefits||[]:[],
      coinBalance:balance(snap)}};
  });
  const coinAdminCard=api("coinAdminCard",async req=>{
    await director(req);const uid=text(req.data?.uid,128);
    if(!validUid(uid))fail("invalid-argument","Неверный UID.");
    const [person,snap]=await Promise.all([nameAndId(uid),acct(uid).get()]);
    return {card:{...person,activated:true,coinBalance:balance(snap)}};
  });
  const coinHistory=api("coinHistory",async req=>{
    const uid=verified(req);await nameAndId(uid);
    const rows=await db.collection("baliCoinAccounts/"+uid+"/history")
      .orderBy("createdAt","desc").limit(50).get();
    return {items:rows.docs.map(x=>{
      const r=x.data();
      return {id:x.id,type:r.type,count:r.count,reason:r.reason||"",
        balance:r.balance,createdAt:r.createdAt?.toMillis?.()||null};
    })};
  });
  const coinRecipient=api("coinRecipient",async req=>{
    const uid=verified(req);await nameAndId(uid);
    const to=await recipient(uid,text(req.data?.number,6));
    return {recipient:{name:to.name,number:to.number}};
  });
  const coinTransfer=api("coinTransfer",async req=>{
    const uid=verified(req),to=await recipient(uid,text(req.data?.number,6));
    const sender=await nameAndId(uid);
    const amount=req.data?.amount,requestId=req.data?.requestId;
    const comment=text(req.data?.comment,100);
    if(!positive(amount)||!validNonce(requestId))fail("invalid-argument","Неверная сумма или ID перевода.");
    const op=nonceRef(uid,requestId),from=acct(uid),target=acct(to.uid),id=hash(uid+"|"+requestId);
    return db.runTransaction(async tx=>{
      const [previous,left,right]=await Promise.all([tx.get(op),tx.get(from),tx.get(target)]);
      if(previous.exists){
        const p=previous.data();
        if(p.action!=="transfer"||p.toUid!==to.uid||p.amount!==amount||p.comment!==comment)
          fail("already-exists","ID операции уже использован для других условий.");
        return {result:{ok:true,alreadyProcessed:true,balance:p.balance,recipientNumber:to.number}};
      }
      const before=balance(left),other=balance(right);
      if(before<amount)fail("failed-precondition","Недостаточно BALI COIN.");
      if(!coins(other+amount))fail("resource-exhausted","Лимит баланса получателя.");
      const at=TS.now(),after=before-amount;
      tx.set(from,{balance:after,updatedAt:at},{merge:true});
      tx.set(target,{balance:other+amount,updatedAt:at},{merge:true});
      tx.create(op,{action:"transfer",fromUid:uid,toUid:to.uid,amount,comment,balance:after,createdAt:at});
      tx.create(hist(uid,id+"_out"),{type:"transfer-out",count:amount,balance:after,
        reason:"Перевод на BALI ID "+to.number+(comment?" · "+comment:""),createdAt:at});
      tx.create(hist(to.uid,id+"_in"),{type:"transfer-in",count:amount,balance:other+amount,
        reason:"Перевод от BALI ID "+sender.number,createdAt:at});
      return {result:{ok:true,balance:after,recipientNumber:to.number,amount}};
    });
  });
  const coinChange=api("coinChange",async req=>{
    const staff=await director(req),uid=text(req.data?.uid,128),amount=req.data?.amount,
      action=req.data?.operation,reason=text(req.data?.reason,200),nonce=req.data?.requestId;
    if(!validUid(uid)||!positive(amount)||!["credit","debit"].includes(action)||
      reason.length<5||!validNonce(nonce))fail("invalid-argument","Проверьте гостя, сумму и причину.");
    await nameAndId(uid);
    const account=acct(uid),op=nonceRef(staff,nonce),id=hash(staff+"|"+nonce);
    return db.runTransaction(async tx=>{
      const [previous,old]=await Promise.all([tx.get(op),tx.get(account)]);
      if(previous.exists){
        const p=previous.data();
        if(p.action!=="manual"||p.uid!==uid||p.amount!==amount||p.operation!==action||p.reason!==reason)
          fail("already-exists","Этот ID операции занят.");
        return {result:{ok:true,alreadyProcessed:true,balance:p.balance}};
      }
      const before=balance(old),next=before+(action==="credit"?amount:-amount);
      if(!coins(next))fail("failed-precondition","Недостаточно BALI COIN или превышен лимит.");
      const at=TS.now();
      tx.set(account,{balance:next,updatedAt:at},{merge:true});
      tx.create(op,{action:"manual",uid,amount,operation:action,reason,balance:next,by:staff,createdAt:at});
      tx.create(hist(uid,id),{type:action,count:amount,balance:next,reason,by:staff,createdAt:at});
      return {result:{ok:true,balance:next}};
    });
  });
  const coinSetReward=api("coinSetReward",async req=>{
    const by=await director(req),campaignId=text(req.data?.campaignId,80),
      itemId=text(req.data?.itemId,80),kind=req.data?.kind,
      label=text(req.data?.label,100),amount=req.data?.amount;
    if(!validId(campaignId)||!validId(itemId)||!["EVENT","ACTIVITY"].includes(kind)||
      label.length<3||!Number.isSafeInteger(amount)||amount<0||amount>100000)
      fail("invalid-argument","Неверная награда.");
    await rewardRef(campaignId,kind,itemId).set({
      campaignId,itemId,kind,label,amount,active:amount>0,updatedBy:by,updatedAt:TS.now()
    });
    return {result:{ok:true,amount}};
  });
  async function creditOnce(uid,operationId,reason,validator){
    const account=acct(uid),op=nonceRef(uid,operationId),id=hash(uid+"|"+operationId);
    return db.runTransaction(async tx=>{
      // First check durable idempotency. A reward can be disabled or repriced
      // after it was successfully awarded; retrying must not credit it twice.
      const prior=await tx.get(op);
      if(prior.exists){
        const p=prior.data();
        if(p.action!=="award"||p.uid!==uid||p.reason!==reason)
          fail("already-exists","Несовпадающая повторная операция.");
        if(p.revoked===true)
          fail("failed-precondition","Начисление за это посещение отменено. Проверьте подтверждение входа.");
        return {result:{ok:true,alreadyProcessed:true,balance:p.balance,amount:p.amount}};
      }
      // Read reward, verified attendance and balance before any writes.
      const checked=await validator(tx),old=await tx.get(account);
      const next=balance(old)+checked.amount;
      if(!coins(next))fail("resource-exhausted","Превышен лимит BALI COIN.");
      const at=TS.now();
      tx.set(account,{balance:next,updatedAt:at},{merge:true});
      tx.create(op,{action:"award",uid,amount:checked.amount,reason,balance:next,createdAt:at});
      tx.create(hist(uid,id),{type:"credit",count:checked.amount,balance:next,reason,createdAt:at});
      return {result:{ok:true,balance:next,amount:checked.amount}};
    });
  }
  const coinClaimVisit=api("coinClaimVisit",async req=>{
    const uid=verified(req),campaignId=text(req.data?.campaignId,80),eventId=text(req.data?.eventId,80);
    if(!validId(campaignId)||!validId(eventId))fail("invalid-argument","Неверное мероприятие.");
    await nameAndId(uid);
    return creditOnce(uid,"visit_"+hash(campaignId+"|"+eventId), "Посещение "+eventId,async tx=>{
      const [entry,reward]=await Promise.all([
        tx.get(db.doc("brsmCampaigns/"+campaignId+"/entries/"+uid)),
        tx.get(rewardRef(campaignId,"EVENT",eventId))
      ]);
      if(!entry.exists||!Array.isArray(entry.data().visits)||
        !entry.data().visits.some(x=>x.eventId===eventId))
        fail("failed-precondition","Посещение не подтверждено.");
      if(!reward.exists||!reward.data().active||!positive(reward.data().amount))
        fail("failed-precondition","Награда за посещение не назначена.");
      return {amount:reward.data().amount};
    });
  });
  const coinAwardActivity=api("coinAwardActivity",async req=>{
    const staff=await director(req),campaignId=text(req.data?.campaignId,80),
      activityId=text(req.data?.activityId,80),nonce=req.data?.requestId;
    if(!validId(campaignId)||!validId(activityId)||!validNonce(nonce))
      fail("invalid-argument","Неверная активность.");
    const recipientCard=await recipient(staff,text(req.data?.number,6));
    return creditOnce(recipientCard.uid,"activity_"+staff+"_"+nonce,
      "Активность "+activityId,async tx=>{
        const reward=await tx.get(rewardRef(campaignId,"ACTIVITY",activityId));
        if(!reward.exists||!reward.data().active||!positive(reward.data().amount))
          fail("failed-precondition","Активность неактивна.");
        return {amount:reward.data().amount};
      });
  });
  const coinLotManage=api("coinLotManage",async req=>{
    const by=await director(req),campaignId=text(req.data?.campaignId,80),
      lotId=text(req.data?.lotId,80),name=text(req.data?.name,100),
      category=req.data?.category,price=req.data?.price,stock=req.data?.stock,active=req.data?.active===true;
    if(!validId(campaignId)||!validId(lotId)||name.length<3||
      !["bar","prize"].includes(category)||!positive(price)||!Number.isInteger(stock)||stock<0||stock>10000)
      fail("invalid-argument","Проверьте цену, количество и тип лота.");
    const ref=lotRef(campaignId,lotId);
    return db.runTransaction(async tx=>{
      const old=await tx.get(ref),sold=old.exists?old.data().sold||0:0;
      if(stock<sold)fail("failed-precondition","Нельзя уменьшить остаток ниже оплаченных.");
      if(old.exists&&old.data().category!==category)fail("failed-precondition","Тип лота нельзя менять.");
      tx.set(ref,{campaignId,lotId,name,category,price,stock,sold,active,updatedAt:TS.now(),updatedBy:by});
      return {result:{ok:true,lotId,remaining:stock-sold}};
    });
  });
  const coinLots=api("coinLots",async req=>{
    verified(req);const campaignId=text(req.data?.campaignId,80);
    if(!validId(campaignId))fail("invalid-argument","Неверная кампания.");
    const list=await db.collection("baliCoinLots").where("campaignId","==",campaignId).limit(100).get();
    return {lots:list.docs.map(d=>({...d.data(),remaining:Math.max(0,d.data().stock-d.data().sold)}))
      .filter(d=>d.active)};
  });
  const coinRedeemLot=api("coinRedeemLot",async req=>{
    const uid=verified(req),campaignId=text(req.data?.campaignId,80),
      lotId=text(req.data?.lotId,80),nonce=req.data?.requestId;
    if(!validId(campaignId)||!validId(lotId)||!validNonce(nonce))
      fail("invalid-argument","Неверная позиция или операция.");
    await nameAndId(uid);
    const id=hash(uid+"|"+nonce),op=nonceRef(uid,nonce),account=acct(uid),lot=lotRef(campaignId,lotId);
    const code="LOT:"+campaignId+":"+lotId+":"+randomBytes(16).toString("hex");
    const voucher=voucherRef(code),mine=ownVoucher(uid,id);
    return db.runTransaction(async tx=>{
      const [previous,old,listing]=await Promise.all([tx.get(op),tx.get(account),tx.get(lot)]);
      if(previous.exists){
        const p=previous.data();
        if(p.action!=="redeem"||p.campaignId!==campaignId||p.lotId!==lotId)
          fail("already-exists","ID операции уже занят.");
        return {result:{ok:true,alreadyProcessed:true,balance:p.balance,
          prize:p.name,voucher:p.voucher,category:p.category}};
      }
      if(!listing.exists||!listing.data().active)fail("failed-precondition","Эта позиция недоступна.");
      const item=listing.data();
      if(item.sold>=item.stock)fail("failed-precondition","Лот закончился.");
      const before=balance(old);
      if(before<item.price)fail("failed-precondition","Недостаточно BALI COIN.");
      const next=before-item.price,at=TS.now();
      const record={uid,campaignId,lotId,name:item.name,category:item.category,
        price:item.price,voucher:code,ownerVoucherId:id,status:"pending",createdAt:at,updatedAt:at};
      tx.set(account,{balance:next,updatedAt:at},{merge:true});
      tx.update(lot,{sold:item.sold+1,updatedAt:at});
      tx.create(voucher,record);tx.create(mine,record);
      tx.create(op,{action:"redeem",campaignId,lotId,balance:next,
        name:item.name,category:item.category,voucher:code,createdAt:at});
      tx.create(hist(uid,id),{type:"debit",count:item.price,balance:next,
        reason:"LOT:"+campaignId+":"+lotId+" "+item.name,createdAt:at});
      return {result:{ok:true,balance:next,prize:item.name,voucher:code,category:item.category}};
    });
  });
  const coinVouchers=api("coinVouchers",async req=>{
    const uid=verified(req);await nameAndId(uid);
    const rows=await db.collection("baliCoinAccounts/"+uid+"/vouchers").orderBy("createdAt","desc").limit(50).get();
    return {vouchers:rows.docs.map(x=>{
      const r=x.data();return {voucher:r.voucher,campaignId:r.campaignId,
        lotId:r.lotId,name:r.name,price:r.price,status:r.status};
    })};
  });
  const coinVoucherFulfill=api("coinVoucherFulfill",async req=>{
    const by=await operator(req),number=text(req.data?.number,6),code=text(req.data?.voucher,255);
    if(!validNumber(number)||!/^LOT:[a-zA-Z0-9_-]{3,80}:[a-zA-Z0-9_-]{3,80}:[a-f0-9]{32}$/.test(code))
      fail("invalid-argument","Неверный BALI ID или код.");
    const owner=await recipient(by,number); // recipient rejects self, as staff must not self-issue.
    const ref=voucherRef(code);
    return db.runTransaction(async tx=>{
      const v=await tx.get(ref);
      if(!v.exists||v.data().uid!==owner.uid||v.data().voucher!==code)
        fail("not-found","Оплаченный ваучер этой карты не найден.");
      if(v.data().status==="served")
        return {result:{ok:true,alreadyFulfilled:true,name:v.data().name}};
      const id=v.data().ownerVoucherId;
      if(typeof id!=="string"||!/^[a-f0-9]{64}$/.test(id))
        fail("failed-precondition","Неверная привязка ваучера.");
      const mine=ownVoucher(owner.uid,id),record=await tx.get(mine);
      if(!record.exists||record.data().voucher!==code)
        fail("failed-precondition","Нет записи покупки владельца.");
      const at=TS.now();
      tx.update(ref,{status:"served",servedBy:by,servedAt:at,updatedAt:at});
      tx.update(mine,{status:"served",servedBy:by,servedAt:at,updatedAt:at});
      return {result:{ok:true,name:v.data().name,category:v.data().category}};
    });
  });
  return {coinMe,coinCard,coinAdminCard,coinHistory,coinRecipient,coinTransfer,coinChange,
    coinSetReward,coinClaimVisit,coinAwardActivity,coinLotManage,coinLots,coinRedeemLot,
    coinVouchers,coinVoucherFulfill};
};
