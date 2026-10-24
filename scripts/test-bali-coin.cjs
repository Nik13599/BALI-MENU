"use strict";
const test=require("node:test"),assert=require("node:assert/strict");
const create=require("../functions/bali-coin.js");
const createRollout=require("../functions/coin-rollout.js");
function setup(rolloutEnv){
  const records=new Map();
  let serial=0;
  const stamp=()=>({toMillis:()=>Date.now()});
  const ref=path=>({
    path,id:path.split("/").at(-1),get:async()=>snap(path),
    create:async value=>{assert(!records.has(path));records.set(path,value);},
    update:async value=>{assert(records.has(path));records.set(path,{...records.get(path),...value});},
    set:async value=>records.set(path,value)
  });
  const snap=path=>({id:path.split("/").at(-1),path,ref:ref(path),exists:records.has(path),
    data:()=>records.get(path)});
  function collection(path,tests=[],take=Infinity,reverse=false){
    return {
      doc:(id)=>ref(path+"/"+(id||"auto_"+(++serial))),
      where:(field,op,v)=>{
        assert.equal(op,"==");return collection(path,[...tests,[field,v]],take,reverse);
      },
      limit:n=>collection(path,tests,n,reverse),
      orderBy:(_field,direction)=>collection(path,tests,take,direction==="desc"),
      get:async()=>{
        const docs=[...records.keys()].filter(p=>p.startsWith(path+"/") &&
          p.split("/").length===path.split("/").length+1&&
          tests.every(([f,v])=>records.get(p)[f]===v));
        if(reverse)docs.reverse();
        const result=docs.slice(0,take).map(snap);
        return {docs:result,size:result.length,empty:!result.length};
      }
    };
  }
  const db={
    doc:ref,collection,
    runTransaction:async callback=>{
      const writes=[],tx={
        get:r=>r.get(),set:(r,v)=>writes.push(["set",r.path,v]),
        create:(r,v)=>writes.push(["create",r.path,v]),
        update:(r,v)=>writes.push(["update",r.path,v])
      };
      const result=await callback(tx);
      for(const [type,path] of writes)if(type==="create")assert(!records.has(path),"duplicate creation");
      for(const [type,path,value] of writes){
        if(type==="update")assert(records.has(path),"cannot update absent document");
        records.set(path,type==="update"?{...records.get(path),...value}:value);
      }
      return result;
    }
  };
  const fail=(code,message)=>{const e=new Error(message);e.code=code;throw e;};
  const nameAndId=async uid=>{
    const number=records.get("baliIds/"+uid)?.number;
    if(!Number.isInteger(number))fail("failed-precondition","BALI ID not registered");
    return {uid,number:String(number).padStart(6,"0"),name:records.get("users/"+uid)?.name||uid};
  };
  const functions=create({api:(_n,fn)=>fn,admin:{},db,TS:{now:stamp},
    verified:req=>{if(!req.auth?.uid)fail("unauthenticated","sign in");return req.auth.uid;},
    privileged:async uid=>uid==="director",fail,nameAndId,
    coinRollout:createRollout({fail,env:rolloutEnv||{BALI_COIN_WRITE_MODE:"pilot",
      BALI_COIN_PILOT_CONFIRM:"ALLOW_TEST_COIN_WRITES",
      BALI_COIN_PILOT_UIDS:"guest_alice_0001,guest_bobby_0002"}})});
  const call=(name,uid,data={})=>functions[name]({auth:{uid},data});
  function person(uid,number){
    records.set("users/"+uid,{name:uid});
    records.set("baliIds/"+uid,{uid,number});
  }
  return {records,call,person};
}
test("one Firestore COIN ledger supports all card tiers and idempotent transfers",async()=>{
  const {records,call,person}=setup();
  person("guest_alice_0001",1);person("guest_bobby_0002",2);
  records.set("admins/director",{active:true});
  await assert.rejects(call("coinChange","guest_alice_0001",{
    uid:"guest_alice_0001",operation:"credit",amount:100,reason:"manual reward",requestId:"admin_credit_0001"
  }),e=>e.code==="permission-denied");
  const credit=await call("coinChange","director",{
    uid:"guest_alice_0001",operation:"credit",amount:100,reason:"Award for attendance",requestId:"admin_credit_0001"
  });
  assert.equal(credit.result.balance,100);
  const args={number:"000002",amount:25,comment:"to friend",requestId:"transfer_coin_0001"};
  const transfer=await call("coinTransfer","guest_alice_0001",args);
  assert.equal(transfer.result.balance,75);
  const repeat=await call("coinTransfer","guest_alice_0001",args);
  assert.equal(repeat.result.alreadyProcessed,true);
  await assert.rejects(call("coinTransfer","guest_alice_0001",{...args,amount:26}),
    e=>e.code==="already-exists");
  assert.equal(records.get("baliCoinAccounts/guest_alice_0001").balance,75);
  assert.equal(records.get("baliCoinAccounts/guest_bobby_0002").balance,25);
  assert.equal((await call("coinCard","guest_bobby_0002")).card.number,"000002");
  const history=await call("coinHistory","guest_alice_0001");
  assert.equal(history.items.length,2);
});
test("QR attendance award is granted once and a guest cannot forge an event",async()=>{
  const {records,call,person}=setup();
  person("guest_alice_0001",1);
  records.set("admins/director",{active:true});
  const campaignId="contact_2026",eventId="kontakt_party_01";
  await call("coinSetReward","director",{campaignId,itemId:eventId,kind:"EVENT",
    label:"CONTACT entrance",amount:40});
  await assert.rejects(call("coinClaimVisit","guest_alice_0001",{campaignId,eventId}),
    e=>e.code==="failed-precondition");
  records.set("brsmCampaigns/"+campaignId+"/entries/guest_alice_0001",{
    visits:[{eventId,source:"qr"}]
  });
  const result=await call("coinClaimVisit","guest_alice_0001",{campaignId,eventId});
  assert.equal(result.result.balance,40);
  const repeated=await call("coinClaimVisit","guest_alice_0001",{campaignId,eventId});
  assert.equal(repeated.result.alreadyProcessed,true);
  assert.equal(records.get("baliCoinAccounts/guest_alice_0001").balance,40);
});
test("bar stock, vouchers, server-only redemption and double-spend protection",async()=>{
  const {records,call,person}=setup();
  person("guest_alice_0001",1);
  records.set("admins/director",{active:true});
  // Provisioned existing BALI STAFF accounts use preorderStaff, not staffRoles.
  records.set("preorderStaff/bar_staff_0001",{active:true,role:"preorders"});
  await call("coinChange","director",{uid:"guest_alice_0001",
    operation:"credit",amount:75,reason:"Activity reward",requestId:"staff_credit_0001"});
  await call("coinLotManage","director",{campaignId:"contact_2026",lotId:"special_mocktail",
    name:"BALI Special",category:"bar",price:50,stock:1,active:true});
  const opts={campaignId:"contact_2026",lotId:"special_mocktail",requestId:"buy_drink_000001"};
  const first=await call("coinRedeemLot","guest_alice_0001",opts);
  assert.equal(first.result.balance,25);
  const second=await call("coinRedeemLot","guest_alice_0001",opts);
  assert.equal(second.result.alreadyProcessed,true);
  await assert.rejects(call("coinRedeemLot","guest_alice_0001",{...opts,requestId:"buy_drink_000002"}),
    e=>e.code==="failed-precondition");
  const voucher=first.result.voucher;
  assert.equal((await call("coinMe","bar_staff_0001")).role,"staff");
  await assert.rejects(call("coinChange","bar_staff_0001",{
    uid:"guest_alice_0001",operation:"credit",amount:500,reason:"Unauthorized bonus",
    requestId:"illegal_staff_grant_1"
  }),e=>e.code==="permission-denied");
  const done=await call("coinVoucherFulfill","bar_staff_0001",{number:"000001",voucher});
  assert.equal(done.result.ok,true);
  const again=await call("coinVoucherFulfill","bar_staff_0001",{number:"000001",voucher});
  assert.equal(again.result.alreadyFulfilled,true);
  assert.equal((await call("coinVouchers","guest_alice_0001")).vouchers[0].status,"served");
  assert.equal(records.get("baliCoinAccounts/guest_alice_0001").balance,25);
});

test("frozen rollout keeps the balance readable but denies new debits and credits",async()=>{
  const {records,call,person}=setup({});
  person("guest_alice_0001",1);person("guest_bobby_0002",2);
  records.set("admins/director",{active:true});
  records.set("baliCoinAccounts/guest_alice_0001",{balance:90});
  const {card}=await call("coinCard","guest_alice_0001");
  assert.equal(card.coinBalance,90);
  assert.equal(card.coinWritable,false);
  await assert.rejects(call("coinChange","director",{
    uid:"guest_alice_0001",operation:"credit",amount:10,
    reason:"paused test",requestId:"frozen_credit_0001"
  }),e=>e.code==="failed-precondition");
  await assert.rejects(call("coinTransfer","guest_alice_0001",{
    number:"000002",amount:1,requestId:"frozen_send_0001"
  }),e=>e.code==="failed-precondition");
  await assert.rejects(call("coinRedeemLot","guest_alice_0001",{
    campaignId:"contact_2026",lotId:"offer_01",requestId:"frozen_buy_00001"
  }),e=>e.code==="failed-precondition");
  assert.equal(records.get("baliCoinAccounts/guest_alice_0001").balance,90);
  assert.equal(records.get("baliCoinAccounts/guest_bobby_0002"),undefined);
});

test("BRSM visit can be credited once after revocation, reinstatement and frozen COIN",async()=>{
  const {records,call,person}=setup();
  const uid="guest_alice_0001",campaignId="contact_2026",eventId="contact_2026_01";
  person(uid,1);records.set("admins/director",{active:true});
  await call("coinSetReward","director",{campaignId,itemId:eventId,kind:"EVENT",
    label:"CONTACT attendance",amount:40});
  const entry="brsmCampaigns/"+campaignId+"/entries/"+uid;
  const requestId="visit_"+require("node:crypto").createHash("sha256")
    .update(campaignId+"|"+eventId).digest("hex");
  const operation="baliCoinRequests/"+require("node:crypto").createHash("sha256")
    .update(uid+"|"+requestId).digest("hex");
  records.set(entry,{visits:[{eventId,source:"qr"}]});
  assert.equal((await call("coinClaimVisit",uid,{campaignId,eventId})).result.balance,40);
  // An administrator cancelled the entry and atomically reversed the credit.
  records.set(entry,{visits:[]});
  records.set(operation,{...records.get(operation),revoked:true,reissues:0,balance:0});
  records.set("baliCoinAccounts/"+uid,{balance:0,source:"bali-coin-pilot"});
  await assert.rejects(call("coinClaimVisit",uid,{campaignId,eventId}),
    e=>e.code==="failed-precondition");
  // A new verified QR visit was registered while COIN was disabled.
  records.set(entry,{visits:[{eventId,source:"qr"}]});
  const reissued=await call("coinClaimVisit",uid,{campaignId,eventId});
  assert.equal(reissued.result.reissued,true);
  assert.equal(reissued.result.balance,40);
  const retry=await call("coinClaimVisit",uid,{campaignId,eventId});
  assert.equal(retry.result.alreadyProcessed,true);
  assert.equal(records.get("baliCoinAccounts/"+uid).balance,40);
  const history=[...records.keys()].filter(p=>p.startsWith("baliCoinAccounts/"+uid+"/history/"));
  assert.equal(history.length,2,"one original receipt and exactly one reissue receipt");
});

test("production COIN refuses zero initialization of unmigrated guest accounts",async()=>{
  const live={BALI_COIN_WRITE_MODE:"live",
    BALI_COIN_VERIFIED_EXPORT_SHA256:"a".repeat(64),
    BALI_COIN_LIVE_CONFIRM:"VERIFIED_SOURCE_AND_WALLETS"};
  const {records,call,person}=setup(live);
  const uid="guest_alice_0001";
  person(uid,1);records.set("admins/director",{active:true});
  const unready=(await call("coinCard",uid)).card;
  assert.equal(unready.walletReady,false);
  assert.equal(unready.coinBalance,null);
  assert.equal(unready.coinWritable,false);
  await assert.rejects(call("coinChange","director",{
    uid,operation:"credit",amount:10,reason:"verified reward",
    requestId:"source_missing_0001"
  }),e=>e.code==="failed-precondition");
  assert.equal(records.has("baliCoinAccounts/"+uid),false);
  // A verified preexisting balance can be used without zeroing it.
  records.set("baliCoinAccounts/"+uid,{balance:72,migrationComplete:true});
  const ready=(await call("coinCard",uid)).card;
  assert.equal(ready.walletReady,true);
  assert.equal(ready.coinWritable,true);
  assert.equal((await call("coinChange","director",{
    uid,operation:"credit",amount:10,reason:"verified reward",
    requestId:"source_verified_0001"
  })).result.balance,82);
});

test("pilot cannot alter a pre-existing ordinary or migrated guest wallet",async()=>{
  const {records,call,person}=setup();
  const uid="guest_alice_0001"; person(uid,1);
  records.set("admins/director",{active:true});
  records.set("baliCoinAccounts/"+uid,{balance:240,source:"legacy-sheets-migration",migrationComplete:true});
  await assert.rejects(call("coinChange","director",{
    uid,operation:"credit",amount:3,reason:"Misrouted test reward",
    requestId:"pilot_legacy_wallet_01"
  }),e=>e.code==="failed-precondition");
  assert.equal(records.get("baliCoinAccounts/"+uid).balance,240);
  const card=(await call("coinCard",uid)).card;
  assert.equal(card.coinWritable,false);
});

test("idempotent retries return the current balance, never a stale historical receipt",async()=>{
  const {records,call,person}=setup();
  const uid="guest_alice_0001",other="guest_bobby_0002";
  person(uid,1);person(other,2);
  records.set("admins/director",{active:true});
  const credit={uid,operation:"credit",amount:100,reason:"Initial test reward",requestId:"retry_initial_0001"};
  await call("coinChange","director",credit);
  const transfer={number:"000002",amount:25,comment:"test",requestId:"retry_transfer_0001"};
  await call("coinTransfer",uid,transfer);
  await call("coinChange","director",{uid,operation:"credit",amount:20,
    reason:"Second test reward",requestId:"retry_additional_0002"});
  assert.equal(records.get("baliCoinAccounts/"+uid).balance,95);
  assert.equal((await call("coinTransfer",uid,transfer)).result.balance,95);
  assert.equal((await call("coinChange","director",credit)).result.balance,95);
  assert.equal(records.get("baliCoinAccounts/"+other).balance,25);
});
test("retry of earlier visit or bar purchase never overwrites newer wallet balance in UI",async()=>{
  const {records,call,person}=setup();
  const uid="guest_alice_0001";person(uid,1);
  records.set("admins/director",{active:true});
  const campaignId="contact_2026",eventId="contact_2026_a";
  await call("coinSetReward","director",{campaignId,itemId:eventId,
    kind:"EVENT",label:"Test attendance",amount:80});
  records.set("brsmCampaigns/"+campaignId+"/entries/"+uid,
    {visits:[{eventId,source:"qr"}]});
  const claim={campaignId,eventId};
  assert.equal((await call("coinClaimVisit",uid,claim)).result.balance,80);
  await call("coinLotManage","director",{campaignId,lotId:"refreshment",
    name:"Pilot mocktail",category:"bar",price:20,stock:4,active:true});
  const buy={campaignId,lotId:"refreshment",requestId:"retry_purchase_0001"};
  assert.equal((await call("coinRedeemLot",uid,buy)).result.balance,60);
  await call("coinChange","director",{uid,operation:"credit",amount:10,
    reason:"Late adjustment",requestId:"retry_adjust_0003"});
  assert.equal((await call("coinClaimVisit",uid,claim)).result.balance,70);
  assert.equal((await call("coinRedeemLot",uid,buy)).result.balance,70);
  assert.equal(records.get("baliCoinAccounts/"+uid).balance,70);
  assert.equal(records.get("baliCoinLots/"+campaignId+"_refreshment").sold,1);
});
