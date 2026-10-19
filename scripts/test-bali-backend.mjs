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
firestore.Timestamp={now:()=>new Stamp(Date.now())};
const fakeAdmin={apps:[{}],firestore};
class HttpsError extends Error{
  constructor(code,message){super(message);this.code=code}
}
const exports={};
vm.runInNewContext(readFileSync("functions/index.js","utf8"),{
  exports,require:name=>name==="firebase-admin"?fakeAdmin:
    name==="firebase-functions/v2/https"?{onCall:(_options,handler)=>handler,HttpsError}:require(name),
  console,Date,Math,Number,String,Promise,Boolean,Array,Error,Set,Map,JSON,RegExp
},{filename:"functions/index.js"});
const auth=uid=>({auth:{uid,token:{email_verified:true}}});
const received=async(number,authUid=sender)=>exports.previewBaliRecipient({...auth(authUid),data:{number}});
const make=(items,key,authUid=sender,to="000002")=>exports.transferBaliBenefits({...auth(authUid),data:{number:to,items,requestId:key}});
const balance=(id,kind)=>memory.get("guestWallets/"+id).grants.filter(g=>g.kind===kind).reduce((s,g)=>s+g.remaining,0);
const key="a".repeat(32);
assert.deepEqual(await received("000002"),{name:"Андрей",number:"000002"});
await assert.rejects(received("000001"),e=>e.code==="failed-precondition");
await assert.rejects(received("999999"),e=>e.code==="not-found");
await assert.rejects(received("00002"),e=>e.code==="invalid-argument");
await assert.rejects(received("000002",null),e=>e.code==="unauthenticated");
assert.equal(balance(sender,"shot"),3);
let result=await make([{grantId:"shot-001",quantity:2},{grantId:"cocktail-01",quantity:1}],key);
assert.equal(result.ok,true);assert.equal(result.alreadyProcessed,false);
assert.equal(balance(sender,"shot"),1);assert.equal(balance(receiver,"shot"),2);
assert.equal(balance(sender,"cocktail"),1);assert.equal(balance(receiver,"cocktail"),1);
result=await make([{grantId:"shot-001",quantity:2},{grantId:"cocktail-01",quantity:1}],key);
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
const grant=await exports.issueBaliQuantity({...auth(staff),data:{
  uid:receiver,kind:"shot",quantity:3,transferable:true,reason:"Приветственный подарок клуба"
}});
assert.equal(grant.ok,true);
assert.equal(balance(receiver,"shot"),5);
assert.equal((await exports.listMyBaliHistory({...auth(receiver),data:{}})).items.filter(x=>x.type==="grant").length,1);
await assert.rejects(exports.issueBaliQuantity({...auth(sender),data:{
  uid:sender,kind:"shot",quantity:200,transferable:true,reason:"Запрещённое начисление"
}}),e=>e.code==="permission-denied");
console.log("BALI ID backend: recipient identity, multiple quantities, atomic ledger, idempotency, overdraft block, roles and history PASS.");
