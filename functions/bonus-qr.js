"use strict";
/* Secure BALI ID QR vouchers. All cards are merely bearer links; the server
   owns redemption state, balances, staff permissions and immutable receipts. */
const {randomBytes,createHash}=require("node:crypto");
const QRCode=require("qrcode");
const DAY=24*60*60*1000;
const builtin={entry:"Бесплатные входы",shot:"Шоты",cocktail:"Коктейли",hookah:"Кальяны"};
const tokenOk=v=>typeof v==="string"&&/^[a-f0-9]{48}$/.test(v);
const reqOk=v=>typeof v==="string"&&/^[a-f0-9]{32}$/.test(v);
const digest=s=>createHash("sha256").update(s).digest("hex");
const clip=(v,max=100)=>typeof v==="string"?v.trim().slice(0,max):"";
module.exports=({api,admin,db,TS,verified,privileged,fail,nameAndId,wallet})=>{
  async function staff(req){
    const uid=verified(req);
    if(!await privileged(uid))fail("permission-denied","Операция доступна только руководству BALI.");
    return uid;
  }
  async function kindInfo(kind){
    if(typeof kind!=="string"||!/^[a-z][a-z0-9_-]{1,24}$/.test(kind))
      fail("invalid-argument","Неверный вид бонусов.");
    if(Object.hasOwn(builtin,kind))return {id:kind,name:builtin[kind],emoji:""};
    const snap=await db.doc("baliBonusKinds/"+kind).get();
    if(!snap.exists||snap.data().active!==true)fail("not-found","Вид бонусов не найден или отключён.");
    return {id:kind,name:clip(snap.data().name,42),emoji:clip(snap.data().emoji,8)};
  }
  const number=Number.isInteger;
  const codeUrl=t=>"https://nik13599.github.io/BALI-MENU/?baliQrBonus="+t+"#id";
  async function images(codes){
    return Promise.all(codes.map(async x=>({...x,qrDataUrl:await QRCode.toDataURL(codeUrl(x.code),{
      errorCorrectionLevel:"M",width:240,margin:2,color:{dark:"#0b0d0e",light:"#ffffff"}
    })})));
  }
  const expire=at=>TS.fromMillis(at.toMillis()+30*DAY);
  const activeGrant=(g,now)=>g&&Number.isInteger(g.remaining)&&g.remaining>0&&
    !g.unlimited&&(!g.expiresAt||typeof g.expiresAt.toMillis==="function"&&g.expiresAt.toMillis()>now);
  const balance=(w,kind,now)=>w.grants.filter(g=>g.kind===kind&&activeGrant(g,now))
    .reduce((s,g)=>s+g.remaining,0);
  const output=(doc)=>{
    const d=doc.data();
    return {code:doc.id,kind:d.kind,name:d.name,action:d.action,mode:d.mode,
      quantity:d.quantity,maxQuantity:d.maxQuantity,active:d.active!==false,
      used:d.used===true,uses:d.uses||0,createdAt:d.createdAt?.toMillis?.()||0};
  };
  return {
    listBaliBonusKinds:api("listBaliBonusKinds",async req=>{
      verified(req);
      const list=Object.entries(builtin).map(([id,name])=>({id,name,emoji:""}));
      const snap=await db.collection("baliBonusKinds").limit(100).get();
      return {kinds:list.concat(snap.docs.filter(x=>x.data().active===true)
        .map(x=>({id:x.id,name:clip(x.data().name,42),emoji:clip(x.data().emoji,8)})))};
    }),
    createBaliBonusKind:api("createBaliBonusKind",async req=>{
      const uid=await staff(req);
      const kind=clip(req.data?.kind,25).toLowerCase(),name=clip(req.data?.name,42);
      const emoji=clip(req.data?.emoji,8);
      if(!/^[a-z][a-z0-9_-]{1,24}$/.test(kind)||Object.hasOwn(builtin,kind)||
        name.length<2||name.length>42||emoji.length>8)
        fail("invalid-argument","Введите новый латинский код и название вида бонусов.");
      await db.doc("baliBonusKinds/"+kind).create({name,emoji,active:true,createdBy:uid,createdAt:TS.now()})
        .catch(e=>{if(e?.code===6||e?.code==="already-exists")fail("already-exists","Этот вид уже существует.");throw e;});
      return {ok:true,id:kind,name,emoji};
    }),
    createBaliQrBatch:api("createBaliQrBatch",async req=>{
      const uid=await staff(req);
      const input=req.data||{};
      const kind=await kindInfo(input.kind),action=input.action,mode=input.mode;
      const quantity=input.quantity,count=input.count,cooldownSeconds=input.cooldownSeconds??30;
      if(!["credit","debit"].includes(action)||!["once","repeat"].includes(mode)||
        !number(quantity)||quantity<1||quantity>999||!number(count)||count<1||count>100||
        (mode==="repeat"&&count!==1)||!number(cooldownSeconds)||cooldownSeconds<5||cooldownSeconds>3600)
        fail("invalid-argument","Укажите действие, режим, количество 1–999 и пакет 1–100.");
      const at=TS.now(),batch=db.batch(),result=[];
      for(let i=0;i<count;i++){
        const code=randomBytes(24).toString("hex"),ref=db.doc("baliBonusQRCodes/"+code);
        batch.create(ref,{kind:kind.id,name:kind.name,action,mode,quantity,
          maxQuantity:quantity,active:true,used:false,uses:0,cooldownSeconds,
          createdAt:at,createdBy:uid});
        result.push({code,kind:kind.id,name:kind.name,action,mode,quantity,url:codeUrl(code)});
      }
      await batch.commit();
      return {ok:true,codes:await images(result)};
    }),
    listBaliQrCodes:api("listBaliQrCodes",async req=>{
      await staff(req);
      const snap=await db.collection("baliBonusQRCodes").orderBy("createdAt","desc").limit(50).get();
      return {codes:snap.docs.map(output)};
    }),
    revokeBaliQrCode:api("revokeBaliQrCode",async req=>{
      const uid=await staff(req),code=req.data?.code;
      if(!tokenOk(code))fail("invalid-argument","Неверный QR-код.");
      const ref=db.doc("baliBonusQRCodes/"+code);
      await db.runTransaction(async tx=>{
        const row=await tx.get(ref);
        if(!row.exists)fail("not-found","QR-код не найден.");
        tx.update(ref,{active:false,revokedAt:TS.now(),revokedBy:uid});
      });
      return {ok:true};
    }),
    previewBaliBonusQR:api("previewBaliBonusQR",async req=>{
      const uid=verified(req),code=req.data?.code;
      if(!tokenOk(code))fail("invalid-argument","QR-код недействителен.");
      await nameAndId(uid);
      const snap=await db.doc("baliBonusQRCodes/"+code).get();
      if(!snap.exists||snap.data().active!==true||
        (snap.data().mode==="once"&&snap.data().used===true))
        fail("failed-precondition","QR-код неактивен или уже использован.");
      const d=snap.data();
      const walletSnap=await db.doc("guestWallets/"+uid).get();
      const available=d.action==="debit"?balance(wallet(uid,walletSnap),d.kind,Date.now()):null;
      return {name:d.name,kind:d.kind,action:d.action,mode:d.mode,
        quantity:d.action==="debit"?1:d.quantity,maxQuantity:d.maxQuantity,available};
    }),
    applyBaliBonusQR:api("applyBaliBonusQR",async req=>{
      const uid=verified(req),code=req.data?.code,requestId=req.data?.requestId;
      if(!tokenOk(code)||!reqOk(requestId))
        fail("invalid-argument","Неверный QR-код или запрос.");
      const guest=await nameAndId(uid);
      const qrRef=db.doc("baliBonusQRCodes/"+code),walletRef=db.doc("guestWallets/"+uid);
      const lockRef=db.doc("baliBonusQRLocks/"+digest(code+":"+uid));
      const opId="qr_"+digest(uid+":"+code+":"+requestId).slice(0,48);
      const opRef=db.doc("walletOperations/"+opId);
      const result=await db.runTransaction(async tx=>{
        const [oldOp,qr,oldWallet,lock]=await Promise.all([
          tx.get(opRef),tx.get(qrRef),tx.get(walletRef),tx.get(lockRef)]);
        if(oldOp.exists){
          const prev=oldOp.data();
          if(prev.type==="redeem"&&req.data?.quantity!==prev.count)
            fail("already-exists","Идентификатор запроса уже использован для другого количества.");
          return {ok:true,alreadyProcessed:true,receipt:{
            id:opId,type:prev.type,kind:prev.kind,name:prev.name,count:prev.count,
            createdAt:prev.createdAt.toMillis(),expiresAt:prev.receiptExpiresAt.toMillis(),
            number:guest.number,balanceAfter:prev.balanceAfter}};
        }
        if(!qr.exists||qr.data().active!==true||
          (qr.data().mode==="once"&&qr.data().used===true))
          fail("failed-precondition","QR-код уже использован или отключён.");
        const q=qr.data(),at=TS.now(),now=at.toMillis();
        if(q.mode==="repeat"&&lock.exists&&now-(lock.data().lastUsedAt?.toMillis?.()||0)<
          (q.cooldownSeconds||30)*1000)
          fail("resource-exhausted","Повторное сканирование: немного подождите.");
        const w=wallet(uid,oldWallet);
        const quantity=q.action==="credit"?q.quantity:req.data?.quantity;
        if(!number(quantity)||quantity<1||quantity>q.maxQuantity||quantity>999)
          fail("invalid-argument","Некорректное количество бонусов.");
        const before=balance(w,q.kind,now);
        if(q.action==="credit"){
          if(before+quantity>999||w.grants.length>=80)
            fail("resource-exhausted","Превышен лимит бонусов на карте.");
          w.grants.push({id:opId,kind:q.kind,remaining:quantity,originalCount:quantity,
            transferable:true,unlimited:false,eventRef:null,expiresAt:null,
            issuedAt:at,issuedBy:"bonus-qr",sourceQR:digest(code).slice(0,20),
            note:"QR · "+clip(q.name,90)});
        }else{
          if(before<quantity)fail("failed-precondition","Недостаточно бонусов для списания.");
          let left=quantity;
          for(const g of w.grants){
            if(g.kind!==q.kind||!activeGrant(g,now)||left<=0)continue;
            const n=Math.min(g.remaining,left);
            g.remaining-=n;left-=n;
          }
          if(left)fail("failed-precondition","Недостаточно бонусов.");
        }
        const after=before+(q.action==="credit"?quantity:-quantity);
        if(q.mode==="once")tx.update(qrRef,{used:true,usedBy:uid,usedAt:at,uses:1});
        else tx.update(qrRef,{uses:admin.firestore.FieldValue.increment(1),lastUsedAt:at});
        tx.set(lockRef,{lastUsedAt:at,uid,codeHash:digest(code)});
        tx.set(walletRef,{...w,updatedAt:at});
        const type=q.action==="credit"?"grant":"redeem";
        tx.create(opRef,{guestUid:uid,type,kind:q.kind,name:q.name,count:quantity,
          reason:q.action==="credit"?"Начисление по QR":"Списание по QR",
          source:"bonus-qr",qrCodeHash:digest(code),balanceAfter:after,
          createdAt:at,receiptExpiresAt:expire(at)});
        return {ok:true,alreadyProcessed:false,receipt:{id:opId,type,kind:q.kind,name:q.name,
          count:quantity,createdAt:now,expiresAt:expire(at).toMillis(),number:guest.number,balanceAfter:after}};
      },{maxAttempts:5});
      return result;
    })
  };
};
