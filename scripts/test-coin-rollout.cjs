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
