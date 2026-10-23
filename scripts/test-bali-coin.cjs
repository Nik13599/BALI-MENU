"use strict";
const test=require("node:test"),assert=require("node:assert/strict");
const create=require("../functions/bali-coin.js");
function setup(){
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
    privileged:async uid=>uid==="director",fail,nameAndId});
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
