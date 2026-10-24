"use strict";
/* Campaign-isolated BRSM lottery. Existing BALI account and BRSM membership stay intact.
 * Every mutation runs on the server; browsers never write tickets, draws or QR state.
 */
const {randomBytes,createHash,randomInt}=require("node:crypto");
const QRCode=require("qrcode");
const {ticket,replay}=require("./brsm-core");
const sha=s=>createHash("sha256").update(s).digest("hex");
const clean=(s,n=100)=>typeof s==="string"?s.trim().slice(0,n):"";
const validId=s=>/^[A-Za-z0-9_-]{3,80}$/.test(s);
const now=()=>Date.now();
const fmt=n=>String(n).padStart(6,"0");
function config(raw,fail){
  const title=clean(raw.title,96),requiredVisits=Number(raw.requiredVisits);
  const ballCount=Number(raw.ballCount),ticketSize=Number(raw.ticketSize);
  const winMatches=Number(raw.winMatches),prizes=raw.prizes;
  const idMode="firestore"; // All Bali Card numbers use Firebase.
  if(!title||title.length<3)fail("invalid-argument","Укажите название кампании.");
  if(!Number.isInteger(requiredVisits)||requiredVisits<1||requiredVisits>12)
    fail("invalid-argument","Посещений: от 1 до 12.");
  if(!Number.isInteger(ballCount)||ballCount<10||ballCount>120)
    fail("invalid-argument","Бочонков: от 10 до 120.");
  if(!Number.isInteger(ticketSize)||ticketSize<1||ticketSize>30||ticketSize>ballCount)
    fail("invalid-argument","В билете от 1 до 30 чисел, не больше количества бочонков.");
  if(!Number.isInteger(winMatches)||winMatches<1||winMatches>ticketSize)
    fail("invalid-argument","Совпадений для победы: от 1 до числа цифр в билете.");
  if(!Array.isArray(prizes)||prizes.length<1||prizes.length>12||prizes.some(s=>!clean(s,120)))
    fail("invalid-argument","Нужны от 1 до 12 раундов с призами.");
  return {title,requiredVisits,ballCount,ticketSize,winMatches,idMode,
    rounds:prizes.map((p,i)=>({id:"r"+(i+1),prize:clean(p,120)}))};
}
module.exports=({api,admin,db,TS,verified,privileged,fail,nameAndId,coinRollout})=>{
  const campaigns=db.collection("brsmCampaigns");
  const pointer=db.doc("brsmCampaignState/active");
  const cards=db.collection("brsmCards");
  const stamp=()=>TS.now();
  const fw=admin.firestore.FieldValue;
  const campaign=id=>db.doc("brsmCampaigns/"+id);
  const entry=(id,uid)=>db.doc("brsmCampaigns/"+id+"/entries/"+uid);
  const event=(id,e)=>db.doc("brsmCampaigns/"+id+"/events/"+e);
  const round=(id,r)=>db.doc("brsmCampaigns/"+id+"/rounds/"+r);
  const secret=(id,r)=>db.doc("brsmCampaigns/"+id+"/roundPrivate/"+r);
  async function staff(req){
    const uid=verified(req);
    if(!await privileged(uid))fail("permission-denied","Управление розыгрышами разрешено директору.");
    return uid;
  }
  async function guestById(data){
    const uidInput=clean(data?.uid,128);
    if(uidInput){
      if(!/^[A-Za-z0-9_-]{8,128}$/.test(uidInput))
        fail("invalid-argument","Неверный UID владельца карты.");
      await nameAndId(uidInput);
      return uidInput;
    }
    const n=Number(data?.number);
    if(!Number.isInteger(n)||n<1||n>999999)
      fail("invalid-argument","Неверный шестизначный Bali Card.");
    const hits=await db.collection("baliIds").where("number","==",n).limit(1).get();
    if(hits.empty)fail("not-found","Гость не найден.");
    return hits.docs[0].id;
  }
  async function activeCampaign(){
    const ref=await pointer.get();
    if(!ref.exists||!ref.data().campaignId)fail("failed-precondition","Нет активной кампании.");
    const id=ref.data().campaignId,doc=await campaign(id).get();
    if(!doc.exists)fail("failed-precondition","Кампания недоступна.");
    return {id,...doc.data()};
  }
  const publicConfig=(id,d)=>({
    id,title:d.title,status:d.status,requiredVisits:d.requiredVisits,
    ballCount:d.ballCount,ticketSize:d.ticketSize,winMatches:d.winMatches,
    idMode:d.idMode||"firestore",rounds:d.rounds,roundIndex:d.roundIndex??-1,createdAtMillis:d.createdAt?.toMillis?.()||null
  });
  const coinAwards=require("./brsm-coin-awards")({db,TS,fail,coinRollout});
  // A correction of attendance must never reroll an issued lottery ticket.
  function immutableTickets(previous,config){
    const saved=previous?.reservedTickets?.length?previous.reservedTickets:
      previous?.tickets?.length?previous.tickets:null;
    if(!saved)return config.rounds.map(r=>({
      id:r.id,numbers:ticket(config.ballCount,config.ticketSize)
    }));
    if(!Array.isArray(saved)||saved.length!==config.rounds.length||
      saved.some((row,i)=>row?.id!==config.rounds[i].id||
        !Array.isArray(row.numbers)||row.numbers.length!==config.ticketSize||
        new Set(row.numbers).size!==config.ticketSize||
        row.numbers.some(n=>!Number.isInteger(n)||n<1||n>config.ballCount)))
      fail("failed-precondition","Номера выданного билета повреждены. Повторная выдача запрещена.");
    return saved.map(row=>({id:row.id,numbers:[...row.numbers]}));
  }
  const getCurrentBrsmCampaign=api("getCurrentBrsmCampaign",async req=>{
    verified(req);
    const p=await pointer.get();
    if(!p.exists)return {campaign:null};
    const id=p.data().campaignId;
    const doc=await campaign(id).get();
    return {campaign:doc.exists?publicConfig(id,doc.data()):null};
  });
  const createBrsmCampaign=api("createBrsmCampaign",async req=>{
    const uid=await staff(req),data=config(req.data||{},fail);
    const id="brsm_"+randomBytes(8).toString("hex");
    await campaign(id).create({...data,id,status:"draft",roundIndex:-1,
      createdBy:uid,createdAt:stamp(),updatedAt:stamp()});
    return {campaign:publicConfig(id,{...data,status:"draft",roundIndex:-1})};
  });
  const updateBrsmCampaignDraft=api("updateBrsmCampaignDraft",async req=>{
    const uid=await staff(req),id=clean(req.data?.campaignId,80);
    if(!validId(id))fail("invalid-argument","Неверный ID кампании.");
    const data=config(req.data||{},fail);
    return db.runTransaction(async tx=>{
      const ref=campaign(id),snapshot=await tx.get(ref);
      if(!snapshot.exists||snapshot.data().status!=="draft")
        fail("failed-precondition","Условия разрешено менять только в черновике.");
      tx.update(ref,{...data,updatedAt:stamp(),updatedBy:uid});
      return {ok:true,campaign:publicConfig(id,{...data,status:"draft",roundIndex:-1})};
    });
  });
  const activateBrsmCampaign=api("activateBrsmCampaign",async req=>{
    const uid=await staff(req),id=clean(req.data?.campaignId,80);
    if(!validId(id))fail("invalid-argument","Неверный ID кампании.");
    return db.runTransaction(async tx=>{
      const [p,d]=await Promise.all([tx.get(pointer),tx.get(campaign(id))]);
      if(!d.exists||d.data().status!=="draft")
        fail("failed-precondition","Активировать можно только черновик.");
      if(p.exists&&p.data().campaignId!==id){
        const old=await tx.get(campaign(p.data().campaignId));
        if(old.exists&&!["finished","archived"].includes(old.data().status))
          fail("failed-precondition","Сначала завершите предыдущую кампанию.");
      }
      tx.set(pointer,{campaignId:id,updatedAt:stamp(),updatedBy:uid});
      tx.update(campaign(id),{status:"open",activatedAt:stamp(),updatedAt:stamp()});
      return {ok:true,campaignId:id};
    });
  });
  const archiveBrsmCampaign=api("archiveBrsmCampaign",async req=>{
    const uid=await staff(req),id=clean(req.data?.campaignId,80);
    if(!validId(id))fail("invalid-argument","Неверная кампания.");
    return db.runTransaction(async tx=>{
      const s=await tx.get(campaign(id));
      if(!s.exists||s.data().status!=="finished")
        fail("failed-precondition","Архивировать можно только завершённый розыгрыш.");
      tx.update(campaign(id),{status:"archived",archivedAt:stamp(),archivedBy:uid,updatedAt:stamp()});
      return {ok:true};
    });
  });
  const listBrsmCampaigns=api("listBrsmCampaigns",async req=>{
    await staff(req);
    const [rows,p]=await Promise.all([campaigns.orderBy("createdAt","desc").limit(60).get(),pointer.get()]);
    return {activeId:p.exists?p.data().campaignId:null,
      campaigns:rows.docs.map(x=>publicConfig(x.id,x.data()))};
  });
  const addBrsmCampaignEvent=api("addBrsmCampaignEvent",async req=>{
    const uid=await staff(req),id=clean(req.data?.campaignId,80);
    const eventId=clean(req.data?.eventId,80);
    if(!validId(id)||!validId(eventId))fail("invalid-argument","Неверный ID мероприятия или кампании.");
    const [d,source]=await Promise.all([campaign(id).get(),db.doc("events/"+eventId).get()]);
    if(!d.exists||!["draft","open"].includes(d.data().status))
      fail("failed-precondition","Регистрация посещений закрыта.");
    if(!source.exists||!source.data().date||!/контакт|contact/i.test(clean(source.data().title)))
      fail("invalid-argument","Выберите существующее мероприятие КОНТАКТ в календаре BALI.");
    await event(id,eventId).create({eventId,label:clean(source.data().title,100),
      date:source.data().date,createdBy:uid,createdAt:stamp(),active:true});
    return {ok:true,eventId};
  });
  const listBrsmCampaignEvents=api("listBrsmCampaignEvents",async req=>{
    await staff(req);const id=clean(req.data?.campaignId,80);
    if(!validId(id))fail("invalid-argument","Неверная кампания.");
    const d=await db.collection("brsmCampaigns/"+id+"/events").limit(100).get();
    return {events:d.docs.map(x=>({eventId:x.id,label:x.data().label,date:x.data().date,active:x.data().active}))};
  });
  const issueBrsmCampaignQrs=api("issueBrsmCampaignQrs",async req=>{
    await staff(req);
    const id=clean(req.data?.campaignId,80),eventId=clean(req.data?.eventId,80);
    const count=Number(req.data?.count),hours=Number(req.data?.hours);
    if(!validId(id)||!validId(eventId)||!Number.isInteger(count)||count<1||count>100||
      !Number.isInteger(hours)||hours<1||hours>72)
      fail("invalid-argument","QR: от 1 до 100, время 1–72 часа.");
    const [d,e]=await Promise.all([campaign(id).get(),event(id,eventId).get()]);
    if(!d.exists||d.data().status!=="open"||!e.exists||!e.data().active)
      fail("failed-precondition","Кампания или мероприятие неактивны.");
    const codes=Array.from({length:count},()=>randomBytes(24).toString("hex"));
    const urls=codes.map(code=>"https://baliminsk.by/?brsmCampaignVisit="+code+"#id");
    const png=await Promise.all(urls.map(url=>QRCode.toDataURL(url,{width:270,margin:2})));
    const expiresAt=TS.fromMillis(now()+hours*3600000),batch=db.batch();
    codes.forEach(code=>batch.create(db.doc("brsmCampaignQrs/"+sha(code)),{
      campaignId:id,eventId,used:false,expiresAt,createdAt:stamp()
    }));
    await batch.commit();
    return {campaignId:id,eventId,expiresAtMillis:expiresAt.toMillis(),
      items:urls.map((url,i)=>({url,qrDataUrl:png[i]}))};
  });
  function validateEventWindow(source){
    const e=source,dt=e.date;
    if(!/^\d{4}-\d{2}-\d{2}$/.test(dt))fail("failed-precondition","Неверная дата мероприятия.");
    const start=/^\d{2}:\d{2}$/.test(e.startTime||"")?e.startTime:"23:00";
    const end=/^\d{2}:\d{2}$/.test(e.endTime||"")?e.endTime:"06:00";
    const from=Date.parse(dt+"T"+start+":00+03:00");
    let until=Date.parse(dt+"T"+end+":00+03:00");
    if(end<=start)until+=86400000;
    if(!Number.isFinite(from)||now()<from-5400000||now()>until+7200000)
      fail("failed-precondition","Вход учитывается только во время вечеринки.");
  }
  const claimBrsmCampaignVisit=api("claimBrsmCampaignVisit",async req=>{
    const uid=verified(req),code=clean(req.data?.token,80);
    if(!/^[a-f0-9]{48}$/.test(code))fail("invalid-argument","Неверный QR.");
    await nameAndId(uid);
    const qrRef=db.doc("brsmCampaignQrs/"+sha(code));
    return db.runTransaction(async tx=>{
      const q=await tx.get(qrRef);
      if(!q.exists||q.data().used||q.data().expiresAt.toMillis()<=now())
        fail("failed-precondition","Код просрочен или уже использован.");
      const {campaignId:id,eventId}=q.data();
      const [d,m,e,source,old]=await Promise.all([
        tx.get(campaign(id)),tx.get(cards.doc(uid)),
        tx.get(event(id,eventId)),tx.get(db.doc("events/"+eventId)),tx.get(entry(id,uid))
      ]);
      if(!d.exists||d.data().status!=="open"||!m.exists||m.data().active!==true)
        fail("permission-denied","Нет активной карты БРСМ или регистрации.");
      if(!e.exists||!e.data().active||!source.exists||source.data().date!==e.data().date)
        fail("failed-precondition","Мероприятие изменено или отключено.");
      validateEventWindow(source.data());
      const visits=old.exists?[...(old.data().visits||[])]:[];
      if(visits.some(v=>v.eventId===eventId))fail("already-exists","Это мероприятие уже засчитано.");
      if(visits.length>=d.data().requiredVisits)fail("failed-precondition","Все посещения уже собраны.");
      const coinAward=await coinAwards.award(tx,{uid,campaignId:id,eventId});
      visits.push({eventId,label:e.data().label,source:"qr",at:stamp()});
      const eligible=visits.length>=d.data().requiredVisits;
      const update={uid,campaignId:id,visits,eligible,updatedAt:stamp()};
      if(eligible){
        update.tickets=immutableTickets(old.exists?old.data():null,d.data());
        update.reservedTickets=update.tickets;
      }
      if(old.exists)tx.update(entry(id,uid),update);
      else tx.create(entry(id,uid),{...update,tickets:update.tickets||[],createdAt:stamp()});
      tx.update(qrRef,{used:true,usedAt:stamp(),usedBy:uid});
      return {ok:true,campaignId:id,eventId,visits:visits.length,eligible,
        coinsAwarded:coinAward?.amount||0};
    });
  });
  const manualBrsmCampaignVisit=api("manualBrsmCampaignVisit",async req=>{
    const staffId=await staff(req);
    const id=clean(req.data?.campaignId,80),eventId=clean(req.data?.eventId,80);
    if(!validId(id)||!validId(eventId))
      fail("invalid-argument","Проверьте кампанию и мероприятие.");
    const uid=await guestById(req.data);
    return db.runTransaction(async tx=>{
      const [d,m,e,old]=await Promise.all([tx.get(campaign(id)),tx.get(cards.doc(uid)),
        tx.get(event(id,eventId)),tx.get(entry(id,uid))]);
      if(!d.exists||d.data().status!=="open"||!m.exists||!m.data().active||!e.exists||!e.data().active)
        fail("failed-precondition","Кампания/карта/мероприятие закрыты.");
      const visits=old.exists?[...old.data().visits]:[];
      if(visits.some(v=>v.eventId===eventId))fail("already-exists","Это посещение уже зачтено.");
      if(visits.length>=d.data().requiredVisits)fail("failed-precondition","Уже достигнут лимит посещений.");
      const coinAward=await coinAwards.award(tx,{uid,campaignId:id,eventId});
      visits.push({eventId,label:e.data().label,source:"manual:"+staffId,at:stamp()});
      const eligible=visits.length===d.data().requiredVisits;
      const data={uid,campaignId:id,visits,eligible,updatedAt:stamp()};
      if(eligible){
        data.tickets=immutableTickets(old.exists?old.data():null,d.data());
        data.reservedTickets=data.tickets;
      }
      if(old.exists)tx.update(entry(id,uid),data);
      else tx.create(entry(id,uid),{...data,tickets:data.tickets||[],createdAt:stamp()});
      tx.create(db.collection("brsmCampaigns/"+id+"/audit").doc(),{
        action:"manual-visit",eventId,uid,staffId,at:stamp()
      });
      return {ok:true,visits:visits.length,eligible,coinsAwarded:coinAward?.amount||0};
    });
  });
  const undoBrsmCampaignVisit=api("undoBrsmCampaignVisit",async req=>{
    const staffId=await staff(req),id=clean(req.data?.campaignId,80);
    const eventId=clean(req.data?.eventId,80),reason=clean(req.data?.reason,160);
    if(!validId(id)||!validId(eventId)||reason.length<5)
      fail("invalid-argument","Нужны ID события и причина.");
    const uid=await guestById(req.data);
    return db.runTransaction(async tx=>{
      const [d,old]=await Promise.all([tx.get(campaign(id)),tx.get(entry(id,uid))]);
      if(!d.exists||d.data().status!=="open")
        fail("failed-precondition","После начала розыгрыша посещения не редактируются.");
      if(!old.exists||!old.data().visits.some(v=>v.eventId===eventId))
        fail("not-found","Посещение не найдено.");
      const visits=old.data().visits.filter(v=>v.eventId!==eventId);
      const adjustment=await coinAwards.reverse(tx,{uid,campaignId:id,eventId,reason,staffUid:staffId});
      // Tickets are hidden while ineligible, but their original numbers
      // survive the correction so that the guest cannot reroll.
      const previous=old.data();
      const reservedTickets=previous.reservedTickets?.length?previous.reservedTickets:
        previous.tickets||[];
      tx.update(entry(id,uid),{visits,eligible:false,tickets:[],reservedTickets,
        updatedAt:stamp()});
      tx.create(db.collection("brsmCampaigns/"+id+"/audit").doc(),{
        action:"undo-visit",uid,eventId,reason,staffId,at:stamp()
      });
      return {ok:true,visits:visits.length,coinsReversed:adjustment.amount};
    });
  });
  const getBrsmCampaignEntry=api("getBrsmCampaignEntry",async req=>{
    const uid=verified(req),id=clean(req.data?.campaignId,80);
    if(!validId(id))fail("invalid-argument","Неверная кампания.");
    const [d,e]=await Promise.all([campaign(id).get(),entry(id,uid).get()]);
    if(!d.exists)fail("not-found","Кампания не найдена.");
    return {campaign:publicConfig(id,d.data()),
      entry:e.exists?{visits:e.data().visits||[],tickets:e.data().tickets||[],eligible:e.data().eligible===true}:null};
  });
  const beginBrsmCampaignRound=api("beginBrsmCampaignRound",async req=>{
    const staffId=await staff(req),id=clean(req.data?.campaignId,80);
    if(!validId(id))fail("invalid-argument","Неверная кампания.");
    return db.runTransaction(async tx=>{
      const d=await tx.get(campaign(id));
      if(!d.exists||!["open","drawing"].includes(d.data().status))
        fail("failed-precondition","Кампания недоступна для раундов.");
      const cfg=d.data(),index=(cfg.roundIndex??-1)+1;
      if(index>=cfg.rounds.length)fail("failed-precondition","Все раунды завершены.");
      const roundId=cfg.rounds[index].id;
      if(index>0){
        const prev=await tx.get(round(id,cfg.rounds[index-1].id));
        if(!prev.exists||prev.data().phase!=="finished")
          fail("failed-precondition","Предыдущий раунд ещё не подтверждён.");
      }
      const old=await tx.get(round(id,roundId));
      if(old.exists)fail("already-exists","Раунд уже открыт.");
      const list=await tx.get(db.collection("brsmCampaigns/"+id+"/entries").where("eligible","==",true).limit(1501));
      if(list.size>1500)fail("resource-exhausted","Лимит участников раунда — 1500.");
      if(!list.size)fail("failed-precondition","Нет участников с необходимыми посещениями.");
      // Eligibility is checked against the active BALI CARD at the freeze point.
      const memberships=await Promise.all(list.docs.map(x=>tx.get(cards.doc(x.id))));
      // Each entrant has the same permanent Firebase BALI ID used by COIN.
      const seenNumbers=new Set();
      const tickets=list.docs.flatMap((row,i)=>{
        if(!memberships[i].exists||memberships[i].data().active!==true)return [];
        const t=(row.data().tickets||[]).find(x=>x.id===roundId);
        if(!t||t.numbers?.length!==cfg.ticketSize)return [];
        const number=String(memberships[i].data().number).padStart(6,"0");
        if(seenNumbers.has(number))
          fail("failed-precondition","Обнаружены повторяющиеся номера участников.");
        seenNumbers.add(number);
        return [{uid:row.id,number,numbers:t.numbers}];
      });
      if(!tickets.length)fail("failed-precondition","Нет активных билетов.");
      tx.create(secret(id,roundId),{entries:tickets,startedBy:staffId,startedAt:stamp(),audit:[]});
      tx.create(round(id,roundId),{id:roundId,prize:cfg.rounds[index].prize,
        phase:"live",drawn:[],target:cfg.winMatches,contenderCount:0,
        eligibleCount:tickets.length,winnerNumber:null,updatedAt:stamp(),startedAt:stamp()});
      tx.update(campaign(id),{status:"drawing",roundIndex:index,updatedAt:stamp()});
      return {ok:true,roundId,participants:tickets.length};
    });
  });
  const manageBrsmCampaignBall=api("manageBrsmCampaignBall",async req=>{
    const staffId=await staff(req),id=clean(req.data?.campaignId,80);
    const action=req.data?.action;
    if(!validId(id)||!["draw","undo","resolveTie","finalize"].includes(action))
      fail("invalid-argument","Неверная операция.");
    const reason=clean(req.data?.reason,160),number=Number(req.data?.number);
    if(action==="undo"&&reason.length<5)fail("invalid-argument","При отмене бочонка нужна причина.");
    return db.runTransaction(async tx=>{
      const d=await tx.get(campaign(id));
      if(!d.exists||d.data().status!=="drawing")fail("failed-precondition","Розыгрыш недоступен.");
      const cfg=d.data(),index=cfg.roundIndex,idRound=cfg.rounds[index].id;
      const [pub,pri]=await Promise.all([tx.get(round(id,idRound)),tx.get(secret(id,idRound))]);
      if(!pub.exists||!pri.exists)fail("failed-precondition","Раунд не начат.");
      const state=pub.data(),drawn=[...state.drawn];
      if(state.phase==="finished")fail("failed-precondition","Раунд уже закрыт.");
      let randomWinner=null;
      if(action==="draw"){
        if(state.phase!=="live"||!Number.isInteger(number)||number<1||number>cfg.ballCount||
          drawn.includes(number))fail("failed-precondition","Номер не подходит или уже выпадал.");
        drawn.push(number);
      }else if(action==="undo"){
        if(!drawn.length)fail("failed-precondition","Нечего отменять.");
        drawn.pop();
      }else if(action==="resolveTie"){
        if(state.phase!=="tie")fail("failed-precondition","Дополнительный жребий не требуется.");
        const contenders=new Set(replay(pri.data().entries,drawn,cfg.winMatches,cfg.ballCount).contenders.map(String));
        const finalists=pri.data().entries.filter(e=>contenders.has(String(e.uid)));
        if(finalists.length<2)fail("failed-precondition","Ничья уже разрешена.");
        randomWinner=finalists[randomInt(finalists.length)];
      }else{
        if(state.phase!=="provisional"||!state.winnerNumber)
          fail("failed-precondition","Нет предварительного победителя.");
        tx.update(round(id,idRound),{phase:"finished",confirmedBy:staffId,confirmedAt:stamp(),updatedAt:stamp()});
        tx.update(secret(id,idRound),{audit:fw.arrayUnion({
          action:"finalize",by:staffId,number:state.winnerNumber,at:stamp()
        })});
        if(index===cfg.rounds.length-1)tx.update(campaign(id),{status:"finished",finishedAt:stamp(),updatedAt:stamp()});
        return {ok:true,phase:"finished",winnerNumber:state.winnerNumber,roundId:idRound};
      }
      const result=replay(pri.data().entries,drawn,cfg.winMatches,cfg.ballCount);
      const winner=randomWinner||result.winner;
      const phase=winner?"provisional":result.fallbackNeeded?"tie":"live";
      tx.update(round(id,idRound),{drawn,phase,target:result.target,
        contenderCount:result.contenders.length,winnerNumber:winner?.number||null,updatedAt:stamp()});
      tx.update(secret(id,idRound),{audit:fw.arrayUnion({
        action,number:action==="draw"?number:action==="undo"?state.drawn.at(-1):winner?.number||null,
        by:staffId,reason:action==="undo"?reason:null,at:stamp()
      })});
      return {ok:true,roundId:idRound,drawn,phase,winnerNumber:winner?.number||null};
    });
  });
  const getBrsmCampaignReport=api("getBrsmCampaignReport",async req=>{
    await staff(req);
    const id=clean(req.data?.campaignId,80);
    if(!validId(id))fail("invalid-argument","Неверная кампания.");
    const d=await campaign(id).get();
    if(!d.exists||!["finished","archived"].includes(d.data().status))
      fail("failed-precondition","Отчёт доступен после завершения всех раундов.");
    const cfg=d.data(),results=[];
    for(const r of cfg.rounds){
      const [pub,pri]=await Promise.all([round(id,r.id).get(),secret(id,r.id).get()]);
      if(!pub.exists||pub.data().phase!=="finished"||!pri.exists)
        fail("failed-precondition","Один из раундов не завершён.");
      const drawn=pub.data().drawn,lookup=new Set(drawn);
      results.push({roundId:r.id,prize:r.prize,winnerNumber:pub.data().winnerNumber,
        drawn,entries:pri.data().entries.map(e=>({
          number:e.number,numbers:e.numbers,matches:e.numbers.filter(x=>lookup.has(x)).length
        })),audit:(pri.data().audit||[]).map(x=>({
          action:x.action,number:x.number||null,by:x.by,
          reason:x.reason||null,atMillis:x.at?.toMillis?.()||null
        }))});
    }
    const summary={campaign:publicConfig(id,cfg),rounds:results,exportedAtMillis:now()};
    return {...summary,sha256:sha(JSON.stringify({campaign:summary.campaign,rounds:summary.rounds}))};
  });
  return {getCurrentBrsmCampaign,createBrsmCampaign,updateBrsmCampaignDraft,
    activateBrsmCampaign,archiveBrsmCampaign,listBrsmCampaigns,addBrsmCampaignEvent,
    listBrsmCampaignEvents,issueBrsmCampaignQrs,claimBrsmCampaignVisit,
    manualBrsmCampaignVisit,undoBrsmCampaignVisit,getBrsmCampaignEntry,
    beginBrsmCampaignRound,manageBrsmCampaignBall,getBrsmCampaignReport};
};
