"use strict";
/* BRSM event lottery: every privileged write is server-validated.
 * Firestore clients may only read their own card and the public draw.
 */
const {randomBytes,createHash,randomInt}=require("node:crypto");
const QRCode=require("qrcode");
const {ticket,replay}=require("./brsm-core");
const hex=()=>randomBytes(24).toString("hex");
const digest=s=>createHash("sha256").update(s).digest("hex");
const allowedId=s=>typeof s==="string"&&/^[a-zA-Z0-9_-]{3,90}$/.test(s);
const today=()=>Date.now();
const fmt=n=>String(n).padStart(6,"0");
const clean=(s,max=100)=>typeof s==="string"?s.trim().slice(0,max):"";
const tokenValid=s=>typeof s==="string"&&/^[a-f0-9]{48}$/.test(s);
const promoValid=s=>typeof s==="string"&&/^BRSM-[A-F0-9]{10}$/.test(s.trim().toUpperCase());
module.exports=({api,admin,db,TS,verified,privileged,fail,nameAndId})=>{
  const cards=db.collection("brsmCards");
  const upgradedRef=db.doc("brsmCampaignState/active");
  const upgraded=async()=>Boolean((await upgradedRef.get()).exists);
  const drawRef=db.doc("brsmDraws/current"),secretRef=db.doc("brsmDrawPrivate/current");
  const fw=admin.firestore.FieldValue;
  async function staff(req){const uid=verified(req);if(!await privileged(uid))fail("permission-denied","Доступ только руководству.");return uid;}
  async function notDrawing(tx){const d=await tx.get(drawRef);if(d.exists)fail("failed-precondition","Розыгрыш уже создан: выдача и посещения закрыты.");}
  const getCard=uid=>cards.doc(uid);
  async function findGuest(number,uidInput){
    if(uidInput!==undefined&&uidInput!==null){
      const uid=clean(uidInput,128);
      if(!/^[A-Za-z0-9_-]{8,128}$/.test(uid))
        fail("invalid-argument","Некорректный UID получателя карты.");
      const guest=await nameAndId(uid);
      // UID is resolved by the authenticated director from the Sheets backend.
      // Never use a customer-supplied UID here: all callers invoke staff(req).
      return {uid,...guest};
    }
    const n=Number(number);
    if(!Number.isInteger(n)||n<1||n>999999)fail("invalid-argument","Неверный шестизначный номер Bali Card.");
    const hits=await db.collection("baliIds").where("number","==",n).limit(1).get();
    if(hits.empty)fail("not-found","Bali Card не найден.");
    return {uid:hits.docs[0].id,...await nameAndId(hits.docs[0].id)};
  }
  function initCard(guest,source,by){
    return {uid:guest.uid,number:guest.number,name:guest.name,active:true,visits:[],
      eligible:false,numbers:[],source,assignedBy:by,assignedAt:TS.now(),updatedAt:TS.now()};
  }
  const visit=(eventId,label,source)=>({eventId,label,source,at:TS.now()});
  const applyVisit=(data,eventId,label,source)=>{
    if(data.visits.some(x=>x.eventId===eventId))fail("already-exists","Это мероприятие уже засчитано.");
    if(data.visits.length>=3)fail("failed-precondition","Три посещения уже собраны.");
    const visits=[...data.visits,visit(eventId,label,source)];
    return {visits,eligible:visits.length===3,numbers:visits.length===3?ticket():[],
      ticketIssuedAt:visits.length===3?TS.now():null,updatedAt:TS.now()};
  };

  const activateBrsmPromo=api("activateBrsmPromo",async req=>{
    const uid=verified(req),code=clean(req.data?.code,40).toUpperCase();
    if(!promoValid(code))fail("invalid-argument","Неверный формат промокода.");
    const guest=await nameAndId(uid),pr=db.doc("brsmPromos/"+digest(code));
    return db.runTransaction(async tx=>{
      const [lock,c,p,v2]=await Promise.all([tx.get(drawRef),tx.get(getCard(uid)),tx.get(pr),tx.get(upgradedRef)]);
      if(lock.exists&&!v2.exists)fail("failed-precondition","Набор участников закрыт.");
      if(c.exists&&c.data().active)fail("already-exists","Карта BRSM уже активирована.");
      if(!p.exists||p.data().active!==true||p.data().used>=p.data().maxUses||p.data().expiresAt.toMillis()<today())
        fail("failed-precondition","Промокод недействителен или исчерпан.");
      // Revoked cards are restored without wiping collected visits or issued ticket.
      if(c.exists){
        tx.update(getCard(uid),{active:true,updatedAt:TS.now(),restoredByPromo:true});
      }else{
        tx.create(getCard(uid),initCard(guest,"promo",uid));
      }
      tx.update(pr,{used:fw.increment(1),updatedAt:TS.now()});
      return {ok:true,number:guest.number};
    });
  });
  const manageBrsmCard=api("manageBrsmCard",async req=>{
    const who=await staff(req),guest=await findGuest(req.data?.number,req.data?.uid),op=req.data?.op;
    if(!["assign","revoke","restore"].includes(op))fail("invalid-argument","Неизвестное действие.");
    return db.runTransaction(async tx=>{
      const [d,c,v2]=await Promise.all([tx.get(drawRef),tx.get(getCard(guest.uid)),tx.get(upgradedRef)]);
      if(d.exists&&!v2.exists)fail("failed-precondition","Розыгрыш уже начат. Карты заблокированы от изменений.");
      if(op==="assign"){
        if(c.exists&&c.data().active)fail("already-exists","Карта уже существует.");
        // A revoked card is restored without erasing its legitimate visits.
        if(c.exists)tx.update(getCard(guest.uid),{active:true,updatedAt:TS.now(),assignedBy:who});
        else tx.create(getCard(guest.uid),initCard(guest,"director",who));
      }else{
        if(!c.exists)fail("not-found","Карта не найдена.");
        tx.update(getCard(guest.uid),{active:op==="restore",updatedAt:TS.now(),updatedBy:who});
      }
      return {ok:true,number:guest.number,active:op!=="revoke"};
    });
  });
  const createBrsmPromo=api("createBrsmPromo",async req=>{
    const uid=await staff(req),maxUses=Number(req.data?.maxUses),days=Number(req.data?.days);
    if(!Number.isInteger(maxUses)||maxUses<1||maxUses>10000||!Number.isInteger(days)||days<1||days>365)
      fail("invalid-argument","Укажите лимит активаций 1–10000 и срок 1–365 дней.");
    if((await drawRef.get()).exists&&!(await upgraded()))fail("failed-precondition","Розыгрыш уже начат.");
    const code="BRSM-"+randomBytes(5).toString("hex").toUpperCase();
    await db.doc("brsmPromos/"+digest(code)).create({
      active:true,used:0,maxUses,expiresAt:TS.fromMillis(today()+days*86400000),
      createdAt:TS.now(),createdBy:uid,preview:code.slice(0,8)+"••••••",updatedAt:TS.now()
    });
    return {code,maxUses,days};
  });
  const createBrsmEvent=api("createBrsmEvent",async req=>{
    const uid=await staff(req);
    if(await upgraded())fail("failed-precondition","Используйте мероприятия выбранной кампании.");
    const eventId=clean(req.data?.eventId,90),label=clean(req.data?.label,90);
    const date=clean(req.data?.date,10);
    if(!allowedId(eventId)||!label||! /^\d{4}-\d{2}-\d{2}$/.test(date)||!Number.isFinite(Date.parse(date+"T12:00:00Z"))||new Date(date+"T12:00:00Z").toISOString().slice(0,10)!==date)
      fail("invalid-argument","Нужны ID, название и дата мероприятия.");
    const source=await db.doc("events/"+eventId).get();
    if(!source.exists||source.data().date!==date)
      fail("failed-precondition","Сначала создайте мероприятие в календаре BALI с таким ID и датой.");
    const officialName=clean(source.data().title,90);
    if(!/контакт|contact/i.test(officialName)||! /контакт|contact/i.test(label))
      fail("invalid-argument","Мероприятие календаря должно называться КОНТАКТ / CONTACT.");
    if((await drawRef.get()).exists)fail("failed-precondition","Розыгрыш уже начат.");
    await db.doc("brsmEvents/"+eventId).create({eventId,label:officialName,date,active:true,createdAt:TS.now(),createdBy:uid});
    return {ok:true,eventId};
  });
  const issueBrsmQrs=api("issueBrsmQrs",async req=>{
    await staff(req);
    if(await upgraded())fail("failed-precondition","Используйте QR-коды выбранной кампании.");
    const eventId=clean(req.data?.eventId,90),count=Number(req.data?.count),hours=Number(req.data?.hours);
    if(!allowedId(eventId)||!Number.isInteger(count)||count<1||count>100||
      !Number.isInteger(hours)||hours<1||hours>72)fail("invalid-argument","1–100 QR, срок 1–72 часа.");
    const [ev,lock]=await Promise.all([db.doc("brsmEvents/"+eventId).get(),drawRef.get()]);
    if(lock.exists)fail("failed-precondition","Розыгрыш уже запущен.");
    if(!ev.exists||ev.data().active!==true)fail("failed-precondition","Мероприятие не активировано.");
    const expiresAt=TS.fromMillis(today()+hours*3600000);
    const codes=Array.from({length:count},()=>hex());
    const urls=codes.map(code=>"https://baliminsk.by/?brsmVisit="+code+"#id");
    const qr=await Promise.all(urls.map(x=>QRCode.toDataURL(x,{width:270,margin:2,errorCorrectionLevel:"M"})));
    const batch=db.batch();
    codes.forEach((code,i)=>batch.create(db.doc("brsmVisitQrs/"+digest(code)),{
      eventId,expiresAt,used:false,createdAt:TS.now()
    }));
    await batch.commit();
    return {eventId,expiresAt:expiresAt.toMillis(),
      items:codes.map((code,i)=>({url:urls[i],qrDataUrl:qr[i]}))};
  });
  const claimBrsmVisit=api("claimBrsmVisit",async req=>{
    const uid=verified(req),token=clean(req.data?.token,80);
    if(await upgraded())fail("failed-precondition","Этот QR относится к старой кампании.");
    if(!tokenValid(token))fail("invalid-argument","Неверный QR-код.");
    await nameAndId(uid);
    const ref=db.doc("brsmVisitQrs/"+digest(token));
    return db.runTransaction(async tx=>{
      const [draw,c,qr]=await Promise.all([tx.get(drawRef),tx.get(getCard(uid)),tx.get(ref)]);
      if(draw.exists)fail("failed-precondition","Розыгрыш начат, регистрации закрыты.");
      if(!c.exists||c.data().active!==true)fail("permission-denied","Сначала активируйте BALI CARD BRSM.");
      if(!qr.exists||qr.data().used||qr.data().expiresAt.toMillis()<=today())
        fail("failed-precondition","QR использован, отключён или просрочен.");
      const eventId=qr.data().eventId;
      const ev=await tx.get(db.doc("brsmEvents/"+eventId));
      if(!ev.exists||ev.data().active!==true)fail("failed-precondition","Мероприятие неактивно.");
      const source=await tx.get(db.doc("events/"+eventId));
      if(!source.exists||source.data().date!==ev.data().date)
        fail("failed-precondition","Мероприятие удалено из календаря.");
      const base=source.data(),start=/^\d{2}:\d{2}$/.test(base.startTime||"")?base.startTime:"23:00";
      const end=/^\d{2}:\d{2}$/.test(base.endTime||"")?base.endTime:"06:00";
      const from=Date.parse(base.date+"T"+start+":00+03:00");
      let until=Date.parse(base.date+"T"+end+":00+03:00");
      if(end<=start)until+=86400000;
      if(today()<from-5400000||today()>until+7200000)
        fail("failed-precondition","QR можно применить только во время соответствующей вечеринки.");
      const updates=applyVisit(c.data(),eventId,ev.data().label,"qr");
      tx.update(getCard(uid),updates);
      tx.update(ref,{used:true,usedBy:uid,usedAt:TS.now()});
      return {ok:true,visits:updates.visits.length,eligible:updates.eligible};
    });
  });
  const manualBrsmVisit=api("manualBrsmVisit",async req=>{
    if(await upgraded())fail("failed-precondition","Используйте панель новой кампании.");
    const staffUid=await staff(req),guest=await findGuest(req.data?.number,req.data?.uid),eventId=clean(req.data?.eventId,90);
    if(!allowedId(eventId))fail("invalid-argument","Неверный ID мероприятия.");
    return db.runTransaction(async tx=>{
      const [draw,ev,c]=await Promise.all([tx.get(drawRef),tx.get(db.doc("brsmEvents/"+eventId)),tx.get(getCard(guest.uid))]);
      if(draw.exists)fail("failed-precondition","Розыгрыш уже начат.");
      if(!ev.exists||!ev.data().active||!c.exists||!c.data().active)
        fail("failed-precondition","Проверьте мероприятие и карту.");
      tx.update(getCard(guest.uid),applyVisit(c.data(),eventId,ev.data().label,"manual:"+staffUid));
      return {ok:true};
    });
  });
  const undoBrsmVisit=api("undoBrsmVisit",async req=>{
    const employeeUid=await staff(req),guest=await findGuest(req.data?.number,req.data?.uid);
    const eventId=clean(req.data?.eventId,90),reason=clean(req.data?.reason,160);
    if(!allowedId(eventId)||reason.length<5)fail("invalid-argument","Укажите мероприятие и причину отмены (не менее 5 символов).");
    return db.runTransaction(async tx=>{
      const [draw,card]=await Promise.all([tx.get(drawRef),tx.get(getCard(guest.uid))]);
      if(draw.exists)fail("failed-precondition","После старта розыгрыша посещения нельзя изменять.");
      if(!card.exists)fail("not-found","Карта гостя не найдена.");
      const data=card.data();
      if(!Array.isArray(data.visits)||!data.visits.some(x=>x.eventId===eventId))
        fail("not-found","Это посещение не было зафиксировано.");
      const remaining=data.visits.filter(x=>x.eventId!==eventId);
      // A previously issued ticket is invalidated whenever the third visit is reversed.
      tx.update(getCard(guest.uid),{
        visits:remaining,eligible:false,numbers:[],ticketIssuedAt:null,updatedAt:TS.now()
      });
      tx.create(db.collection("brsmAudit").doc(),{
        action:"undo-visit",uid:guest.uid,number:guest.number,eventId,reason,
        employeeUid,createdAt:TS.now()
      });
      return {ok:true,visits:remaining.length};
    });
  });
  const revokeBrsmQr=api("revokeBrsmQr",async req=>{
    const uid=await staff(req),raw=clean(req.data?.token,256);
    let token=raw;
    try{const link=new URL(raw);token=link.searchParams.get("brsmVisit")||"";}catch{}
    if(!tokenValid(token))fail("invalid-argument","Укажите QR-токен или полную ссылку.");
    const ref=db.doc("brsmVisitQrs/"+digest(token));
    return db.runTransaction(async tx=>{
      const qr=await tx.get(ref);if(!qr.exists)fail("not-found","QR не найден.");
      if(qr.data().used)fail("failed-precondition","QR уже использован или отключён.");
      tx.update(ref,{used:true,revoked:true,revokedBy:uid,revokedAt:TS.now()});
      return {ok:true};
    });
  });
  const disableBrsmPromo=api("disableBrsmPromo",async req=>{
    const uid=await staff(req),code=clean(req.data?.code,50).toUpperCase();
    if(!promoValid(code))fail("invalid-argument","Неверный промокод.");
    const ref=db.doc("brsmPromos/"+digest(code));
    const row=await ref.get();if(!row.exists)fail("not-found","Промокод не найден.");
    await ref.update({active:false,updatedBy:uid,updatedAt:TS.now()});return {ok:true};
  });
  const disableBrsmEvent=api("disableBrsmEvent",async req=>{
    const uid=await staff(req),eventId=clean(req.data?.eventId,90);
    if(!allowedId(eventId))fail("invalid-argument","Неверный ID.");
    const ref=db.doc("brsmEvents/"+eventId),row=await ref.get();
    if(!row.exists)fail("not-found","Событие не найдено.");
    await ref.update({active:false,updatedBy:uid,updatedAt:TS.now()});return {ok:true};
  });
  const getBrsmCardAdmin=api("getBrsmCardAdmin",async req=>{
    await staff(req);
    const guest=await findGuest(req.data?.number,req.data?.uid);
    const row=await getCard(guest.uid).get();
    if(!row.exists)fail("not-found","Карта BRSM не выдана этому гостю.");
    const d=row.data();
    return {card:{
      uid:guest.uid,number:d.number,name:d.name,active:d.active===true,
      eligible:d.eligible===true,visits:Array.isArray(d.visits)?d.visits.map(v=>({
        eventId:v.eventId,label:v.label,source:v.source,
        atMillis:v.at?.toMillis?.()||null
      })):[],numbers:d.numbers||[],
      source:d.source||"director",assignedAtMillis:d.assignedAt?.toMillis?.()||null
    }};
  });
  const listBrsmAdmin=api("listBrsmAdmin",async req=>{
    await staff(req);
    const [cardsSnapshot,events,promos,draw]=await Promise.all([
      cards.orderBy("assignedAt","desc").limit(80).get(),
      db.collection("brsmEvents").orderBy("createdAt","desc").limit(60).get(),
      db.collection("brsmPromos").orderBy("createdAt","desc").limit(50).get(),drawRef.get()
    ]);
    return {cards:cardsSnapshot.docs.map(s=>({number:s.data().number,name:s.data().name,active:s.data().active,visits:s.data().visits?.length||0,eligible:s.data().eligible,numbers:s.data().numbers||[]})),
      events:events.docs.map(s=>({eventId:s.id,label:s.data().label,date:s.data().date,active:s.data().active})),
      promos:promos.docs.map(s=>({preview:s.data().preview,used:s.data().used,maxUses:s.data().maxUses,active:s.data().active})),
      draw:draw.exists?draw.data():null};
  });
  const beginBrsmDraw=api("beginBrsmDraw",async req=>{
    const uid=await staff(req);
    if(await upgraded())fail("failed-precondition","Используйте раунды новой кампании.");
    return db.runTransaction(async tx=>{
      const old=await tx.get(drawRef);
      if(old.exists)fail("already-exists","Розыгрыш уже создан.");
      const eligible=await tx.get(cards.where("eligible","==",true).limit(1501));
      if(eligible.size>1500)fail("resource-exhausted","Для этого количества участников нужен пакетный режим.");
      const entries=eligible.docs.filter(s=>s.data().active===true&&
        Array.isArray(s.data().numbers)&&s.data().numbers.length===10).map(s=>({
          uid:s.id,number:s.data().number,numbers:s.data().numbers
        }));
      if(!entries.length)fail("failed-precondition","Нет участников с тремя посещениями.");
      tx.create(secretRef,{entries,startedAt:TS.now(),startedBy:uid,audit:[]});
      tx.create(drawRef,{phase:"live",drawn:[],target:5,contenderCount:0,eligibleCount:entries.length,
        winnerNumber:null,startedAt:TS.now(),updatedAt:TS.now()});
      return {ok:true,participants:entries.length};
    });
  });
  const finalizeBrsmDraw=api("finalizeBrsmDraw",async req=>{
    const uid=await staff(req);
    return db.runTransaction(async tx=>{
      const [publicDraw,privateDraw]=await Promise.all([tx.get(drawRef),tx.get(secretRef)]);
      if(!publicDraw.exists||!privateDraw.exists)
        fail("failed-precondition","Сначала проведите тираж.");
      const row=publicDraw.data();
      if(row.phase!=="provisional"||!row.winnerNumber)
        fail("failed-precondition","Необходимо дождаться предварительного победителя.");
      if(!privateDraw.data().entries.some(x=>String(x.number)===String(row.winnerNumber)))
        fail("failed-precondition","Номер победителя не зарегистрирован.");
      tx.update(drawRef,{phase:"finished",confirmedBy:uid,confirmedAt:TS.now(),updatedAt:TS.now()});
      tx.update(secretRef,{audit:fw.arrayUnion({
        action:"finalize",number:row.winnerNumber,by:uid,reason:null,at:TS.now()
      })});
      return {ok:true,winnerNumber:row.winnerNumber,phase:"finished"};
    });
  });
  const getBrsmDrawReport=api("getBrsmDrawReport",async req=>{
    await staff(req);
    const [publicDraw,privateDraw]=await Promise.all([drawRef.get(),secretRef.get()]);
    if(!publicDraw.exists||!privateDraw.exists)
      fail("failed-precondition","Тираж ещё не начат.");
    const d=publicDraw.data(),p=privateDraw.data();
    if(d.phase!=="finished")
      fail("failed-precondition","Протокол можно выгрузить только после определения победителя.");
    const drawn=new Set(d.drawn);
    const participants=p.entries.map(e=>({
      number:e.number,
      numbers:e.numbers,
      matches:e.numbers.filter(n=>drawn.has(n)).length,
      winner:String(e.number)===String(d.winnerNumber)
    }));
    const audit=(p.audit||[]).map(e=>({
      action:e.action,number:e.number||null,reason:e.reason||null,
      by:e.by||"",atMillis:e.at?.toMillis?.()||null
    }));
    const report={
      exportedAtMillis:today(),
      drawStartedMillis:p.startedAt?.toMillis?.()||null,
      lastDrawUpdateMillis:d.updatedAt?.toMillis?.()||null,
      phase:d.phase,
      winnerNumber:d.winnerNumber,
      numbersDrawn:d.drawn,
      participantsCount:participants.length,
      participants,audit
    };
    return {...report,
      sha256:digest(JSON.stringify({
        winnerNumber:report.winnerNumber,numbersDrawn:report.numbersDrawn,
        participants:report.participants,audit:report.audit
      }))
    };
  });
  const updateBrsmDraw=api("updateBrsmDraw",async req=>{
    const uid=await staff(req),action=req.data?.action;
    if(!["draw","undo","resolveTie"].includes(action))fail("invalid-argument","Неизвестная операция.");
    const n=Number(req.data?.number);
    if(action==="draw"&&(!Number.isInteger(n)||n<1||n>90))
      fail("invalid-argument","Номер бочонка: от 1 до 90.");
    const reason=clean(req.data?.reason,160);
    if(action==="undo"&&reason.length<5)
      fail("invalid-argument","Укажите причину отмены бочонка (минимум 5 символов).");
    return db.runTransaction(async tx=>{
      const [d,p]=await Promise.all([tx.get(drawRef),tx.get(secretRef)]);
      if(!d.exists||!p.exists)fail("failed-precondition","Сначала начните розыгрыш.");
      const row=d.data(),history=[...row.drawn],entrants=p.data().entries;
      let override=null;
      if(action==="draw"){
        if(row.phase!=="live")fail("failed-precondition","Розыгрыш завершён.");
        if(history.includes(n))fail("already-exists","Этот бочонок уже выпадал.");
        history.push(n);
      }else if(action==="undo"){
        if(row.phase==="finished")
          fail("failed-precondition","Победитель подтверждён; тираж нельзя изменять.");
        if(!history.length)fail("failed-precondition","Бочонки ещё не вытягивали.");
        history.pop();
      }else{
        if(row.phase!=="tie")fail("failed-precondition","Дополнительный тираж не требуется.");
        const remaining=new Set(replay(entrants,history).contenders.map(String));
        const finalists=entrants.filter(e=>remaining.has(String(e.uid)));
        if(finalists.length<2)fail("failed-precondition","Невозможно определить участников дополнительного жребия.");
        override=finalists[randomInt(finalists.length)];
      }
      const state=replay(entrants,history);
      const winner=override||state.winner;
      const phase=winner?"provisional":state.fallbackNeeded?"tie":"live";
      tx.update(drawRef,{drawn:history,target:state.target,contenderCount:state.contenders.length,
        winnerNumber:winner?.number||null,phase,updatedAt:TS.now()});
      tx.update(secretRef,{audit:fw.arrayUnion({
        action,number:action==="draw"?n:action==="undo"?row.drawn.at(-1):action==="resolveTie"?winner?.number||null:null,
        by:uid,reason:action==="undo"?reason:null,at:TS.now()
      })});
      return {drawn:history,target:state.target,phase,winnerNumber:winner?.number||null,
        contenderCount:state.contenders.length};
    });
  });
  return {activateBrsmPromo,manageBrsmCard,createBrsmPromo,createBrsmEvent,issueBrsmQrs,
    claimBrsmVisit,manualBrsmVisit,undoBrsmVisit,revokeBrsmQr,disableBrsmPromo,disableBrsmEvent,getBrsmCardAdmin,listBrsmAdmin,beginBrsmDraw,finalizeBrsmDraw,getBrsmDrawReport,updateBrsmDraw};
};
