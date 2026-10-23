// Focused tests for the REAL callable backend, using an in-memory Firestore shim.
// No Firebase network or credentials are needed; methods execute the source code.
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
import vm from "node:vm";
import {createRequire} from "node:module";
const require=createRequire(import.meta.url);
const sender="sender_UID_0001",receiver="receiver_UID_0002",staff="director_UID_001";
class Stamp{
  constructor(ms){this.ms=ms}
  toMillis(){return this.ms}
}
const copy=v=>v instanceof Stamp?new Stamp(v.ms):Array.isArray(v)?v.map(copy):
  v&&typeof v==="object"?Object.fromEntries(Object.entries(v).map(([k,x])=>[k,copy(x)])):v;
const memory=new Map([
  ["users/"+sender,{name:"Светлана"}],["users/"+receiver,{name:"Андрей"}],
  ["baliIds/"+sender,{uid:sender,number:1}],["baliIds/"+receiver,{uid:receiver,number:2}],
  ["guestWallets/"+sender,{uid:sender,grants:[
    {id:"shot-001",kind:"shot",remaining:3,originalCount:3,unlimited:false,transferable:true,eventRef:null,expiresAt:null},
    {id:"cocktail-01",kind:"cocktail",remaining:2,originalCount:2,unlimited:false,transferable:true,eventRef:null,expiresAt:null},
    {id:"nopass",kind:"entry",remaining:8,originalCount:8,unlimited:false,transferable:false,eventRef:null,expiresAt:null}
  ]}],
  ["guestWallets/"+receiver,{uid:receiver,grants:[]}],
  ["admins/"+staff,{active:true}]
]);
const snap=(path)=>({
  id:path.split("/").at(-1),
  exists:memory.has(path),
  data:()=>copy(memory.get(path)),
  path
});
const ref=path=>({path,get:async()=>snap(path)});
const docs=collection=>[...memory.keys()].filter(key=>key.startsWith(collection+"/")&&key.split("/").length===2).map(snap);
function query(collection,tests=[],sorting=null,maximum=Infinity,after=null){
  return {
    where(field,comp,val){assert.equal(comp,"==");return query(collection,[...tests,{field,val}],sorting,maximum,after)},
    orderBy(field,direction){return query(collection,tests,{field,direction},maximum,after)},
    limit(n){return query(collection,tests,sorting,n,after)},
    startAfter(s){return query(collection,tests,sorting,maximum,s)},
    async get(){
      let records=docs(collection).filter(d=>tests.every(t=>d.data()?.[t.field]===t.val));
      if(sorting){
        records.sort((a,b)=>{
          const va=a.data()?.[sorting.field],vb=b.data()?.[sorting.field];
          const cmp=(va?.toMillis?.()||0)-(vb?.toMillis?.()||0);
          return sorting.direction==="desc"?-cmp:cmp;
        });
      }
      if(after)records=records.slice(records.findIndex(x=>x.id===after.id)+1);
      records=records.slice(0,maximum);
      return {docs:records,empty:records.length===0,size:records.length};
    }
  };
}
const db={
  doc:ref,collection:x=>query(x),
  async runTransaction(fn){
    const writes=[];
    const tx={
      get:async reference=>snap(reference.path),
      set:(reference,v)=>writes.push(["set",reference.path,copy(v)]),
      create:(reference,v)=>writes.push(["create",reference.path,copy(v)]),
      update:(reference,v)=>writes.push(["update",reference.path,copy(v)])
    };
    const out=await fn(tx);
    for(const [verb,path] of writes)if(verb==="create"&&memory.has(path))
      throw new Error("Cannot create existing document: "+path);
    for(const [verb,path,value] of writes){
      memory.set(path,verb==="update"?{...memory.get(path),...value}:value);
    }
    return out;
  }
};
function firestore(){return db}
firestore.Timestamp={now:()=>new Stamp(Date.now()),fromMillis:ms=>new Stamp(ms)};
const fakeAdmin={apps:[{}],firestore};
class HttpsError extends Error{
  constructor(code,message){super(message);this.code=code}
}
const exports={};
vm.runInNewContext(readFileSync("functions/index.js","utf8"),{
  exports,require:name=>name==="firebase-admin"?fakeAdmin:
    name==="firebase-functions/v2/https"?{onCall:(_options,handler)=>handler,HttpsError}:
    name==="firebase-functions/v2/scheduler"?{onSchedule:(_options,handler)=>handler}:
     name==="qrcode"?{toDataURL:async()=> "data:image/png;base64,dGVzdA=="}:
     name==="./bonus-qr"?()=>({}):
     name==="./brsm"?()=>({}):
     name==="./brsm-campaigns"?()=>({}):
     name==="./brsm-identity"?()=>({}):
     name==="./coin-rollout"?require("../functions/coin-rollout.js"):
     name==="./bali-coin"?()=>({}):
     name==="./preorders"?()=>async()=>({}):
     name==="./preorder-staff"?()=>({manageBaliPreorderStaff:async()=>({})}):require(name),
  console,Date,Math,Number,String,Promise,Boolean,Array,Error,Set,Map,JSON,RegExp
},{filename:"functions/index.js"});
const auth=uid=>({auth:{uid,token:{email_verified:true}}});
const received=async(number,authUid=sender)=>exports.previewBaliRecipient({...auth(authUid),data:{number}});
const make=(items,key,authUid=sender,to="000002",comment="")=>exports.transferBaliBenefits({...auth(authUid),data:{number:to,items,requestId:key,comment}});
const balance=(id,kind)=>memory.get("guestWallets/"+id).grants.filter(g=>g.kind===kind).reduce((s,g)=>s+g.remaining,0);
const key="a".repeat(32);
const resolved=await received("000002");
assert.equal(resolved.name,"Андрей");
assert.equal(resolved.number,"000002");
await assert.rejects(received("000001"),e=>e.code==="failed-precondition");
await assert.rejects(received("999999"),e=>e.code==="not-found");
await assert.rejects(received("00002"),e=>e.code==="invalid-argument");
await assert.rejects(received("000002",null),e=>e.code==="unauthenticated");
assert.equal(balance(sender,"shot"),3);
let result=await make([{grantId:"shot-001",quantity:2},{grantId:"cocktail-01",quantity:1}],key,sender,"000002","Приятного отдыха!");
assert.equal(result.ok,true);assert.equal(result.alreadyProcessed,false);
assert.equal(balance(sender,"shot"),1);assert.equal(balance(receiver,"shot"),2);
assert.equal(balance(sender,"cocktail"),1);assert.equal(balance(receiver,"cocktail"),1);
result=await make([{grantId:"shot-001",quantity:2},{grantId:"cocktail-01",quantity:1}],key,sender,"000002","Приятного отдыха!");
assert.equal(result.alreadyProcessed,true);
assert.equal(balance(sender,"shot"),1,"retries must never double-debit");
assert.equal(balance(receiver,"shot"),2,"retries must never double-credit");
await assert.rejects(make([{grantId:"shot-001",quantity:2}],"b".repeat(32)),e=>e.code==="failed-precondition");
assert.equal(balance(sender,"shot"),1);
await assert.rejects(make([{grantId:"nopass",quantity:1}],"c".repeat(32)),e=>e.code==="failed-precondition");
await assert.rejects(make([{grantId:"shot-001",quantity:1}],"d".repeat(32),receiver,"000001"),
  e=>e.code==="failed-precondition");
const ledger=[...memory.keys()].filter(key=>key.startsWith("walletOperations/"));
assert.equal(ledger.length,2,"transfer must create exactly two immutable ledger rows");
const historyA=await exports.listMyBaliHistory({...auth(sender),data:{}});
const historyB=await exports.listMyBaliHistory({...auth(receiver),data:{}});
assert.equal(historyA.items.length,1);assert.equal(historyB.items.length,1);
assert.equal(historyA.items[0].type,"transfer-out");
assert.equal(historyB.items[0].type,"transfer-in");
assert.equal(historyA.items[0].toName,"Андрей");
assert.equal(historyB.items[0].fromName,"Светлана");
assert.equal(historyB.items[0].comment,"Приятного отдыха!");
const inbox=[...memory].filter(([key])=>key.startsWith("baliTransferInbox/"+receiver+"/items/"));
assert.equal(inbox.length,1,"recipient must receive exactly one inbox message");
assert.equal(inbox[0][1].senderName,"Светлана");
assert.equal(inbox[0][1].senderNumber,"000001");
assert.equal(inbox[0][1].comment,"Приятного отдыха!");
await assert.rejects(make([{grantId:"shot-001",quantity:2},{grantId:"cocktail-01",quantity:1}],key,sender,"000002","Другое пожелание"),e=>e.code==="already-exists");
const grant=await exports.issueBaliQuantity({...auth(staff),data:{
  uid:receiver,kind:"shot",quantity:3,transferable:true,reason:"Приветственный подарок клуба",requestId:"7".repeat(32)
}});
assert.equal(grant.ok,true);
assert.equal(balance(receiver,"shot"),5);
assert.equal((await exports.listMyBaliHistory({...auth(receiver),data:{}})).items.filter(x=>x.type==="grant").length,1);
await assert.rejects(exports.issueBaliQuantity({...auth(sender),data:{
  uid:sender,kind:"shot",quantity:200,transferable:true,reason:"Запрещённое начисление"
}}),e=>e.code==="permission-denied");
// Every receiving path must enforce the same per-kind cap as staff/QR credit.
const finiteGrant=(id,remaining,extra={})=>({id,kind:"shot",remaining,originalCount:remaining,
  unlimited:false,transferable:true,eventRef:null,expiresAt:null,...extra});
const prepareCapCase=(incoming,existing)=>{
  memory.set("guestWallets/"+sender,{uid:sender,grants:incoming});
  memory.set("guestWallets/"+receiver,{uid:receiver,grants:existing});
};
const unchangedOnRejection=async (items,requestId)=>{
  const before=copy([...memory]);
  await assert.rejects(make(items,requestId),e=>e.code==="resource-exhausted");
  assert.deepEqual([...memory],before,"rejection must leave wallets, ledger, transfer and inbox unchanged");
};
prepareCapCase([finiteGrant("cap-one",2)],[finiteGrant("full",999)]);
await unchangedOnRejection([{grantId:"cap-one",quantity:1}],"e".repeat(32));
prepareCapCase([finiteGrant("split-one",1),finiteGrant("split-two",1)],[finiteGrant("almost-full",998)]);
await unchangedOnRejection([{grantId:"split-one",quantity:1},{grantId:"split-two",quantity:1}],"f".repeat(32));
prepareCapCase([finiteGrant("boundary",1)],[finiteGrant("almost-full",998)]);
assert.equal((await make([{grantId:"boundary",quantity:1}],"1".repeat(32))).ok,true);
assert.equal(balance(receiver,"shot"),999,"an exact-cap transfer remains valid");
prepareCapCase([finiteGrant("expiry-control",1)],[
  finiteGrant("expired",999,{expiresAt:new Stamp(Date.now()-1000)}),
  finiteGrant("unlimited",999,{unlimited:true}),finiteGrant("usable",998)
]);
assert.equal((await make([{grantId:"expiry-control",quantity:1}],"2".repeat(32))).ok,true);
assert.equal(memory.get("guestWallets/"+receiver).grants.at(-1).remaining,1,
  "expired and unlimited entitlements do not consume the finite bonus cap");
// The backend resolves custom kind authorization from its protected registry.
memory.set("baliBonusKinds/dessert",{name:"Десерты",active:true});
prepareCapCase([finiteGrant("custom",3,{kind:"dessert"})],[]);
assert.equal((await make([{grantId:"custom",quantity:1}],"3".repeat(32))).ok,true);
assert.equal(memory.get("guestWallets/"+receiver).grants[0].kind,"dessert");
memory.get("baliBonusKinds/dessert").active=false;
const beforeInactive=copy([...memory]);
await assert.rejects(make([{grantId:"custom",quantity:1}],"4".repeat(32)),e=>e.code==="failed-precondition");
assert.deepEqual([...memory],beforeInactive,"inactive custom kinds cannot transfer and leave no partial writes");
// Lifetime credits must not exhaust the 80 *live* grant capacity permanently.
const spent=Array.from({length:80},(_,i)=>finiteGrant("spent-"+i,0));
prepareCapCase([finiteGrant("live",1)],spent);
const historyKeys=[...memory.keys()].filter(k=>k.startsWith("walletOperations/"));
assert.equal((await make([{grantId:"live",quantity:1}],"5".repeat(32))).ok,true);
assert.equal(memory.get("guestWallets/"+receiver).grants.length,1);
for(const key of historyKeys)assert(memory.has(key),"compaction keeps immutable operation history");
memory.set("guestWallets/"+receiver,{uid:receiver,grants:spent});
assert.equal((await exports.issueBaliQuantity({...auth(staff),data:{
  uid:receiver,kind:"shot",quantity:1,transferable:true,reason:"Новое начисление после списаний",requestId:"8".repeat(32)
}})).ok,true);
assert.equal(memory.get("guestWallets/"+receiver).grants.length,1);
// Unknown expiry formats and unlimited rights are retained, never guessed away.
const retained=[finiteGrant("unlimited-zero",0,{unlimited:true}),
  finiteGrant("unknown-expiry",2,{expiresAt:{seconds:1}}),
  finiteGrant("unknown-count","0"),null];
prepareCapCase([finiteGrant("retention-control",1)],[...retained,finiteGrant("expired",2,{expiresAt:new Stamp(Date.now()-1)})]);
assert.equal((await make([{grantId:"retention-control",quantity:1}],"6".repeat(32))).ok,true);
assert.deepEqual(memory.get("guestWallets/"+receiver).grants.slice(0,retained.length),retained);
assert.equal(memory.get("guestWallets/"+receiver).grants.length,retained.length+1);
console.log("BALI ID backend: recipient identity, atomic ledger, idempotency, overdraft/receiving caps, roles, custom kinds and grant lifecycle PASS.");
