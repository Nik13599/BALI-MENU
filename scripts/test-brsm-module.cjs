"use strict";
/* Isolated unit exercise of BRSM Cloud Functions via a Firestore in-memory stub.
   No network and no production Firebase credentials involved. */
const assert=require("node:assert/strict");
const {test}=require("node:test");
const fs=require("node:fs");
const path=require("node:path");
let clock=Date.parse("2026-10-23T18:00:00+03:00");
const realNow=Date.now;
Date.now=()=>clock;
const TS={now:()=>TS.fromMillis(Date.now()),fromMillis:ms=>({toMillis:()=>ms})};
function database(){
 const store=new Map();
 const snap=(key)=>({id:key.split("/").pop(),exists:store.has(key),
   data:()=>store.get(key)});
 const ref=key=>({key,id:key.split("/").pop(),get:async()=>snap(key),
   create:async data=>{if(store.has(key))throw Error("already exists");store.set(key,data);},
   set:async(data,opt)=>{store.set(key,opt?.merge?{...store.get(key),...data}:data);},
   update:async data=>store.set(key,{...store.get(key),...data})});
 const collection=prefix=>{
  const q={filters:[],count:Infinity,field:null,direction:"asc",where(field,op,value){this.filters.push({field,op,value});return this;},
   limit(n){this.count=n;return this;},orderBy(field,dir="asc"){this.field=field;this.direction=dir;return this;},
   async get(){
    let rows=[...store.entries()].filter(([key])=>key.startsWith(prefix+"/")&&key.slice(prefix.length+1).indexOf("/")<0);
    for(const f of this.filters)rows=rows.filter(([,d])=>f.op==="=="?d[f.field]===f.value:false);
    if(this.field)rows.sort((a,b)=>String(a[1][this.field]).localeCompare(String(b[1][this.field]))*(this.direction==="desc"?-1:1));
    return {empty:rows.length===0,size:rows.length,docs:rows.slice(0,this.count).map(([key])=>snap(key))};
   }
  };return q;
 };
 const batch=()=>{const op=[];return{create(r,d){op.push(["create",r,d]);},async commit(){for(const [type,r,d] of op)await r[type](d);}};};
 async function runTransaction(callback){
  const ops=[];
  const tx={
   get:async r=>snap(r.key),
   set:(r,d,opt)=>ops.push(["set",r,d,opt]),
   update:(r,d)=>ops.push(["update",r,d]),
   create:(r,d)=>ops.push(["create",r,d])
  };
  const result=await callback(tx);
  for(const [act,r,data,opt]of ops){
   if(act==="update"){
    const current=store.get(r.key)||{},modified={...current};
    for(const [k,v]of Object.entries(data))modified[k]=v&&v.__increment!==undefined?(current[k]||0)+v.__increment:v;
    store.set(r.key,modified);
   }else await r[act](data,opt);
  }return result;
 }
 return {store,doc:ref,collection,batch,runTransaction};
}
test("BRSM cards, limited promos, QR claims and live lotto remain server-controlled",async()=>{
 const db=database(),admin={firestore:{FieldValue:{increment:n=>({__increment:n})}}};
 const fail=(code,message)=>{const e=Error(message);e.code=code;throw e;};
 const verified=req=>{if(!req.auth?.uid)fail("unauthenticated","Login required");return req.auth.uid;};
 const privileged=uid=>Promise.resolve(uid==="director");
 const Module=require("node:module");
 const realLoad=Module._load;
 Module._load=function(request,parent,isMain){if(request==="qrcode")return {toDataURL:async()=> "data:image/png;base64,dGVzdA=="};return realLoad.apply(this,arguments);};
 const moduleFactory=require(path.resolve(__dirname,"../functions/brsm.js"));
 Module._load=realLoad;
 const funcs=moduleFactory({
   api:(name,handler)=>handler,admin,db,TS,verified,privileged,fail
 });
 db.store.set("users/aliceuid123456",{name:"Alice"});
 db.store.set("baliIds/aliceuid123456",{number:1});
 db.store.set("users/bobuid12345678",{name:"Bob"});
 db.store.set("baliIds/bobuid12345678",{number:2});
 for(let i=0;i<3;i++){
  const dates=["2026-10-24","2026-10-31","2026-11-07"];
  db.store.set("events/contact_"+i,{title:"КОНТАКТ "+(i+1),date:dates[i]});
 }
 const as=uid=>({auth:{uid},data:{}});
 const director=as("director"),guest=as("aliceuid123456"),other=as("bobuid12345678");
 await assert.rejects(()=>funcs.assignBrsmCard({...guest,data:{number:"000001"}}),{code:"permission-denied"});
 const assigned=await funcs.assignBrsmCard({...director,data:{number:"000001"}});
 assert.equal(assigned.number,"000001");
 assert.equal(assigned.active,true);
 const promo=await funcs.createBrsmPromo({...director,data:{maxUses:1,days:60}});
 assert.match(promo.code,/^[A-F0-9]{14}$/);
 await funcs.redeemBrsmPromo({...other,data:{code:promo.code}});
 assert.equal((await funcs.getBrsmCard(other)).active,true);
 const issued=[];
 for(let i=0;i<3;i++){
  const r=await funcs.createBrsmQrBatch({...director,data:{eventId:"contact_"+i,count:2}});
  assert.equal(r.records.length,2);
  assert.match(r.records[0].url,/brsm.html\?qr=/);
  assert.match(r.records[0].qr,/^data:image\/png;base64,/);
  issued.push(r.records);
 }
 for(let i=0;i<3;i++){
  clock=Date.parse(["2026-10-24","2026-10-31","2026-11-07"][i]+"T20:00:00+03:00");
  const out=await funcs.redeemBrsmQr({...guest,data:{token:issued[i][0].token}});
  assert.equal(out.visits.length,i+1);
  if(i===0){
   await assert.rejects(()=>funcs.redeemBrsmQr({...other,data:{token:issued[i][0].token}}),{code:"failed-precondition"});
   await assert.rejects(()=>funcs.redeemBrsmQr({...guest,data:{token:issued[i][1].token}}),{code:"already-exists"});
  }
 }
 const card=await funcs.getBrsmCard(guest);
 assert.equal(card.ready,true);assert.equal(card.visits.length,3);
 assert.equal(card.numbers.length,10);assert.equal(new Set(card.numbers).size,10);
 assert(card.numbers.every(n=>n>=1&&n<=90));
 const draw=await funcs.startBrsmDraw(director);
 assert.equal(draw.participants,1);
 for(let i=0;i<5;i++){
  const out=await funcs.callBrsmNumber({...director,data:{number:card.numbers[i]}});
  if(i<4)assert.equal(out.status,"live");
  else {assert.equal(out.status,"finished");assert.equal(out.winnerNumber,"000001");}
 }
 await assert.rejects(()=>funcs.callBrsmNumber({...director,data:{number:card.numbers[5]}}),{code:"failed-precondition"});
 assert.equal(db.store.get("brsmDraws/main").called.length,5);
 Date.now=realNow;
});
