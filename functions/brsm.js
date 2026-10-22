"use strict";
/* BALI CARD BRSM / CONTACT: server-controlled cards, single-use event entry,
   promo redemption, and an auditable physical-ball lotto. MIT components were
   studied, but this is a native Firebase implementation for existing BALI. */
const {randomBytes, randomInt, createHash}=require("node:crypto");
const QRCode=require("qrcode");
const hash=value=>createHash("sha256").update(value).digest("hex");
const clean=value=>typeof value==="string"?value.trim():"";
const validUid=s=>typeof s==="string"&&/^[a-zA-Z0-9_-]{12,128}$/.test(s);
const num=v=>typeof v==="string"&&/^[0-9]{1,9}$/.test(v)&&Number(v)>0?Number(v):null;
const codePattern=/^[A-F0-9]{14}$/;
const qrPattern=/^[a-f0-9]{48}$/;
const select10=()=>{const numbers=new Set();while(numbers.size<10)numbers.add(randomInt(1,91));return [...numbers].sort((a,b)=>a-b);};
const isContact=title=>/контакт|contact/i.test(String(title||""));
const dateOk=date=>typeof date==="string"&&/^\d{4}-\d{2}-\d{2}$/.test(date)&&Number.isFinite(Date.parse(date+"T00:00:00+03:00"));
const yearWindow=date=>({
  opens:Date.parse(date+"T16:00:00+03:00"),
  closes:Date.parse(new Date(Date.parse(date+"T12:00:00+03:00")+86400000).toISOString().slice(0,10)+"T12:00:00+03:00")
});
module.exports=({api,admin,db,TS,verified,privileged,fail})=>{
 const owner=async req=>{const uid=verified(req);if(!await privileged(uid))fail("permission-denied","Доступ только директору или администратору.");return uid;};
 const cardRef=uid=>db.doc("brsmCards/"+uid);
 const publicDraw=db.doc("brsmDraws/main"), privateDraw=db.doc("brsmDrawAdmin/main"),campaign=db.doc("brsmCampaign/main");
 const at=()=>TS.now();
 async function identity(uid){
   const [u,i]=await Promise.all([db.doc("users/"+uid).get(),db.doc("baliIds/"+uid).get()]);
   if(!u.exists||!i.exists||!Number.isInteger(i.data().number))
     fail("failed-precondition","Сначала активируйте BALI ID и заполните профиль.");
   return {number:String(i.data().number).padStart(6,"0"),name:clean(u.data().name).slice(0,100)||"ГОСТЬ BALI"};
 }
 function publicCard(data){
   if(!data||!data.active)return {active:false};
   return {active:true,number:data.number,name:data.name,visits:Array.isArray(data.visits)?data.visits:[],
     numbers:Array.isArray(data.numbers)?data.numbers:[],ready:data.ready===true};
 }
 async function cardFor(uid,source,staffUid,tx){
   const ref=cardRef(uid),existing=await tx.get(ref),ident=await identity(uid);
   if(existing.exists&&existing.data().active)return {already:true,card:publicCard(existing.data())};
   const previous=existing.exists?existing.data():{};
   const card={...previous,active:true,number:ident.number,name:ident.name,
     visits:Array.isArray(previous.visits)?previous.visits:[],
     numbers:Array.isArray(previous.numbers)?previous.numbers:[],
     ready:previous.ready===true,source,assignedBy:staffUid||null,updatedAt:at()};
   if(!existing.exists)card.createdAt=at();
   tx.set(ref,card);
   return {already:false,card:publicCard(card)};
 }
 // Account self-service never assigns BRSM unless a valid promo is redeemed.
 const getBrsmCard=api("getBrsmCard",async req=>{
   const uid=verified(req),snap=await cardRef(uid).get();
   return publicCard(snap.exists?snap.data():null);
 });
 const assignBrsmCard=api("assignBrsmCard",async req=>{
   const staff=await owner(req),id=num(req.data?.number);
   if(!id)fail("invalid-argument","Введите номер BALI ID.");
   const ids=await db.collection("baliIds").where("number","==",id).limit(1).get();
   if(ids.empty)fail("not-found","Гость с указанной BALI ID не найден.");
   const uid=ids.docs[0].id;
   const enable=req.data?.active!==false;
   if(!enable){
     await cardRef(uid).set({active:false,updatedAt:at(),revokedBy:staff},{merge:true});
     return {active:false,number:String(id).padStart(6,"0")};
   }
   await identity(uid);
   let result;
   await db.runTransaction(async tx=>{
     const ref=cardRef(uid),old=await tx.get(ref),ident=await identity(uid);
     const prev=old.exists?old.data():{};
     const data={...prev,active:true,number:ident.number,name:ident.name,
       visits:Array.isArray(prev.visits)?prev.visits:[],numbers:Array.isArray(prev.numbers)?prev.numbers:[],
       ready:prev.ready===true,source:"director",assignedBy:staff,updatedAt:at()};
     if(!old.exists)data.createdAt=at();
     tx.set(ref,data);result=publicCard(data);
   });
   return result;
 });
 const createBrsmPromo=api("createBrsmPromo",async req=>{
   const staff=await owner(req);
   const maxUses=Number(req.data?.maxUses||1),days=Number(req.data?.days||30);
   if(!Number.isInteger(maxUses)||maxUses<1||maxUses>2000||!Number.isInteger(days)||days<1||days>120)
     fail("invalid-argument","Лимит использований 1–2000, срок 1–120 дней.");
   const code=randomBytes(7).toString("hex").toUpperCase();
   await db.doc("brsmPromos/"+hash(code)).create({
     active:true,maxUses,uses:0,expiresAt:TS.fromMillis(Date.now()+days*86400000),
     createdAt:at(),createdBy:staff
   });
   return {code,maxUses,days};
 });
 const redeemBrsmPromo=api("redeemBrsmPromo",async req=>{
   const uid=verified(req),code=clean(req.data?.code).replace(/[\s-]/g,"").toUpperCase();
   if(!codePattern.test(code))fail("invalid-argument","Неверный формат промокода.");
   const ident=await identity(uid);
   const card=cardRef(uid),promo=db.doc("brsmPromos/"+hash(code)),limit=db.doc("brsmPromoAttempts/"+uid);
   let outcome="invalid";
   await db.runTransaction(async tx=>{
     const [a,c,p]=await Promise.all([tx.get(limit),tx.get(card),tx.get(promo)]);
     const now=Date.now(),old=a.exists?a.data():{};
     const windowOpen=typeof old.startedAt?.toMillis==="function"&&now-old.startedAt.toMillis()<3600000;
     const attempts=windowOpen?(old.attempts||0)+1:1;
     if(attempts>8)fail("resource-exhausted","Слишком много попыток. Повторите через час.");
     tx.set(limit,{startedAt:windowOpen?old.startedAt:at(),attempts});
     if(c.exists&&c.data().active){outcome="already";return;}
     const pd=p.exists?p.data():null;
     if(!pd||pd.active!==true||pd.uses>=pd.maxUses||pd.expiresAt.toMillis()<=now)return;
     const prev=c.exists?c.data():{};
     const data={...prev,active:true,name:ident.name,number:ident.number,
       visits:Array.isArray(prev.visits)?prev.visits:[],numbers:Array.isArray(prev.numbers)?prev.numbers:[],
       ready:prev.ready===true,source:"promo",assignedBy:null,updatedAt:at()};
     if(!c.exists)data.createdAt=at();
     tx.set(card,data);tx.update(promo,{uses:admin.firestore.FieldValue.increment(1)});
     outcome="ok";
   });
   if(outcome==="invalid")fail("failed-precondition","Промокод недействителен, исчерпан или истёк.");
   return {ok:true,already:outcome==="already"};
 });
 const revokeBrsmPromo=api("revokeBrsmPromo",async req=>{
   await owner(req);const code=clean(req.data?.code).replace(/[\s-]/g,"").toUpperCase();
   if(!codePattern.test(code))fail("invalid-argument","Введите промокод.");
   await db.doc("brsmPromos/"+hash(code)).update({active:false,revokedAt:at()});
   return {ok:true};
 });
 const listBrsmEvents=api("listBrsmEvents",async req=>{
   await owner(req);
   const snap=await db.collection("events").orderBy("date","desc").limit(100).get();
   return {events:snap.docs.filter(x=>isContact(x.data().title)&&dateOk(x.data().date)).slice(0,40).map(x=>
     ({id:x.id,title:clean(x.data().title),date:x.data().date}))};
 });
 const createBrsmQrBatch=api("createBrsmQrBatch",async req=>{
   const staff=await owner(req),eventId=clean(req.data?.eventId),count=Number(req.data?.count||1);
   if(!/^[a-zA-Z0-9_-]{1,90}$/.test(eventId)||!Number.isInteger(count)||count<1||count>30)
     fail("invalid-argument","Укажите мероприятие и количество от 1 до 30.");
   const ev=await db.doc("events/"+eventId).get();
   if(!ev.exists||!isContact(ev.data().title)||!dateOk(ev.data().date))
     fail("failed-precondition","Разрешены только мероприятия КОНТАКТ из календаря.");
   const {opens,closes}=yearWindow(ev.data().date),now=Date.now();
   if(closes<now||opens>now+90*86400000)
     fail("failed-precondition","Генерация доступна для мероприятий в пределах 90 дней.");
   const records=[],batch=db.batch();
   for(let i=0;i<count;i++){
     const token=randomBytes(24).toString("hex");
     batch.create(db.doc("brsmEntryQr/"+hash(token)),{
       eventId,title:clean(ev.data().title).slice(0,140),date:ev.data().date,
       opensAt:TS.fromMillis(opens),expiresAt:TS.fromMillis(closes),
       usedBy:null,createdAt:at(),createdBy:staff
     });
     const url="https://baliminsk.by/brsm.html?qr="+token;
     records.push({token,url,qr:await QRCode.toDataURL(url,{width:210,margin:1,errorCorrectionLevel:"M"})});
   }
   await batch.commit();
   return {eventId,date:ev.data().date,records};
 });
 const redeemBrsmQr=api("redeemBrsmQr",async req=>{
   const uid=verified(req),token=clean(req.data?.token).toLowerCase();
   if(!qrPattern.test(token))fail("invalid-argument","QR-код недействителен.");
   const ref=db.doc("brsmEntryQr/"+hash(token)),card=cardRef(uid);
   let result;
   const generated=select10();
   await db.runTransaction(async tx=>{
     const [q,c,lock]=await Promise.all([tx.get(ref),tx.get(card),tx.get(campaign)]);
     if(lock.exists&&lock.data().closed===true)
       fail("failed-precondition","Приём посещений завершён перед розыгрышем.");
     const qr=q.exists?q.data():null,s=c.exists?c.data():null,now=Date.now();
     if(!qr||qr.usedBy||now<qr.opensAt.toMillis()||now>=qr.expiresAt.toMillis())
       fail("failed-precondition","QR уже использован или не относится к текущей вечеринке.");
     if(!s||s.active!==true)fail("failed-precondition","Сначала получите BALI CARD BRSM.");
     const visits=Array.isArray(s.visits)?s.visits:[];
     if(visits.some(v=>v.eventId===qr.eventId))
       fail("already-exists","За эту вечеринку вход уже зафиксирован.");
     if(visits.length>=3)fail("failed-precondition","Три посещения уже подтверждены.");
     const next=[...visits,{eventId:qr.eventId,title:qr.title,date:qr.date,at:at()}];
     const ready=next.length===3;
     const numbers=ready?generated:[];
     tx.update(ref,{usedBy:uid,usedAt:at()});
     tx.update(card,{visits:next,ready,numbers,updatedAt:at()});
     result={visits:next,numbers,ready};
   });
   return result;
 });
 const startBrsmDraw=api("startBrsmDraw",async req=>{
   const staff=await owner(req);
   await db.runTransaction(async tx=>{
     const [p,d]=await Promise.all([tx.get(publicDraw),tx.get(campaign)]);
     if(p.exists&&["live","finished","tiebreak"].includes(p.data().status))
       fail("failed-precondition","Розыгрыш уже начат.");
     tx.set(campaign,{closed:true,closedAt:at(),closedBy:staff},{merge:true});
   });
   const ready=await db.collection("brsmCards").where("ready","==",true).get();
   const tickets=ready.docs.filter(x=>x.data().active===true&&Array.isArray(x.data().numbers)&&x.data().numbers.length===10)
     .map(x=>({uid:x.id,number:x.data().number,name:x.data().name,numbers:x.data().numbers}));
   if(tickets.length<1||tickets.length>2000)
     fail("failed-precondition","Для розыгрыша необходимо 1–2000 активных билетов.");
   await db.runTransaction(async tx=>{
     const [p,d]=await Promise.all([tx.get(publicDraw),tx.get(privateDraw)]);
     if(p.exists&&["live","finished","tiebreak"].includes(p.data().status))
       fail("failed-precondition","Розыгрыш уже начат.");
     tx.set(privateDraw,{tickets,startedAt:at(),startedBy:staff});
     tx.set(publicDraw,{status:"live",called:[],threshold:5,winnerNumber:null,winnerName:null,
       participants:tickets.length,startedAt:at(),updatedAt:at()});
   });
   return {status:"live",participants:tickets.length};
 });
 const callBrsmNumber=api("callBrsmNumber",async req=>{
   const staff=await owner(req),number=Number(req.data?.number);
   if(!Number.isInteger(number)||number<1||number>90)
     fail("invalid-argument","Номер должен быть от 1 до 90.");
   let result;
   await db.runTransaction(async tx=>{
     const [pub,priv]=await Promise.all([tx.get(publicDraw),tx.get(privateDraw)]);
     if(!pub.exists||pub.data().status!=="live"||!priv.exists)
       fail("failed-precondition","Нет активного розыгрыша.");
     const called=pub.data().called||[];
     if(called.includes(number))fail("already-exists","Этот номер уже назван.");
     const next=[...called,number],set=new Set(next),tickets=priv.data().tickets||[];
     let threshold=pub.data().threshold||5;
     const counts=tickets.map(t=>({...t,hits:t.numbers.filter(n=>set.has(n)).length}));
     let leaders=counts.filter(t=>t.hits>=threshold);
     while(leaders.length>1&&threshold<10){threshold++;leaders=counts.filter(t=>t.hits>=threshold);}
     let status="live",winner=null;
     if(leaders.length===1){status="finished";winner=leaders[0];}
     else if(leaders.length>1&&threshold===10)status="tiebreak";
     tx.update(publicDraw,{called:next,threshold,status,winnerNumber:winner?.number||null,
       winnerName:winner?.name||null,updatedAt:at(),lastCalledBy:staff});
     result={called:next,threshold,status,winnerNumber:winner?.number||null,winnerName:winner?.name||null,
       contenders:leaders.length,participants:tickets.length};
   });
   return result;
 });
 const finishBrsmTie=api("finishBrsmTie",async req=>{
   const staff=await owner(req);
   let result;
   await db.runTransaction(async tx=>{
     const [p,d]=await Promise.all([tx.get(publicDraw),tx.get(privateDraw)]);
     if(!p.exists||p.data().status!=="tiebreak"||!d.exists)
       fail("failed-precondition","Дополнительный этап не требуется.");
     const called=new Set(p.data().called||[]);
     const same=(d.data().tickets||[]).filter(t=>t.numbers.every(n=>called.has(n)));
     if(same.length<2)fail("failed-precondition","Нет участников с одинаковым максимальным результатом.");
     const chosen=same[randomInt(same.length)];
     tx.update(publicDraw,{status:"finished",winnerNumber:chosen.number,winnerName:chosen.name,
       tieMethod:"server-crypto-draw",tieCount:same.length,tieResolvedBy:staff,updatedAt:at()});
     result={status:"finished",winnerNumber:chosen.number,winnerName:chosen.name,tieCount:same.length};
   });
   return result;
 });
 const reopenBrsmRegistration=api("reopenBrsmRegistration",async req=>{
   const staff=await owner(req);
   await db.runTransaction(async tx=>{
     const p=await tx.get(publicDraw);
     if(p.exists&&["live","finished","tiebreak"].includes(p.data().status))
       fail("failed-precondition","Уже начатый розыгрыш нельзя вернуть в режим регистрации.");
     tx.set(campaign,{closed:false,reopenedAt:at(),reopenedBy:staff},{merge:true});
   });
   return {closed:false};
 });
 const getBrsmAdminState=api("getBrsmAdminState",async req=>{
   await owner(req);
   const [d,p,lock]=await Promise.all([privateDraw.get(),publicDraw.get(),campaign.get()]);
   return {closed:lock.exists&&lock.data().closed===true,draw:p.exists?p.data():null,
     ticketCount:d.exists?(d.data().tickets||[]).length:0};
 });
 return {getBrsmCard,assignBrsmCard,createBrsmPromo,redeemBrsmPromo,revokeBrsmPromo,
   listBrsmEvents,createBrsmQrBatch,redeemBrsmQr,startBrsmDraw,callBrsmNumber,
   finishBrsmTie,getBrsmAdminState,reopenBrsmRegistration};
};
