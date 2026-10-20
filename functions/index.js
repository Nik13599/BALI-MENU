"use strict";
/* BALI ID wallet + guest-to-guest benefit transfers.
 * Only Cloud Functions have authority to alter guestWallets/bonusTransfers/
 * walletOperations. The static GitHub Pages website NEVER performs wallet writes.
 */
const {onCall,HttpsError}=require("firebase-functions/v2/https");
const admin=require("firebase-admin");
const {createHash,randomBytes}=require("node:crypto");
if(!admin.apps.length)admin.initializeApp();
const db=admin.firestore();
const TS=admin.firestore.Timestamp;
const REGION="europe-west1";
const api=(name,fn)=>onCall({region:REGION,maxInstances:12,timeoutSeconds:30},async req=>{
  const start=Date.now();
  try{
    const result=await fn(req);
    console.info(JSON.stringify({severity:"INFO",event:"bali.callable",operation:name,outcome:"ok",durationMs:Date.now()-start}));
    return result;
  }catch(error){
    // Never log request data, tokens, UID, recipient numbers or exception messages.
    const code=typeof error?.code==="string"&&/^[a-z-]{1,40}$/.test(error.code)?error.code:"internal";
    console.error(JSON.stringify({severity:code==="internal"?"ERROR":"WARNING",event:"bali.callable",operation:name,outcome:"error",code,durationMs:Date.now()-start}));
    throw error;
  }
});
const fail=(code,message)=>{throw new HttpsError(code,message);};
const verified=req=>{
  const uid=req.auth?.uid;
  if(!uid||req.auth.token.email_verified!==true)fail("unauthenticated","Войдите в подтверждённый аккаунт BALI.");
  return uid;
};
const number6=value=>{
  if(typeof value!=="string"||!/^\d{6}$/.test(value)||Number(value)<1)
    fail("invalid-argument","Укажите шестизначный BALI ID.");
  return Number(value);
};
const formatNumber=value=>String(value).padStart(6,"0");
const textValue=(v,max=90)=>typeof v==="string"?v.trim().slice(0,max):"";
const digest=value=>createHash("sha256").update(value).digest("hex");
const kinds=new Set(["shot","cocktail","hookah","entry"]);
const historyPage=25;
async function nameAndId(uid){
  const [person,id]=await Promise.all([db.doc("users/"+uid).get(),db.doc("baliIds/"+uid).get()]);
  if(!person.exists||!id.exists)fail("failed-precondition","BALI ID не активирована.");
  const number=id.data().number;
  if(!Number.isSafeInteger(number)||number<1||number>999999)
    fail("failed-precondition","Номер карты не соответствует шестизначному формату.");
  return {uid,number:formatNumber(number),name:textValue(person.data().name)||"Гость BALI"};
}
async function findRecipient(uid,number){
  const ids=await db.collection("baliIds").where("number","==",number).limit(1).get();
  if(ids.empty)fail("not-found","Получатель с таким BALI ID не найден.");
  if(ids.docs[0].id===uid)fail("failed-precondition","Нельзя перевести бонусы самому себе.");
  const recipient=await nameAndId(ids.docs[0].id);
  if(Number(recipient.number)!==number)fail("failed-precondition","Получатель изменился. Повторите поиск.");
  return recipient;
}
async function limitPreview(uid){
  const ref=db.doc("walletLookupLimits/"+uid);
  await db.runTransaction(async tx=>{
    const old=await tx.get(ref),current=Date.now(),data=old.exists?old.data():{};
    const beginning=Number(data.startedAtMillis)||0;
    const fresh=current-beginning>60000;
    const count=fresh?1:(Number(data.count)||0)+1;
    if(count>12)fail("resource-exhausted","Слишком много поисков. Повторите через минуту.");
    tx.set(ref,{startedAtMillis:fresh?current:beginning,count,updatedAt:TS.now()});
  });
}
/* A recipient preview contains ONLY the BALI display name and six-digit ID.
 * No email, phone, UID or privileges of other guests are returned. */
exports.previewBaliRecipient=api("previewBaliRecipient",async req=>{
  const uid=verified(req),number=number6(req.data?.number);
  await nameAndId(uid);
  await limitPreview(uid);
  const recipient=await findRecipient(uid,number);
  return {number:recipient.number,name:recipient.name};
});
const wallet=(uid,snap)=>{
  const d=snap.exists?snap.data():{};
  return {uid,grants:Array.isArray(d.grants)?d.grants:[]};
};
function isTransferable(g,now){
  if(!g||!kinds.has(g.kind)||g.transferable!==true||g.unlimited===true||g.eventRef)
    return false;
  if(!Number.isInteger(g.remaining)||g.remaining<1)return false;
  if(g.expiresAt!=null){
    if(typeof g.expiresAt.toMillis!=="function"||g.expiresAt.toMillis()<=now)return false;
  }
  return typeof g.id==="string"&&g.id.length>0;
}
exports.transferBaliBenefits=api("transferBaliBenefits",async req=>{
  const uid=verified(req);
  const toNumber=number6(req.data?.number);
  const requestId=req.data?.requestId;
  if(typeof requestId!=="string"||!/^[a-f0-9]{32}$/.test(requestId))
    fail("invalid-argument","Ошибка идентификатора перевода.");
  const payload=req.data?.items;
  if(!Array.isArray(payload)||payload.length<1||payload.length>12)
    fail("invalid-argument","Выберите от 1 до 12 позиций.");
  const unique=new Set(),items=[];
  let total=0;
  for(const entry of payload){
    const grantId=entry?.grantId,quantity=entry?.quantity;
    if(typeof grantId!=="string"||grantId.length>95||!grantId.trim()||
      !Number.isInteger(quantity)||quantity<1||quantity>100||unique.has(grantId))
      fail("invalid-argument","Некорректные бонусы или количество.");
    unique.add(grantId);items.push({grantId,quantity});total+=quantity;
  }
  if(total>100)fail("invalid-argument","За один раз можно отправить до 100 бонусов.");
  // Never accept a target UID, sender UID, wallet balances or the recipient's
  // name from the browser. Resolve the owner of a six-digit card on the server.
  const recipient=await findRecipient(uid,toNumber);
  const fromRef=db.doc("guestWallets/"+uid),toRef=db.doc("guestWallets/"+recipient.uid);
  const fromIdRef=db.doc("baliIds/"+uid),toIdRef=db.doc("baliIds/"+recipient.uid);
  const fromProfileRef=db.doc("users/"+uid),toProfileRef=db.doc("users/"+recipient.uid);
  const transferId=digest(uid+":"+requestId).slice(0,40);
  const transferRef=db.doc("bonusTransfers/"+transferId);
  const debitRef=db.doc("walletOperations/"+transferId+"_out");
  const creditRef=db.doc("walletOperations/"+transferId+"_in");
  const result=await db.runTransaction(async tx=>{
    // ALL reads precede the first write, allowing Firestore to retry safely
    // if two devices try to spend the same bonus concurrently.
    const [previous,fromSnap,toSnap,fromId,toId,fromProfile,toProfile]=await Promise.all([
      tx.get(transferRef),tx.get(fromRef),tx.get(toRef),
      tx.get(fromIdRef),tx.get(toIdRef),tx.get(fromProfileRef),tx.get(toProfileRef)
    ]);
    if(previous.exists){
      const done=previous.data();
      if(done.fromUid!==uid||done.toUid!==recipient.uid||done.toNumber!==recipient.number||
        JSON.stringify(done.requestItems)!==JSON.stringify(items))
        fail("already-exists","Идентификатор запроса уже был использован.");
      return {ok:true,alreadyProcessed:true,transferId};
    }
    if(!fromProfile.exists||!toProfile.exists||
      !fromId.exists||!toId.exists||
      toId.data().number!==toNumber||fromId.data().number===toNumber)
      fail("failed-precondition","Карта отправителя или получателя недоступна.");
    const source=wallet(uid,fromSnap),target=wallet(recipient.uid,toSnap);
    if(target.grants.length+items.length>80)
      fail("resource-exhausted","У получателя слишком много начислений. Обратитесь к администрации.");
    const at=TS.now(),millis=at.toMillis(),transferred=[];
    for(const [index,part] of items.entries()){
      const grant=source.grants.find(g=>g.id===part.grantId);
      if(!isTransferable(grant,millis))fail("failed-precondition","Один из бонусов недоступен для передачи.");
      if(grant.remaining<part.quantity)fail("failed-precondition","Недостаточно бонусов. Обновите остатки.");
      grant.remaining-=part.quantity;
      const newId="transfer_"+digest(transferId+":"+index).slice(0,28);
      const received={
        id:newId,kind:grant.kind,remaining:part.quantity,originalCount:part.quantity,
        unlimited:false,transferable:true,eventRef:null,expiresAt:grant.expiresAt||null,
        issuedAt:at,issuedBy:uid,sourceTransferId:transferId,
        note:textValue(grant.note||"",200)
      };
      target.grants.push(received);
      transferred.push({kind:grant.kind,quantity:part.quantity,sourceGrantId:part.grantId,newGrantId:newId});
    }
    const senderName=textValue(fromProfile.data().name)||"Гость BALI";
    const receiverName=textValue(toProfile.data().name)||"Гость BALI";
    const fromNumber=formatNumber(fromId.data().number);
    const toNumberText=formatNumber(toId.data().number);
    const entry={
      fromUid:uid,toUid:recipient.uid,
      fromNumber,toNumber:toNumberText,fromName:senderName,toName:receiverName,
      items:transferred,requestItems:items,createdAt:at,requestId,
      total,source:"guest-transfer",status:"completed"
    };
    tx.set(fromRef,{...source,updatedAt:at});
    tx.set(toRef,{...target,updatedAt:at});
    tx.create(transferRef,entry);
    // Mirrored, immutable-for-guests ledger rows for both histories.
    const common={
      source:"guest-transfer",transferId,items:transferred,
      fromNumber,toNumber:toNumberText,fromName:senderName,toName:receiverName,
      createdAt:at
    };
    tx.create(debitRef,{...common,guestUid:uid,type:"transfer-out",kind:"mixed",count:total});
    tx.create(creditRef,{...common,guestUid:recipient.uid,type:"transfer-in",kind:"mixed",count:total});
    return {ok:true,alreadyProcessed:false,transferId};
  },{maxAttempts:5});
  return result;
});
exports.listMyBaliHistory=api("listMyBaliHistory",async req=>{
  const uid=verified(req);
  const after=textValue(req.data?.after,95);
  if(after&&!/^[a-zA-Z0-9_-]{8,95}$/.test(after))fail("invalid-argument","Некорректная страница истории.");
  let q=db.collection("walletOperations").where("guestUid","==",uid)
    .orderBy("createdAt","desc").limit(historyPage);
  if(after){
    const snap=await db.doc("walletOperations/"+after).get();
    if(!snap.exists||snap.data().guestUid!==uid)fail("not-found","Страница истории не найдена.");
    q=q.startAfter(snap);
  }
  const results=await q.get();
  const rows=results.docs.map(s=>{
    const d=s.data();
    const type=String(d.type||"");
    const components=Array.isArray(d.items)
      ?d.items.map(v=>({kind:String(v.kind||""),quantity:Number(v.quantity)||0})).slice(0,12):[];
    return {
      id:s.id,type,kind:textValue(d.kind,25),count:Number.isFinite(d.count)?d.count:null,
      percent:Number.isFinite(d.percent)?d.percent:null,reason:textValue(d.reason||d.note,200),
      items:components,fromNumber:textValue(d.fromNumber,6),toNumber:textValue(d.toNumber,6),
      fromName:textValue(d.fromName),toName:textValue(d.toName),
      createdAt:d.createdAt?.toMillis?.()||0
    };
  });
  return {items:rows,nextCursor:results.size===historyPage?results.docs[results.docs.length-1].id:null};
});
async function privileged(uid){
  const [a,s]=await Promise.all([db.doc("admins/"+uid).get(),db.doc("staffRoles/"+uid).get()]);
  return Boolean(a.exists&&a.data().active===true||
    s.exists&&s.data().active===true&&s.data().role==="director");
}
/* Staff issue tangible benefits separately from cosmetic level descriptions. */
exports.issueBaliQuantity=api("issueBaliQuantity",async req=>{
  const staffUid=verified(req);
  if(!await privileged(staffUid))fail("permission-denied","Начислять бонусы может только руководство.");
  const guestUid=textValue(req.data?.uid,128),kind=req.data?.kind;
  const quantity=req.data?.quantity,transferable=req.data?.transferable===true;
  const reason=textValue(req.data?.reason,200);
  if(!/^[a-zA-Z0-9_-]{12,128}$/.test(guestUid)||!kinds.has(kind)||
    !Number.isInteger(quantity)||quantity<1||quantity>500||reason.length<5)
    fail("invalid-argument","Укажите гостя, вид, количество и причину от 5 символов.");
  const ref=db.doc("guestWallets/"+guestUid),guestRef=db.doc("baliIds/"+guestUid);
  const id=randomBytes(16).toString("hex"),opRef=db.doc("walletOperations/"+id);
  await db.runTransaction(async tx=>{
    const [guest,old]=await Promise.all([tx.get(guestRef),tx.get(ref)]);
    if(!guest.exists)fail("not-found","BALI ID гостя не найдена.");
    const w=wallet(guestUid,old);
    if(w.grants.length>=80)fail("resource-exhausted","Превышено максимальное число начислений.");
    const at=TS.now();
    w.grants.push({
      id,kind,remaining:quantity,originalCount:quantity,transferable,
      unlimited:false,eventRef:null,expiresAt:null,issuedAt:at,issuedBy:staffUid,note:reason
    });
    tx.set(ref,{...w,updatedAt:at});
    tx.create(opRef,{
      type:"grant",guestUid,kind,count:quantity,reason,staffUid,
      transferable,createdAt:at
    });
  });
  return {ok:true,grantId:id};
});
