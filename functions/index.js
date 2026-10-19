"use strict";
// BALI Privilege Control: all balance/attendance mutations happen ONLY here.
// Firebase Auth and Firestore are required. Never trust role claims from the UI.
const {onCall,HttpsError}=require("firebase-functions/v2/https");
const admin=require("firebase-admin");
const {randomBytes,createHash}=require("node:crypto");
const QRCode=require("qrcode");
admin.initializeApp();
const db=admin.firestore();
const region="europe-west1";
const callable=(handler)=>onCall({region,maxInstances:20,timeoutSeconds:30,invoker:"public"},handler);
const bad=(reason)=>{throw new HttpsError("invalid-argument",reason);};
const hash=(text)=>createHash("sha256").update(text).digest("hex");
const trimmed=(v,max=150)=>typeof v==="string"?v.trim().slice(0,max):"";
const now=()=>admin.firestore.Timestamp.now();
const serverNow=()=>Date.now();
const verified=(req)=>{
  if(!req.auth?.uid||req.auth.token.email_verified!==true)throw new HttpsError("unauthenticated","Требуется подтверждённый Google аккаунт.");
  return req.auth.uid;
};
async function roleFor(uid){
  const [adminRole,staffRole]=await Promise.all([db.doc("admins/"+uid).get(),db.doc("staffRoles/"+uid).get()]);
  if(adminRole.exists&&adminRole.data().active===true)return "admin";
  if(staffRole.exists&&staffRole.data().active===true&&["director","bartender","hostess"].includes(staffRole.data().role))return staffRole.data().role;
  return "guest";
}
const requireRole=async(req,allowed)=>{
  const uid=verified(req),role=await roleFor(uid);
  if(!allowed.includes(role))throw new HttpsError("permission-denied","Недостаточно прав.");
  return {uid,role};
};
function walletOrEmpty(uid,snapshot){
  const data=snapshot.exists?snapshot.data():{};
  return {uid,grants:Array.isArray(data.grants)?data.grants:[],updatedAt:data.updatedAt||null};
}
function active(g,millis,eventRef){
  const expiry=g.expiresAt?.toMillis?.()||null;
  return (expiry===null||expiry>millis)&&(!g.eventRef||g.eventRef===eventRef);
}
function sanitizeGrant(g,millis){
  return {id:g.id,kind:g.kind,remaining:g.remaining??null,unlimited:!!g.unlimited,percent:g.percent||null,appliesTo:g.appliesTo||null,eventRef:g.eventRef||null,expiresAt:g.expiresAt?.toMillis?.()||null,active:active(g,millis,null)&&((g.remaining??1)>0||g.unlimited)};
}
const publicWallet=(w)=>({grants:w.grants.map(g=>sanitizeGrant(g,serverNow()))});
function validCount(input,max=500){
  if(!Number.isInteger(input)||input<1||input>max)bad("Неверное количество.");
  return input;
}
function expiresFrom(input){
  if(input===null||input===undefined||input==="")return null;
  if(typeof input!=="string"||!/^\d{4}-\d{2}-\d{2}$/.test(input))bad("Укажите дату окончания в формате YYYY-MM-DD.");
  const stamp=Date.parse(input+"T23:59:59+03:00");
  if(!Number.isFinite(stamp)||stamp<=Date.now()||stamp>Date.now()+5*365*86400000)bad("Дата окончания должна быть в будущем (не более пяти лет).");
  return admin.firestore.Timestamp.fromMillis(stamp);
}
async function QRDoc(token){
  if(!/^[A-Za-z0-9_-]{32,96}$/.test(token||""))bad("Некорректный QR.");
  return db.doc("qrSessions/"+hash(token));
}
async function readQR(token,tx){
  const ref=await QRDoc(token);
  const snap=tx?await tx.get(ref):await ref.get();
  if(!snap.exists||snap.data().expiresAt.toMillis()<=serverNow())throw new HttpsError("failed-precondition","QR-код истёк. Попросите гостя открыть новый.");
  if(snap.data().usedAt)throw new HttpsError("already-exists","QR уже использован. Попросите гостя обновить код.");
  return {ref,uid:snap.data().uid};
}
async function guestBasics(uid){
  const [user,id,priv]=await Promise.all([db.doc("users/"+uid).get(),db.doc("baliIds/"+uid).get(),db.doc("guestPrivileges/"+uid).get()]);
  if(!user.exists||!id.exists)throw new HttpsError("not-found","Карта гостя не активирована.");
  return {uid,name:user.data().name||"Гость BALI",number:String(id.data().number).padStart(6,"0"),tier:priv.data()?.tier||"Member"};
}
exports.myStaffRole=callable(async req=>{
  const uid=verified(req);
  return {role:await roleFor(uid)};
});
exports.issueGuestQr=callable(async req=>{
  const uid=verified(req);
  await guestBasics(uid);
  const token=randomBytes(32).toString("base64url");
  const ref=await QRDoc(token);
  const time=serverNow();
  await db.runTransaction(async tx=>{
    const gate=db.doc("qrIssuance/"+uid),old=await tx.get(gate);
    if(old.exists&&time-(old.data().issuedAt?.toMillis?.()||0)<10000)
      throw new HttpsError("resource-exhausted","Подождите 10 секунд перед обновлением QR.");
    tx.set(gate,{issuedAt:admin.firestore.Timestamp.fromMillis(time)});
    tx.create(ref,{uid,createdAt:admin.firestore.Timestamp.fromMillis(time),expiresAt:admin.firestore.Timestamp.fromMillis(time+90000),usedAt:null});
  });
  const qrDataUrl=await QRCode.toDataURL("BALI:"+token,{errorCorrectionLevel:"M",width:320,margin:2,color:{dark:"#0B1011",light:"#FFFFFF"}});
  return {qrDataUrl,token,expiresAt:time+90000};
});
exports.scanGuestQr=callable(async req=>{
  await requireRole(req,["bartender","hostess","director","admin"]);
  const token=trimmed(req.data?.token,150).replace(/^BALI:/i,"");
  const pass=await readQR(token);
  const [guest,wallet]=await Promise.all([guestBasics(pass.uid),db.doc("guestWallets/"+pass.uid).get()]);
  return {guest,wallet:publicWallet(walletOrEmpty(pass.uid,wallet))};
});
exports.findGuestByNumber=callable(async req=>{
  await requireRole(req,["director","admin"]);
  const number=Number(req.data?.number);
  if(!Number.isSafeInteger(number)||number<1)bad("Введите номер BALI ID.");
  const ids=await db.collection("baliIds").where("number","==",number).limit(1).get();
  if(ids.empty)throw new HttpsError("not-found","Гость с таким номером не найден.");
  const uid=ids.docs[0].id;
  const [guest,wallet]=await Promise.all([guestBasics(uid),db.doc("guestWallets/"+uid).get()]);
  return {guest,wallet:publicWallet(walletOrEmpty(uid,wallet))};
});
exports.grantGuestBenefit=callable(async req=>{
  const staff=await requireRole(req,["director","admin"]);
  const uid=trimmed(req.data?.uid,128);
  if(!/^[A-Za-z0-9_-]{12,128}$/.test(uid))bad("Выберите гостя.");
  const kind=trimmed(req.data?.kind,30);
  if(!["cocktail","shot","hookah","entry","discount"].includes(kind))bad("Неверный вид привилегии.");
  const count=kind==="discount"?null:validCount(req.data?.count);
  const percent=kind==="discount"?validCount(req.data?.percent,100):null;
  const unlimited=kind==="entry"&&req.data?.unlimited===true;
  if(unlimited&&!req.data?.expiresOn)bad("Для безлимитного входа укажите срок.");
  const expiresAt=expiresFrom(req.data?.expiresOn);
  const eventRef=trimmed(req.data?.eventRef,100)||null;
  const appliesTo=kind==="discount"?trimmed(req.data?.appliesTo,30):null;
  if(kind==="discount"&&!["kitchen","bar","all"].includes(appliesTo))bad("Укажите область действия скидки.");
  const note=trimmed(req.data?.note,200);
  const opId=randomBytes(16).toString("hex");
  const walletRef=db.doc("guestWallets/"+uid),opRef=db.doc("walletOperations/"+opId),guestRef=db.doc("baliIds/"+uid);
  await db.runTransaction(async tx=>{
    const [exists,old]=await Promise.all([tx.get(guestRef),tx.get(walletRef)]);
    if(!exists.exists)throw new HttpsError("not-found","BALI ID гостя не найден.");
    const wallet=walletOrEmpty(uid,old);
    if(wallet.grants.length>=80)throw new HttpsError("resource-exhausted","В карте слишком много начислений. Требуется архивирование.");
    wallet.grants.push({id:opId,kind,remaining:unlimited||kind==="discount"?null:count,originalCount:count,unlimited,percent,appliesTo,eventRef,expiresAt,issuedAt:now(),issuedBy:staff.uid,note});
    wallet.updatedAt=now();
    tx.set(walletRef,wallet);
    tx.create(opRef,{type:"grant",guestUid:uid,staffUid:staff.uid,staffRole:staff.role,kind,count:unlimited?null:count,percent,expiresAt,reason:note,createdAt:now()});
  });
  return {ok:true,id:opId};
});
exports.useGuestBenefit=callable(async req=>{
  const staff=await requireRole(req,["bartender","hostess","director","admin"]);
  const action=trimmed(req.data?.action,30);
  if(!["redeem","discount","entry"].includes(action))bad("Некорректное действие.");
  if(staff.role==="bartender"&&action==="entry")throw new HttpsError("permission-denied","Вход подтверждает только хостес или директор.");
  if(staff.role==="hostess"&&action!=="entry")throw new HttpsError("permission-denied","Хостес не списывает барные бонусы.");
  const token=trimmed(req.data?.token,150).replace(/^BALI:/i,"");
  const count=action==="redeem"?validCount(req.data?.count,50):1;
  const kind=trimmed(req.data?.kind,30);
  if(action==="redeem"&&!["cocktail","shot","hookah"].includes(kind))bad("Неверный тип бонуса.");
  const eventRef=trimmed(req.data?.eventRef,100)||null;
  const receipt=trimmed(req.data?.receipt,80);
  if(action==="discount"&&!receipt)bad("Укажите номер чека для подтверждения скидки.");
  const opId=trimmed(req.data?.operationId,80);
  if(!/^[A-Za-z0-9_-]{12,80}$/.test(opId))bad("Ошибка идентификатора операции.");
  const opRef=db.doc("walletOperations/"+opId);
  const outcome=await db.runTransaction(async tx=>{
    const done=await tx.get(opRef);
    if(done.exists){
      if(done.data().staffUid!==staff.uid)throw new HttpsError("already-exists","Номер операции уже занят.");
      return {ok:true,alreadyProcessed:true};
    }
    const pass=await readQR(token,tx);
    const walletRef=db.doc("guestWallets/"+pass.uid);
    const snapshot=await tx.get(walletRef);
    const wallet=walletOrEmpty(pass.uid,snapshot);
    const current=serverNow();
    const candidates=wallet.grants.filter(g=>active(g,current,eventRef));
    let detail={},attendanceRef=null,receiptRef=null;
    if(action==="redeem"){
      let available=candidates.filter(g=>g.kind===kind&&!g.unlimited&&g.remaining>0).reduce((s,g)=>s+g.remaining,0);
      if(available<count)throw new HttpsError("failed-precondition","Недостаточно доступных бонусов.");
      let todo=count;
      for(const g of wallet.grants){
        if(!todo)break;
        if(g.kind!==kind||!active(g,current,eventRef)||!g.remaining)continue;
        const taken=Math.min(todo,g.remaining);
        g.remaining-=taken;todo-=taken;
      }
      detail={kind,count};
    }else if(action==="entry"){
      const visitDay=new Intl.DateTimeFormat("sv-SE",{timeZone:"Europe/Minsk",year:"numeric",month:"2-digit",day:"2-digit"}).format(new Date());
      const entryScope=eventRef||visitDay;
      attendanceRef=db.doc("guestEntries/"+hash(pass.uid+":"+entryScope));
      const previous=await tx.get(attendanceRef);
      if(previous.exists)throw new HttpsError("already-exists","Вход на это мероприятие/дату уже отмечен.");
      const grant=wallet.grants.find(g=>g.kind==="entry"&&active(g,current,eventRef)&&(g.unlimited||g.remaining>0));
      if(!grant)throw new HttpsError("failed-precondition","Свободный вход недоступен или истёк.");
      if(!grant.unlimited)grant.remaining-=1;
      detail={kind:"entry",count:1,eventRef,visitDay};
      tx.create(attendanceRef,{uid:pass.uid,eventRef,visitDay,staffUid:staff.uid,createdAt:now(),operationId:opId});
    }else{
      const grantId=trimmed(req.data?.grantId,64);
      const grant=wallet.grants.find(g=>g.id===grantId&&g.kind==="discount"&&active(g,current,eventRef));
      if(!grant)throw new HttpsError("failed-precondition","Скидка не найдена или срок её действия истёк.");
      receiptRef=db.doc("discountReceipts/"+hash(pass.uid+":"+receipt.toLowerCase()));
      const prev=await tx.get(receiptRef);
      if(prev.exists)throw new HttpsError("already-exists","Скидка на этот чек уже подтверждена.");
      detail={kind:"discount",percent:grant.percent,appliesTo:grant.appliesTo,receipt,grantId};
      tx.create(receiptRef,{uid:pass.uid,receipt,percent:grant.percent,staffUid:staff.uid,createdAt:now(),operationId:opId});
    }
    wallet.updatedAt=now();
    tx.set(walletRef,wallet);
    tx.update(pass.ref,{usedAt:now(),usedBy:staff.uid});
    tx.create(opRef,{type:action,guestUid:pass.uid,staffUid:staff.uid,staffRole:staff.role,...detail,createdAt:now()});
    return {ok:true,detail,wallet:publicWallet(wallet)};
  });
  return outcome;
});
exports.adjustGuestBenefit=callable(async req=>{
  const staff=await requireRole(req,["director","admin"]);
  const uid=trimmed(req.data?.uid,128),kind=trimmed(req.data?.kind,30),count=validCount(req.data?.count,500),reason=trimmed(req.data?.reason,200);
  if(!/^[A-Za-z0-9_-]{12,128}$/.test(uid)||!["cocktail","shot","hookah","entry"].includes(kind)||reason.length<5)bad("Укажите гостя, тип, количество и причину (не менее 5 символов).");
  const walletRef=db.doc("guestWallets/"+uid),opId=randomBytes(16).toString("hex");
  await db.runTransaction(async tx=>{
    const snap=await tx.get(walletRef),wallet=walletOrEmpty(uid,snap);
    let todo=count;
    for(const g of wallet.grants){
      if(!todo)break;
      if(g.kind!==kind||g.unlimited||!active(g,serverNow(),null)||!g.remaining)continue;
      const amount=Math.min(todo,g.remaining);g.remaining-=amount;todo-=amount;
    }
    if(todo)throw new HttpsError("failed-precondition","Не хватает бонусов для ручного списания.");
    wallet.updatedAt=now();tx.set(walletRef,wallet);
    tx.create(db.doc("walletOperations/"+opId),{type:"manual-debit",kind,count,guestUid:uid,staffUid:staff.uid,staffRole:staff.role,reason,createdAt:now()});
  });
  return {ok:true};
});
exports.listPrivilegeAudit=callable(async req=>{
  await requireRole(req,["director","admin"]);
  const rows=await db.collection("walletOperations").orderBy("createdAt","desc").limit(60).get();
  return {items:rows.docs.map(row=>{
    const d=row.data();return {id:row.id,type:d.type,guestUid:d.guestUid,staffUid:d.staffUid,staffRole:d.staffRole,kind:d.kind||"",count:d.count??null,percent:d.percent??null,receipt:d.receipt||"",reason:d.reason||"",createdAt:d.createdAt?.toMillis?.()||0};
  })};
});
exports.setBaliStaffRole=callable(async req=>{
  await requireRole(req,["director","admin"]);
  const uid=trimmed(req.data?.uid,128),role=trimmed(req.data?.role,24);
  if(!/^[A-Za-z0-9_-]{12,128}$/.test(uid)||!["bartender","hostess"].includes(role))bad("Можно назначить только бармена или хостес.");
  const active=req.data?.active===true;
  await db.doc("staffRoles/"+uid).set({role,active,updatedAt:now()},{merge:true});
  return {ok:true};
});
