"use strict";
const test=require("node:test");
const assert=require("node:assert/strict");
const fs=require("node:fs");
const vm=require("node:vm");
const crypto=require("node:crypto");
const {ticket,replay}=require("../functions/brsm-core");
const createRollout=require("../functions/coin-rollout");

function prepare(moduleName="brsm"){
  const records=new Map();
  class Timestamp{
    constructor(ms){this.ms=ms;}
    toMillis(){return this.ms;}
    static now(){return new Timestamp(Date.now());}
    static fromMillis(n){return new Timestamp(n);}
  }
  const clone=v=>v instanceof Timestamp?new Timestamp(v.ms):
    Array.isArray(v)?v.map(clone):
    v && typeof v==="object"?Object.fromEntries(Object.entries(v).map(([k,x])=>[k,clone(x)])):v;
  const FieldValue={increment:n=>({incrementBy:n}),arrayUnion:x=>({union:x})};
  class Snap{
    constructor(path){this.path=path;this.id=path.split("/").at(-1);this.exists=records.has(path);}
    data(){return clone(records.get(this.path));}
  }
  function apply(path,data,merge){
    const next=merge?clone(records.get(path)):{};
    for(const [key,value] of Object.entries(data)){
      if(value && typeof value==="object" && Object.hasOwn(value,"incrementBy"))
        next[key]=Number(next[key]||0)+value.incrementBy;
      else if(value && typeof value==="object" && Object.hasOwn(value,"union"))
        next[key]=[...(next[key]||[]),clone(value.union)];
      else next[key]=clone(value);
    }
    records.set(path,next);
  }
  function doc(path){return {
    path,id:path.split("/").at(-1),
    get:async()=>new Snap(path),
    create:async data=>{assert.equal(records.has(path),false);apply(path,data,false);},
    set:async data=>apply(path,data,false),
    update:async data=>{assert.equal(records.has(path),true);apply(path,data,true);}
  };}
  function col(name,checks=[],limit=Infinity){
    return {
      doc:id=>doc(name+"/"+(id||crypto.randomBytes(8).toString("hex"))),
      where:(key,op,v)=>{assert.equal(op,"==");return col(name,[...checks,[key,v]],limit);},
      orderBy:()=>col(name,checks,limit),
      limit:n=>col(name,checks,n),
      get:async()=>{
        const docs=[];
        for(const [path,row] of records)if(path.startsWith(name+"/")&&path.split("/").length===name.split("/").length+1&&
          checks.every(([key,value])=>row[key]===value)){
          docs.push(new Snap(path));if(docs.length>=limit)break;
        }
        return {docs,size:docs.length,empty:docs.length===0};
      }
    };
  }
  const db={doc,collection:col,
    runTransaction:async fn=>{
      const writes=[],tx={
        get:ref=>ref.get(),
        set:(r,v)=>writes.push(["set",r.path,v]),
        update:(r,v)=>writes.push(["update",r.path,v]),
        set:(r,v)=>writes.push(["set",r.path,v]),
        create:(r,v)=>writes.push(["create",r.path,v])
      };
      const result=await fn(tx);
      for(const [operation,path] of writes)
        if(operation==="create"&&records.has(path))throw Error("duplicate "+path);
      for(const [operation,path,value] of writes)apply(path,value,operation==="update");
      return result;
    },
    batch:()=>{
      const items=[];
      return {create:(ref,v)=>items.push([ref.path,v]),
        commit:async()=>{for(const [p,v] of items){assert(!records.has(p));apply(p,v,false);}}};
    }
  };
  const fail=(code,message)=>{const e=new Error(message);e.code=code;throw e;};
  const nameAndId=async uid=>{
    if(!records.has("baliIds/"+uid)||!records.has("users/"+uid))fail("failed-precondition","No BALI ID");
    const number=records.get("baliIds/"+uid).number;
    return {uid,number:String(number).padStart(6,"0"),name:records.get("users/"+uid).name};
  };
  const ctx={api:(_name,fn)=>fn,admin:{firestore:{FieldValue}},db,TS:Timestamp,
    verified:req=>{if(!req.auth?.uid)fail("unauthenticated","Sign in");return req.auth.uid;},
    privileged:async uid=>uid==="director",fail,nameAndId,
    coinRollout:createRollout({fail,env:{BALI_COIN_WRITE_MODE:"live",
      BALI_COIN_VERIFIED_EXPORT_SHA256:"a".repeat(64),
      BALI_COIN_LIVE_CONFIRM:"VERIFIED_SOURCE_AND_WALLETS"}})};
  const module={exports:{}};
  vm.runInNewContext(fs.readFileSync("functions/"+moduleName+".js","utf8"),{
    module,exports:module.exports,
    require:p=>p==="node:crypto"?crypto:p==="qrcode"?{toDataURL:async url=>"data:image/png;base64,"+Buffer.from(url).toString("base64")}:
      p==="./brsm-core"?{ticket,replay}:
      p==="./brsm-coin-awards"?require("../functions/brsm-coin-awards"):require(p),
    Date,Math,Number,String,Boolean,Array,RegExp,Error,Promise,Buffer
  },{filename:"functions/"+moduleName+".js"});
  const calls=module.exports(ctx);
  const call=(name,uid,data={})=>calls[name]({auth:{uid},data});
  return {records,call};
}
test("BRSM full lifecycle: promotion, 3 distinct events, immutable ticket, draws",async()=>{
  const {records,call}=prepare();
  const date=new Date(Date.now()+3*3600000).toISOString().slice(0,10);
  for(const [uid,num] of [["alice",1],["bob",2],["director",3]]){
    records.set("users/"+uid,{name:uid});
    records.set("baliIds/"+uid,{uid,number:num});
  }
  const eventIds=[date,date+"__2",date+"__3"];
  for(const [idx,id] of eventIds.entries()){
    records.set("events/"+id,{date,title:"КОНТАКТ "+(idx+1),startTime:"00:00",endTime:"23:59"});
    assert.equal((await call("createBrsmEvent","director",{eventId:id,label:"КОНТАКТ "+(idx+1),date})).ok,true);
  }
  await assert.rejects(call("createBrsmPromo","alice",{maxUses:1,days:1}),e=>e.code==="permission-denied");
  const promo=await call("createBrsmPromo","director",{maxUses:1,days:1});
  assert.match(promo.code,/^BRSM-[A-F0-9]{10}$/);
  assert.equal((await call("activateBrsmPromo","alice",{code:promo.code})).ok,true);
  await assert.rejects(call("activateBrsmPromo","bob",{code:promo.code}),e=>e.code==="failed-precondition");
  assert.equal((await call("manageBrsmCard","director",{number:"000002",op:"assign"})).ok,true);
  // One bearer QR is consumed only once and cannot be replayed by a second account.
  for(let i=0;i<3;i++){
    const eventId=eventIds[i];
    const batch=await call("issueBrsmQrs","director",{eventId,count:3,hours:24});
    const token=new URL(batch.items[0].url).searchParams.get("brsmVisit");
    const replayToken=new URL(batch.items[1].url).searchParams.get("brsmVisit");
    const before=records.get("brsmCards/alice").visits.length;
    const visit=await call("claimBrsmVisit","alice",{token});
    assert.equal(visit.visits,before+1);
    await assert.rejects(call("claimBrsmVisit","bob",{token}),e=>e.code==="failed-precondition");
    await assert.rejects(call("claimBrsmVisit","alice",{token:replayToken}),e=>e.code==="already-exists");
  }
  const lookup=await call("getBrsmCardAdmin","director",{number:"000001"});
  assert.equal(lookup.card.number,"000001");
  assert.equal(lookup.card.visits.length,3);
  await assert.rejects(call("getBrsmCardAdmin","alice",{number:"000002"}),e=>e.code==="permission-denied");
  const card=records.get("brsmCards/alice");
  assert.equal(card.visits.length,3);
  assert.equal(card.eligible,true);
  assert.equal(card.numbers.length,10);
  assert.equal(new Set(card.numbers).size,10);
  assert(card.numbers.every(n=>n>=1&&n<=90));
  const numbers=[...card.numbers];
  // Privileged reversal revokes a previously created ticket, records an audit event.
  await call("undoBrsmVisit","director",{number:"000001",eventId:eventIds[2],reason:"Корректировка тестовой отметки"});
  assert.equal(records.get("brsmCards/alice").eligible,false);
  assert.equal(records.get("brsmCards/alice").numbers.length,0);
  assert.equal([...records.keys()].filter(x=>x.startsWith("brsmAudit/")).length,1);
  await call("manualBrsmVisit","director",{number:"000001",eventId:eventIds[2]});
  assert.equal(records.get("brsmCards/alice").numbers.length,10);
  assert.equal(JSON.stringify(records.get("brsmCards/alice").numbers),JSON.stringify(numbers),
    "Legacy BRSM attendance correction must restore identical lottery numbers");
  assert.equal((await call("beginBrsmDraw","director",{})).participants,1);
  await assert.rejects(call("manualBrsmVisit","director",{number:"000002",eventId:eventIds[2]}),e=>e.code==="failed-precondition");
  await assert.rejects(call("issueBrsmQrs","director",{eventId:eventIds[0],count:1,hours:24}),e=>e.code==="failed-precondition");
  const first=await call("updateBrsmDraw","director",{action:"draw",number:numbers[0]});
  assert.equal(first.drawn.length,1);
  await assert.rejects(call("updateBrsmDraw","director",{action:"draw",number:numbers[0]}),e=>e.code==="already-exists");
  await assert.rejects(call("updateBrsmDraw","director",{action:"undo"}),e=>e.code==="invalid-argument");
  const reverted=await call("updateBrsmDraw","director",{action:"undo",reason:"Ошибка ввода номера"});
  assert.equal(reverted.drawn.length,0);
  await assert.rejects(call("getBrsmDrawReport","director",{}),e=>e.code==="failed-precondition");
  const current=records.get("brsmCards/alice").numbers;
  for(const number of current.slice(0,5))await call("updateBrsmDraw","director",{action:"draw",number});
  await assert.rejects(call("getBrsmDrawReport","director",{}),e=>e.code==="failed-precondition");
  const confirmed=await call("finalizeBrsmDraw","director",{});
  assert.equal(confirmed.phase,"finished");
  await assert.rejects(call("updateBrsmDraw","director",{action:"undo",reason:"Ошибочная запись"}),e=>e.code==="failed-precondition");
  const report=await call("getBrsmDrawReport","director",{});
  assert.equal(report.phase,"finished");
  assert.equal(report.participantsCount,1);
  assert.equal(report.participants[0].matches,5);
  assert.equal(report.winnerNumber,"000001");
  assert.equal(report.audit.length,8); // first draw, undo, five final balls, confirmation
  assert.match(report.sha256,/^[0-9a-f]{64}$/);
  await assert.rejects(call("getBrsmDrawReport","alice",{}),e=>e.code==="permission-denied");
});

test("90-ball deadlock is resolved by a recorded final draw among tied cards",async()=>{
  const {records,call}=prepare();
  const numbers=[1,2,3,4,5,6,7,8,9,10];
  const entrants=[
    {uid:"a",number:"000001",numbers},
    {uid:"b",number:"000002",numbers}
  ];
  const full=Array.from({length:90},(_,i)=>i+1);
  records.set("brsmDraws/current",{
    phase:"tie",drawn:full,target:10,eligibleCount:2,contenderCount:2,winnerNumber:null
  });
  records.set("brsmDrawPrivate/current",{
    entries:entrants,audit:[],startedAt:{toMillis:()=>Date.now()}
  });
  const provisional=await call("updateBrsmDraw","director",{action:"resolveTie"});
  assert.equal(provisional.phase,"provisional");
  assert.ok(["000001","000002"].includes(provisional.winnerNumber));
  const audit=records.get("brsmDrawPrivate/current").audit;
  assert.equal(audit.length,1);
  assert.equal(audit[0].action,"resolveTie");
  assert.equal(audit[0].number,provisional.winnerNumber);
  const completed=await call("finalizeBrsmDraw","director",{});
  assert.equal(completed.phase,"finished");
  assert.equal(completed.winnerNumber,provisional.winnerNumber);
});

test("BRSM campaigns: configurable visits, ball pools, prizes, rounds and immutable history",async()=>{
  const {records,call}=prepare("brsm-campaigns");
  const date=new Date(Date.now()+3*3600000).toISOString().slice(0,10);
  records.set("users/alice",{name:"ALICE"});
  records.set("baliIds/alice",{uid:"alice",number:1});
  records.set("brsmCards/alice",{active:true,number:"000001",name:"ALICE"});
  records.set("baliCoinAccounts/alice",{balance:0,migrationComplete:true});
  const custom={
    title:"KONTAKT · Winter 2026",requiredVisits:2,ballCount:30,
    ticketSize:5,winMatches:3,prizes:["iPhone","BALI VIP"]
  };
  await assert.rejects(call("createBrsmCampaign","alice",custom),e=>e.code==="permission-denied");
  const created=await call("createBrsmCampaign","director",custom);
  const id=created.campaign.id;
  assert.equal(created.campaign.status,"draft");
  await call("updateBrsmCampaignDraft","director",{campaignId:id,...custom,prizes:["Phone Pro","BALI VIP"]});
  const next=await call("createBrsmCampaign","director",{
    title:"KONTAKT 2027",requiredVisits:4,ballCount:70,ticketSize:12,
    winMatches:6,prizes:["Prizes 1","Prizes 2","Prizes 3"]
  });
  assert.equal(next.campaign.rounds.length,3);
  await call("activateBrsmCampaign","director",{campaignId:id});
  await assert.rejects(call("activateBrsmCampaign","director",{campaignId:next.campaign.id}),
    e=>e.code==="failed-precondition");
  await assert.rejects(call("updateBrsmCampaignDraft","director",{campaignId:id,...custom}),
    e=>e.code==="failed-precondition");
  const eventIds=[date,date+"__2"];
  for(const [i,eventId] of eventIds.entries()){
    records.set("events/"+eventId,{date,title:"КОНТАКТ "+i,startTime:"00:00",endTime:"23:59"});
    assert.equal((await call("addBrsmCampaignEvent","director",{campaignId:id,eventId})).ok,true);
    // A director-configured reward is credited atomically by the campaign
    // attendance callable, even if the guest never opens the BALI COIN panel.
    const rewardKey=crypto.createHash("sha256").update(id+"|EVENT|"+eventId).digest("hex");
    records.set("baliCoinRewards/"+rewardKey,{active:true,amount:i===0?15:25});
    const qr=await call("issueBrsmCampaignQrs","director",{
      campaignId:id,eventId,count:2,hours:24
    });
    const token=new URL(qr.items[0].url).searchParams.get("brsmCampaignVisit");
    const another=new URL(qr.items[1].url).searchParams.get("brsmCampaignVisit");
    assert.equal((await call("claimBrsmCampaignVisit","alice",{token})).visits,i+1);
    await assert.rejects(call("claimBrsmCampaignVisit","alice",{token}),e=>e.code==="failed-precondition");
    await assert.rejects(call("claimBrsmCampaignVisit","alice",{token:another}),e=>e.code==="already-exists");
  }
  assert.equal(records.get("baliCoinAccounts/alice").balance,40);
  const ledgerRows=[...records.keys()].filter(x=>x.startsWith("baliCoinAccounts/alice/history/"));
  assert.equal(ledgerRows.length,2);
  const rewardKey=crypto.createHash("sha256").update("alice|visit_"+
    crypto.createHash("sha256").update(id+"|"+eventIds[0]).digest("hex")).digest("hex");
  assert(records.has("baliCoinRequests/"+rewardKey));
  const entryPath="brsmCampaigns/"+id+"/entries/alice";
  const originalTickets=JSON.stringify(records.get(entryPath).tickets);
  await call("undoBrsmCampaignVisit","director",{
    campaignId:id,eventId:eventIds[1],number:1,reason:"Ошибочная отметка в тестовом событии"
  });
  assert.equal(records.get("baliCoinAccounts/alice").balance,15);
  assert.equal(records.get(entryPath).tickets.length,0);
  assert.equal(JSON.stringify(records.get(entryPath).reservedTickets),originalTickets);
  const hidden=await call("getBrsmCampaignEntry","alice",{campaignId:id});
  assert.equal(hidden.entry.eligible,false);
  assert.equal(hidden.entry.tickets.length,0);
  const reissued=await call("manualBrsmCampaignVisit","director",{
    campaignId:id,eventId:eventIds[1],number:1
  });
  assert.equal(reissued.coinsAwarded,25);
  assert.equal(records.get("baliCoinAccounts/alice").balance,40);
  assert.equal(JSON.stringify(records.get(entryPath).tickets),originalTickets,
    "Corrected attendance must retain the originally issued lottery numbers");
  // A second correction followed by a newly issued QR must not reroll either.
  await call("undoBrsmCampaignVisit","director",{
    campaignId:id,eventId:eventIds[1],number:1,reason:"Вторая корректировка отметки"
  });
  const restoredQr=await call("issueBrsmCampaignQrs","director",{
    campaignId:id,eventId:eventIds[1],count:1,hours:24
  });
  const restoredToken=new URL(restoredQr.items[0].url).searchParams.get("brsmCampaignVisit");
  const restored=await call("claimBrsmCampaignVisit","alice",{token:restoredToken});
  assert.equal(restored.coinsAwarded,25);
  assert.equal(records.get("baliCoinAccounts/alice").balance,40);
  assert.equal(JSON.stringify(records.get(entryPath).tickets),originalTickets,
    "QR reissue after staff cancellation must preserve immutable tickets");
  const e=await call("getBrsmCampaignEntry","alice",{campaignId:id});
  assert.equal(e.entry.visits.length,2);
  assert.equal(e.entry.tickets.length,2);
  assert(e.entry.tickets.every(t=>t.numbers.length===5&&new Set(t.numbers).size===5&&
    t.numbers.every(n=>n>=1&&n<=30)));
  assert.equal((await call("beginBrsmCampaignRound","director",{campaignId:id})).roundId,"r1");
  await assert.rejects(call("manualBrsmCampaignVisit","director",{campaignId:id,eventId:eventIds[0],number:1}),
    e=>e.code==="failed-precondition");
  const first=e.entry.tickets[0].numbers;
  for(const n of first.slice(0,3))await call("manageBrsmCampaignBall","director",{campaignId:id,action:"draw",number:n});
  const round1=records.get("brsmCampaigns/"+id+"/rounds/r1");
  assert.equal(round1.phase,"provisional");
  await assert.rejects(call("beginBrsmCampaignRound","director",{campaignId:id}),
    e=>e.code==="failed-precondition");
  assert.equal((await call("manageBrsmCampaignBall","director",{campaignId:id,action:"finalize"})).phase,"finished");
  assert.equal((await call("beginBrsmCampaignRound","director",{campaignId:id})).roundId,"r2");
  for(const n of e.entry.tickets[1].numbers.slice(0,3))await call("manageBrsmCampaignBall","director",{
    campaignId:id,action:"draw",number:n
  });
  await call("manageBrsmCampaignBall","director",{campaignId:id,action:"finalize"});
  const report=await call("getBrsmCampaignReport","director",{campaignId:id});
  assert.equal(report.campaign.status,"finished");
  assert.deepEqual(Array.from(report.rounds,x=>String(x.prize)),["Phone Pro","BALI VIP"]);
  assert.equal(report.rounds.length,2);
  assert.match(report.sha256,/^[0-9a-f]{64}$/);
  await call("activateBrsmCampaign","director",{campaignId:next.campaign.id});
  await call("archiveBrsmCampaign","director",{campaignId:id});
  assert.equal((await call("getBrsmCampaignReport","director",{campaignId:id})).rounds.length,2);
  assert.equal((await call("getCurrentBrsmCampaign","alice",{})).campaign.id,next.campaign.id);
});

test("corrupted held BRSM lottery tickets are never silently rerolled",async()=>{
  const {records,call}=prepare("brsm-campaigns");
  const date=new Date(Date.now()+3*3600000).toISOString().slice(0,10);
  const uid="test_member_0001",eventId="contact_integrity_01";
  records.set("users/"+uid,{name:"Test guest"});
  records.set("baliIds/"+uid,{uid,number:102});
  records.set("brsmCards/"+uid,{uid,number:"000102",active:true});
  records.set("events/"+eventId,{
    date,title:"CONTACT integrity event",startTime:"00:00",endTime:"23:59"
  });
  const created=await call("createBrsmCampaign","director",{
    title:"CONTACT ticket integrity",requiredVisits:1,ballCount:30,
    ticketSize:5,winMatches:3,prizes:["Fixture prize"]
  });
  const campaignId=created.campaign.id;
  await call("activateBrsmCampaign","director",{campaignId});
  await call("addBrsmCampaignEvent","director",{campaignId,eventId});
  await call("manualBrsmCampaignVisit","director",{campaignId,eventId,uid});
  const location="brsmCampaigns/"+campaignId+"/entries/"+uid;
  assert.equal(records.get(location).tickets[0].numbers.length,5);
  await call("undoBrsmCampaignVisit","director",{
    campaignId,eventId,uid,reason:"Correct test attendance"
  });
  records.get(location).reservedTickets[0].numbers=[1,1,1,1,1];
  await assert.rejects(call("manualBrsmCampaignVisit","director",{
    campaignId,eventId,uid
  }),e=>e.code==="failed-precondition");
  assert.equal(records.get(location).visits.length,0,
    "Invalid stored ticket must not create a fresh visit");
});

test("director can resolve BRSM membership by stable UID while guest cannot",async()=>{
  const {records,call}=prepare();
  const uid="guest_uid_0001";
  records.set("users/"+uid,{name:"KONTAKT GUEST"});
  records.set("baliIds/"+uid,{number:42,uid});
  await assert.rejects(call("manageBrsmCard","stranger",{uid,number:"000001",op:"assign"}),
    e=>e.code==="permission-denied");
  const assigned=await call("manageBrsmCard","director",{uid,number:"000999",op:"assign"});
  assert.equal(assigned.ok,true);
  assert.equal(assigned.number,"000042"); // Firebase BALI ID retained, no renumbering.
  assert.equal(records.get("brsmCards/"+uid).uid,uid);
  const found=await call("getBrsmCardAdmin","director",{uid,number:"000999"});
  assert.equal(found.card.uid,uid);
  assert.equal(found.card.number,"000042");
  await assert.rejects(call("manageBrsmCard","director",{uid:"?bad",op:"revoke"}),
    e=>e.code==="invalid-argument");
});

test("shared Firebase BALI COIN: transfer, visit credit, bar voucher, staff issue and idempotency",async()=>{
  const {records,call}=prepare("bali-coin");
  const a="alice_coins_001",b="bob_coins_0002",staff="bartender_01234";
  for(const [uid,num] of [[a,101],[b,202]]){
    records.set("users/"+uid,{name:uid});
    records.set("baliIds/"+uid,{uid,number:num});
    records.set("baliCoinAccounts/"+uid,{balance:0,migrationComplete:true});
  }
  records.set("admins/director",{active:true});
  records.set("staffRoles/"+staff,{active:true,role:"staff"});
  records.set("guestPrivileges/"+a,{tier:"Gold",benefits:[]});
  const current=await call("coinCard",a);
  assert.equal(current.card.number,"000101");
  assert.equal(current.card.tier,"Gold");
  assert.equal(current.card.coinBalance,0);
  await assert.rejects(call("coinChange",a,{uid:b,operation:"credit",amount:25,
    reason:"Проверка начисления",requestId:"grant_coin_00000001"}),e=>e.code==="permission-denied");
  const grant={uid:a,operation:"credit",amount:150,reason:"Стартовый баланс гостя",requestId:"grant_coin_00000001"};
  assert.equal((await call("coinChange","director",grant)).result.balance,150);
  assert.equal((await call("coinChange","director",grant)).result.alreadyProcessed,true);
  const request={number:"000202",amount:30,comment:"Другу",requestId:"transfer_coin_000001"};
  assert.equal((await call("coinTransfer",a,request)).result.balance,120);
  assert.equal((await call("coinTransfer",a,request)).result.alreadyProcessed,true);
  assert.equal((await call("coinCard",b)).card.coinBalance,30);
  await assert.rejects(call("coinTransfer",a,{...request,amount:31}),e=>e.code==="already-exists");
  await assert.rejects(call("coinTransfer",a,{...request,number:"000101",requestId:"transfer_coin_000002"}),e=>e.code==="invalid-argument");
  const campaignId="contact_2026",eventId="contact_2026_01";
  await call("coinSetReward","director",{campaignId,itemId:eventId,kind:"EVENT",label:"Вход на КОНТАКТ",amount:40});
  const entryPath="brsmCampaigns/"+campaignId+"/entries/"+a;
  records.set(entryPath,{visits:[{eventId}],eligible:false});
  const visit=await call("coinClaimVisit",a,{campaignId,eventId});
  assert.equal(visit.result.balance,160);
  await call("coinSetReward","director",{campaignId,itemId:eventId,kind:"EVENT",label:"Вход на КОНТАКТ",amount:100});
  assert.equal((await call("coinClaimVisit",a,{campaignId,eventId})).result.alreadyProcessed,true);
  assert.equal((await call("coinCard",a)).card.coinBalance,160);
  await assert.rejects(call("coinClaimVisit",b,{campaignId,eventId}),e=>e.code==="failed-precondition");
  await call("coinSetReward","director",{campaignId,itemId:"dance_contest",kind:"ACTIVITY",label:"Танцевальный конкурс",amount:10});
  const activity={campaignId,activityId:"dance_contest",number:"000202",requestId:"dance_bonus_0000001"};
  assert.equal((await call("coinAwardActivity","director",activity)).result.balance,40);
  assert.equal((await call("coinAwardActivity","director",activity)).result.alreadyProcessed,true);
  const lot={campaignId,lotId:"bar_cocktail",category:"bar",name:"Коктейль BALI",
    price:80,stock:1,active:true};
  assert.equal((await call("coinLotManage","director",lot)).result.remaining,1);
  assert.equal((await call("coinLots",a,{campaignId})).lots.length,1);
  const purchase={campaignId,lotId:"bar_cocktail",requestId:"redeem_bar_000001"};
  const paid=(await call("coinRedeemLot",a,purchase)).result;
  assert.equal(paid.balance,80);
  assert.match(paid.voucher,/^LOT:/);
  assert.equal((await call("coinRedeemLot",a,purchase)).result.alreadyProcessed,true);
  assert.equal((await call("coinCard",a)).card.coinBalance,80);
  assert.equal((await call("coinLots",b,{campaignId})).lots[0].remaining,0);
  await assert.rejects(call("coinRedeemLot",b,{...purchase,requestId:"redeem_bar_000002"}),e=>e.code==="failed-precondition");
  await assert.rejects(call("coinVoucherFulfill",a,{number:"000101",voucher:paid.voucher}),e=>e.code==="permission-denied");
  await assert.rejects(call("coinVoucherFulfill",staff,{number:"000202",voucher:paid.voucher}),e=>e.code==="not-found");
  const fulfilled=await call("coinVoucherFulfill",staff,{number:"000101",voucher:paid.voucher});
  assert.equal(fulfilled.result.name,"Коктейль BALI");
  assert.equal((await call("coinVoucherFulfill",staff,{number:"000101",voucher:paid.voucher})).result.alreadyFulfilled,true);
  assert.equal((await call("coinVouchers",a)).vouchers[0].status,"served");
  assert.equal((await call("coinCard",a)).card.coinBalance,80);
  const history=await call("coinHistory",a);
  assert(history.items.length>=4);
});
