// Isolated business-logic tests for the real callable, without credentials.
// The transaction shim enforces the Firestore reads-before-writes contract.
import assert from "node:assert/strict";
import {createRequire} from "node:module";
const require=createRequire(import.meta.url);
const createPreorder=require("../functions/preorders.js");
const uid="guest-verified",email="guest@example.test",eventDate="2099-10-24";
class Stamp{
  constructor(value){this.value=value}
  toMillis(){return this.value}
}
const clone=value=>value instanceof Stamp?new Stamp(value.value):
  Array.isArray(value)?value.map(clone):
  value&&typeof value==="object"?Object.fromEntries(Object.entries(value).map(([k,v])=>[k,clone(v)])):value;
const records=new Map();
const now=()=>new Stamp(Date.now());
records.set("users/"+uid,{uid,email,name:"Гость BALI",phone:"+375291234567"});
records.set("users/"+uid+"/privacyConsents/2026-10-21",{version:"2026-10-21",processing:true,international:true});
records.set("events/"+eventDate,{date:eventDate,title:"MUZLOTO",preorderEnabled:true,closesAt:new Stamp(Date.UTC(2099,9,24,23))});
records.set("events/"+eventDate+"__2",{date:eventDate,title:"NIGHT PARTY",preorderEnabled:true,closesAt:new Stamp(Date.UTC(2099,9,24,23))});
records.set("menu/1",{id:1,name:"Пицца",price:25,available:true});
records.set("menu/2",{id:2,name:"Салат",price:18.5,available:true});
const snapshot=path=>({exists:records.has(path),id:path.split("/").at(-1),path,ref:reference(path),data:()=>clone(records.get(path))});
const reference=path=>({path,id:path.split("/").at(-1),collection:name=>collection(path+"/"+name)});
const collection=path=>({
  path,doc:(id)=>reference(path+"/"+(id||"auto_"+(++created))),
  kind:"query"
});
let created=0;
const db={
 doc:reference,collection,
 async runTransaction(execute){
  const writes=[];let wrote=false;
  const tx={
   get:async query=>{
    assert.equal(wrote,false,"Firestore forbids reads after writes");
    if(query.kind==="query"){
      const docs=[...records.keys()].filter(key=>key.startsWith(query.path+"/")&&
        key.slice(query.path.length+1).indexOf("/")===-1).map(snapshot);
      return {docs,size:docs.length};
    }
    return snapshot(query.path);
   },
   create:(ref,value)=>{wrote=true;writes.push(["create",ref.path,clone(value)])},
   set:(ref,value)=>{wrote=true;writes.push(["set",ref.path,clone(value)])},
   update:(ref,value)=>{wrote=true;writes.push(["update",ref.path,clone(value)])},
   delete:ref=>{wrote=true;writes.push(["delete",ref.path])}
  };
  const result=await execute(tx);
  for(const [op,path] of writes)if(op==="create")assert(!records.has(path),"duplicate document "+path);
  for(const [op,path,value] of writes){
   if(op==="delete")records.delete(path);
   else if(op==="update")records.set(path,{...records.get(path),...value});
   else records.set(path,value);
  }
  return result;
 }
};
class PreorderError extends Error{constructor(code,message){super(message);this.code=code}}
const fail=(code,message)=>{throw new PreorderError(code,message)};
const submit=createPreorder({
 db,admin:{firestore:{Timestamp:{now}}},verified:req=>{
  if(!req.auth?.uid||req.auth.token?.email_verified!==true)
   fail("unauthenticated","Not signed in");
  return req.auth.uid;
 },fail
});
const base={event_date:eventDate,event_id:eventDate,table_number:"12",booking_id:"",
 notes:"",items:[{id:1,quantity:2},{id:2,quantity:1}]};
let serial=0;
const key=()=>String(++serial).padStart(32,"0");
const call=(body,account=uid,requestId=key())=>submit({
 auth:account?{uid:account,token:{email_verified:true,email}}:null,
 data:{...base,...body,requestId}
});
const reject=async(body,code,account=uid,requestId=key())=>{
 const before=clone([...records]);
 await assert.rejects(call(body,account,requestId),error=>error.code===code);
 assert.deepEqual([...records],before,"invalid request must not leave partial writes");
};
await reject({items:[]},"invalid-argument");
await reject({items:new Array(13).fill(null).map((_,i)=>({id:i+1,quantity:1}))},"invalid-argument");
await reject({items:[{id:1,quantity:1},{id:1,quantity:2}]},"invalid-argument");
await reject({items:[{id:1,quantity:51}]},"invalid-argument");
await reject({items:[{id:1,quantity:0}]},"invalid-argument");
await reject({event_id:"2099-10-25"},"invalid-argument");
await reject({table_number:"",booking_id:""},"invalid-argument");
await reject({items:[{id:3,quantity:1}]},"failed-precondition");
await reject({event_date:"2099-10-25",event_id:"2099-10-25"},"failed-precondition");
await reject({},"unauthenticated",null);
const firstId=key();
const first=await call({total:0,customerName:"Подмена",items:[{id:1,quantity:2},{id:2,quantity:1}]},uid,firstId);
assert.equal(first.total,68.5,"total comes from menu, never the browser");
assert.equal(first.event_title,"MUZLOTO");assert.equal(first.order_number,1);
const countOrders=()=>[...records.keys()].filter(x=>/^orders\/[^/]+$/.test(x)).length;
assert.equal(countOrders(),1);
const repeated=await call({items:[{id:2,quantity:1},{id:1,quantity:2}]},uid,firstId);
assert.equal(repeated.order_id,first.order_id);assert.equal(repeated.alreadyProcessed,true);
assert.equal(countOrders(),1,"retry must not create a duplicate order");
await reject({items:[{id:1,quantity:1}]},"already-exists",uid,firstId);
const second=await call({event_id:eventDate+"__2"});
assert.equal(second.order_number,1,"event slot has independent counter");
assert.equal(second.event_title,"NIGHT PARTY");
const third=await call({event_id:eventDate+"__2"});
assert.equal(third.order_number,2);
const saved=await call({edit_id:first.order_id,table_number:"13",items:[{id:2,quantity:3}]});
assert.equal(saved.order_number,1,"editing the same event preserves number");
assert.equal(records.get("orders/"+first.order_id).tableNumber,"13");
assert(!records.has("orders/"+first.order_id+"/items/1"),"removed item is deleted");
assert.equal(records.get("orders/"+first.order_id+"/items/2").quantity,3);
const moved=await call({edit_id:first.order_id,event_id:eventDate+"__2",items:[{id:1,quantity:1}]});
assert.equal(moved.order_number,3,"moving to another event gives new number");
assert.equal(records.get("orders/"+first.order_id).eventTitle,"NIGHT PARTY");
records.get("orders/"+first.order_id).status="confirmed";
await reject({edit_id:first.order_id},"permission-denied");
const outsider="outsider-uid";
records.set("users/"+outsider,{uid:outsider,email,name:"Другой гость",phone:"+375291234567"});
records.set("users/"+outsider+"/privacyConsents/2026-10-21",{processing:true,international:true});
await reject({edit_id:second.order_id},"permission-denied",outsider);
records.delete("users/"+outsider+"/privacyConsents/2026-10-21");
await reject({items:[{id:1,quantity:1}]},"permission-denied",outsider);
records.set("users/"+outsider+"/privacyConsents/2026-10-21",{processing:true,international:true});
records.set("events/"+eventDate,{...records.get("events/"+eventDate),closesAt:new Stamp(Date.now()-1000)});
await reject({items:[{id:1,quantity:1}]},"failed-precondition");
const earlier=records.get("preorderRateLimits/"+uid);
const left=12-earlier.count;
for(let i=0;i<left;i++)await call({event_id:eventDate+"__2"});
await reject({event_id:eventDate+"__2"},"resource-exhausted");
const alreadyComplete=await call({items:[{id:1,quantity:2},{id:2,quantity:1}]},uid,firstId);
assert.equal(alreadyComplete.alreadyProcessed,true,"safe retries never consume rate limit");
console.log("Preorders backend: nonempty/unique/quantity limits, price validation, ownership, event cutoff, atomic revisions, numbered events and idempotency PASS.");
