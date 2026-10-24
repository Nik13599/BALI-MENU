"use strict";
const test=require("node:test"),assert=require("node:assert/strict");
const create=require("../functions/coin-rollout");
const fail=(code,message)=>{throw Object.assign(new Error(message),{code})};
const policy=env=>create({fail,env});
const a="pilot_guest_00001",b="pilot_guest_00002",other="real_guest_00001";
test("writes default to frozen; partial production configuration cannot activate them",()=>{
  const disabled=policy({});
  assert.equal(disabled.phase,"frozen");
  assert.equal(disabled.eligible([a]),false);
  assert.throws(()=>disabled.assertWrite([a]),e=>e.code==="failed-precondition");
  assert.equal(policy({BALI_COIN_WRITE_MODE:"live",
    BALI_COIN_VERIFIED_EXPORT_SHA256:"a".repeat(64)}).eligible([a]),false);
  assert.equal(policy({BALI_COIN_WRITE_MODE:"live",
    BALI_COIN_LIVE_CONFIRM:"VERIFIED_SOURCE_AND_WALLETS",
    BALI_COIN_VERIFIED_EXPORT_SHA256:"invalid"}).eligible([a]),false);
});
test("pilot cannot transfer to or credit a non-test card",()=>{
  const p=policy({BALI_COIN_WRITE_MODE:"pilot",
    BALI_COIN_PILOT_CONFIRM:"ALLOW_TEST_COIN_WRITES",
    BALI_COIN_PILOT_UIDS:a+","+b});
  assert.equal(p.phase,"pilot");
  assert.equal(p.eligible([a,b]),true);
  assert.equal(p.eligible([a,other]),false);
  assert.equal(p.eligible([other]),false);
  assert.equal(policy({BALI_COIN_WRITE_MODE:"pilot",BALI_COIN_PILOT_UIDS:a}).eligible([a]),false);
});
test("full launch requires explicit confirmation and the reviewed export hash",()=>{
  const p=policy({BALI_COIN_WRITE_MODE:"live",
    BALI_COIN_VERIFIED_EXPORT_SHA256:"a".repeat(64),
    BALI_COIN_LIVE_CONFIRM:"VERIFIED_SOURCE_AND_WALLETS"});
  assert.equal(p.phase,"live");
  assert.equal(p.eligible([a,other]),true);
  assert.doesNotThrow(()=>p.assertWrite([a,b]));
});
test("frozen QR attendance returns zero COIN without a wallet read or write",async()=>{
  const guard=policy({});
  const awards=require("../functions/brsm-coin-awards")({coinRollout:guard,
    db:{doc:()=>{throw Error("frozen award looked up document")}},
    TS:{now:()=>new Date()},fail});
  const result=await awards.award({get:()=>{throw Error("frozen award read Firestore")}},
    {uid:other,campaignId:"contact_2026",eventId:"event_01"});
  assert.deepEqual(result,{amount:0,rolloutFrozen:true});
});

test("BRSM live QR attendance defers COIN when the guest wallet is not migrated",async()=>{
  const guard=policy({BALI_COIN_WRITE_MODE:"live",
    BALI_COIN_VERIFIED_EXPORT_SHA256:"b".repeat(64),
    BALI_COIN_LIVE_CONFIRM:"VERIFIED_SOURCE_AND_WALLETS"});
  const failWrite=()=>{throw Error("Attempted balance write without verified source")};
  const awards=require("../functions/brsm-coin-awards")({coinRollout:guard,
    db:{doc:path=>({path})},TS:{now:()=>new Date()},fail});
  const tx={
    get:async ref=>ref.path.startsWith("baliCoinRewards/")?
      {exists:true,data:()=>({active:true,amount:40})}:
      {exists:false},
    set:failWrite,create:failWrite,update:failWrite
  };
  const result=await awards.award(tx,{
    uid:"guest_unmigrated_01",campaignId:"contact_2026",eventId:"contact_event_01"
  });
  assert.deepEqual(result,{amount:0,sourceWalletUnverified:true});
});

test("live BRSM QR attendance defers COIN for a quarantined pilot wallet",async()=>{
  const guard=policy({BALI_COIN_WRITE_MODE:"live",
    BALI_COIN_VERIFIED_EXPORT_SHA256:"a".repeat(64),
    BALI_COIN_LIVE_CONFIRM:"VERIFIED_SOURCE_AND_WALLETS"});
  const blocked=()=>{throw Error("Pilot balance mutated during live rollout")};
  const awards=require("../functions/brsm-coin-awards")({coinRollout:guard,
    db:{doc:path=>({path})},TS:{now:()=>new Date()},fail});
  const tx={
    get:async ref=>ref.path.startsWith("baliCoinRewards/")?
      {exists:true,data:()=>({active:true,amount:50})}:
      ref.path.startsWith("baliCoinAccounts/")?
        {exists:true,data:()=>({balance:100,source:"bali-coin-pilot"})}:
        {exists:false},
    set:blocked,create:blocked,update:blocked
  };
  const result=await awards.award(tx,{
    uid:"pilot_guest_00001",campaignId:"contact_2026",eventId:"contact_01"});
  assert.deepEqual(result,{amount:0,sourceWalletUnverified:true});
});

test("pilot refuses incomplete, duplicate, or malformed allowlists even if confirmation is set",()=>{
  const base={BALI_COIN_WRITE_MODE:"pilot",
    BALI_COIN_PILOT_CONFIRM:"ALLOW_TEST_COIN_WRITES"};
  const candidates=[a,a+","+a,a+",invalid UID",a+","+b+",",
    [a,b,...Array.from({length:9},(_,i)=>"pilot_extra_0000"+i)].join(",")];
  for(const uids of candidates){
    const guard=policy({...base,BALI_COIN_PILOT_UIDS:uids});
    assert.equal(guard.phase,"frozen","rejected misconfigured pilot UID allowlist");
    assert.equal(guard.eligible([a]),false);
  }
  const good=policy({...base,BALI_COIN_PILOT_UIDS:a+","+b});
  assert.equal(good.phase,"pilot");
});
