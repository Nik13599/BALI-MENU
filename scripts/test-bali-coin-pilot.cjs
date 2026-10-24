"use strict";
const test=require("node:test"),assert=require("node:assert/strict");
const {parse,check}=require("./verify-bali-coin-pilot.cjs");
const a="pilot_guest_00001",b="pilot_guest_00002";
const auth={getUser:async uid=>({uid,disabled:false,emailVerified:true})};
const mk=(number,extra={})=>{
  const rows=new Map([[a,{number:100101}],[b,{number:100102}]]);
  return {auth,db:{doc:path=>({get:async()=>{
    const uid=path.split("/")[1],root=path.split("/")[0];
    if(root==="users")return {exists:true,data:()=>({name:"Pilot"})};
    if(root==="baliIds")return {exists:true,data:()=>({...rows.get(uid),...extra})};
    if(root==="baliCoinAccounts")return {exists:false};
    return {exists:false};
  }})}};
};
test("pilot preflight parses distinct UIDs without leaking them",()=>{
  assert.deepEqual(parse(a+","+b),[a,b]);
  assert.throws(()=>parse(a+","+a),/unique/);
  assert.throws(()=>parse(""),/unique/);
});
test("pilot identity preflight checks valid active Bali Cards without writing",async()=>{
  const env=mk();
  assert.deepEqual(await check([a,b],env),{verified:2,distinctCards:2,walletWrites:0});
});
test("pilot rejects existing ordinary COIN wallets before deploy",async()=>{
  const env=mk();
  const original=env.db.doc;
  env.db.doc=path=>path==="baliCoinAccounts/"+a?
    {get:async()=>({exists:true,data:()=>({balance:20,source:"legacy-sheets-migration"})})}:original(path);
  await assert.rejects(check([a,b],env),/Never overwrite real balances/);
});
test("pilot rejects unverified Firebase Auth users",async()=>{
  const env=mk();env.auth={getUser:async uid=>({uid,emailVerified:false,disabled:false})};
  await assert.rejects(check([a,b],env),/email-verified/);
});
test("pilot rejects absent Bali Cards",async()=>{
  const env=mk(),old=env.db.doc;
  env.db.doc=path=>path==="baliIds/"+b?{get:async()=>({exists:false})}:old(path);
  await assert.rejects(check([a,b],env),/registered/);
});

test("pilot refuses an account with an active BALI director/bar staff role",async()=>{
  const env=mk(),original=env.db.doc;
  env.db.doc=path=>path==="staffRoles/"+a?{
    get:async()=>({exists:true,data:()=>({active:true,role:"director"})})
  }:original(path);
  await assert.rejects(check([a,b],env),/director, bar operator/);
});
test("pilot also refuses a preorder Staff or general administrator identity",async()=>{
  for(const collection of ["admins","preorderStaff"]){
    const env=mk(),original=env.db.doc;
    env.db.doc=path=>path===collection+"/"+b?{
      get:async()=>({exists:true,data:()=>({active:true})})
    }:original(path);
    await assert.rejects(check([a,b],env),/preorder Staff identity/);
  }
});
