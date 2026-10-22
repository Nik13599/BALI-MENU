// Exercise the real callable implementations and PNG encoder without production access.
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
import {createRequire} from "node:module";
import vm from "node:vm";
import {test} from "node:test";
import sharp from "sharp";

const require=createRequire(import.meta.url);
const functionsRequire=createRequire(new URL("../functions/package.json",import.meta.url));
const decodeQR=require("../assets/vendor/jsqr-1.4.0.js");
const guest="guest_UID_00001",other="guest_UID_00002",staff="director_UID_001";
const DAY=86400000;
class Stamp{constructor(ms){this.ms=ms;}toMillis(){return this.ms;}}
const copy=v=>v instanceof Stamp?new Stamp(v.ms):Array.isArray(v)?v.map(copy):
  v&&typeof v==="object"?Object.fromEntries(Object.entries(v).map(([k,x])=>[k,copy(x)])):v;

function harness(){
  let now=2000000000000,queue=Promise.resolve();
  class Clock extends Date{static now(){return now;}}
  const memory=new Map([
    ["users/"+guest,{name:"Тестовый гость"}],["users/"+other,{name:"Другой гость"}],
    ["baliIds/"+guest,{uid:guest,number:1}],["baliIds/"+other,{uid:other,number:2}],
    ["admins/"+staff,{active:true}]
  ]);
  const snapshot=path=>({id:path.split("/").at(-1),exists:memory.has(path),data:()=>copy(memory.get(path))});
  const commit=writes=>{
    for(const [verb,path] of writes)if(verb==="create"&&memory.has(path)){
      const error=new Error("Already exists");error.code=6;throw error;
    }
    for(const [verb,path,value] of writes){
      const next=verb==="update"?{...copy(memory.get(path)),...copy(value)}:copy(value);
      for(const [key,v] of Object.entries(next))if(v&&typeof v.__increment==="number")
        next[key]=(memory.get(path)?.[key]||0)+v.__increment;
      memory.set(path,next);
    }
  };
  const ref=path=>({path,get:async()=>snapshot(path),create:async value=>commit([["create",path,value]])});
  const writer=()=>{
    const writes=[];
    const tx={get:async r=>{assert.equal(writes.length,0,"all Firestore transaction reads must precede writes");return snapshot(r.path);},
      set:(r,v)=>writes.push(["set",r.path,v]),create:(r,v)=>writes.push(["create",r.path,v]),
      update:(r,v)=>writes.push(["update",r.path,v]),commit:async()=>commit(writes)};
    return tx;
  };
  const query=(path,filters=[],sort=null,limit=Infinity)=>({
    where:(field,op,value)=>{assert.equal(op,"==");return query(path,[...filters,[field,value]],sort,limit);},
    orderBy:(field,direction)=>query(path,filters,[field,direction],limit),
    limit:value=>query(path,filters,sort,value),
    count:()=>({get:async()=>{const rows=await query(path,filters,sort,limit).get();return {data:()=>({count:rows.size})};}}),
    get:async()=>{
      let docs=[...memory.keys()].filter(key=>key.startsWith(path+"/")&&key.split("/").length===2).map(snapshot);
      docs=docs.filter(d=>filters.every(([field,value])=>d.data()[field]===value));
      if(sort)docs.sort((a,b)=>(a.data()[sort[0]].toMillis()-b.data()[sort[0]].toMillis())*(sort[1]==="desc"?-1:1));
      docs=docs.slice(0,limit);return {docs,size:docs.length,empty:docs.length===0};
    }
  });
  const db={doc:ref,collection:path=>query(path),batch:writer,
    runTransaction:fn=>{
      const work=queue.then(async()=>{const tx=writer(),result=await fn(tx);await tx.commit();return result;});
      queue=work.catch(()=>{});return work;
    }};
  function firestore(){return db;}
  firestore.Timestamp={now:()=>new Stamp(now),fromMillis:ms=>new Stamp(ms)};
  firestore.FieldValue={increment:n=>({__increment:n})};
  class HttpsError extends Error{constructor(code,message){super(message);this.code=code;}}
  const globals={console:{info(){},error(){}},Date:Clock,Math,Number,String,Promise,Boolean,Array,Error,Set,Map,JSON,RegExp};
  const bonus={exports:{}};
  vm.runInNewContext(readFileSync("functions/bonus-qr.js","utf8"),{...globals,module:bonus,require:name=>
    name==="qrcode"?functionsRequire(name):require(name)},{filename:"functions/bonus-qr.js"});
  const api={};
  vm.runInNewContext(readFileSync("functions/index.js","utf8"),{...globals,exports:api,require:name=>
    name==="firebase-admin"?{apps:[{}],firestore}:
    name==="firebase-functions/v2/https"?{onCall:(_options,handler)=>handler,HttpsError}:
    name==="./bonus-qr"?bonus.exports:
    name==="./preorders"?()=>async()=>({}):
    name==="./preorder-staff"?()=>({}):
    name==="firebase-functions/v2/scheduler"?{onSchedule:(_config,handler)=>handler}:
    name==="qrcode"?functionsRequire(name):require(name)
  },{filename:"functions/index.js"});
  const call=(name,data={},uid=guest,verified=true)=>api[name]({data,auth:uid?{uid,token:{email_verified:verified}}:null});
  const batch=async changes=>(await call("createBaliQrBatch",{kind:"shot",action:"credit",mode:"once",quantity:3,count:1,cooldownSeconds:30,...changes},staff)).codes;
  const apply=(code,key="a",quantity=1,uid=guest)=>call("applyBaliBonusQR",{code,requestId:key.repeat(32),quantity},uid);
  const wallet=uid=>memory.get("guestWallets/"+uid)?.grants||[];
  return {memory,call,batch,apply,wallet,advance:ms=>{now+=ms;},time:()=>now};
}
const errorCode=code=>error=>error.code===code;
const decode=async dataUrl=>{
  const png=Buffer.from(dataUrl.split(",")[1],"base64");
  const {data,info}=await sharp(png).ensureAlpha().raw().toBuffer({resolveWithObject:true});
  const decoded=decodeQR(new Uint8ClampedArray(data),info.width,info.height);
  assert(decoded,"a generated PNG must decode as an actual QR code");
  return decoded.data;
};

await test("QR management requires verified staff; guests cannot create, list, revoke or define kinds",async()=>{
  const h=harness();
  for(const name of ["createBaliBonusKind","createBaliQrBatch","listBaliQrCodes","revokeBaliQrCode"]){
    await assert.rejects(h.call(name),errorCode("permission-denied"));
    await assert.rejects(h.call(name,{},null),errorCode("unauthenticated"));
    await assert.rejects(h.call(name,{},staff,false),errorCode("unauthenticated"));
  }
  assert.equal([...h.memory.keys()].filter(k=>k.startsWith("baliBonus")).length,0);
  h.memory.set("staffRoles/"+guest,{active:true,role:"director"});
  assert.equal((await h.call("listBaliQrCodes")).codes.length,0,"active director is supported alongside admin");
  h.memory.get("staffRoles/"+guest).active=false;
  await assert.rejects(h.call("listBaliQrCodes"),errorCode("permission-denied"));
});

await test("server generates distinct 192-bit bearer tokens, valid PNGs and bounded batch metadata",async()=>{
  const h=harness(),codes=await h.batch({count:100});
  assert.equal(codes.length,100);assert.equal(new Set(codes.map(c=>c.code)).size,100);
  for(const code of codes){
    assert.match(code.code,/^[a-f0-9]{48}$/);assert.equal(code.quantity,3);
    assert.equal(new URL(code.url).searchParams.get("baliQrBonus"),code.code);
    assert.match(code.qrDataUrl,/^data:image\/png;base64,/);
    const png=Buffer.from(code.qrDataUrl.split(",")[1],"base64");
    assert.equal(png.subarray(0,8).toString("hex"),"89504e470d0a1a0a");
    const meta=await sharp(png).metadata();assert.equal(meta.width,240);assert.equal(meta.height,240);
  }
  for(const code of codes.slice(0,3))assert.equal(await decode(code.qrDataUrl),code.url);
  for(const changes of [{count:0},{count:101},{count:1.2},{quantity:0},{quantity:1000},{quantity:NaN},
    {mode:"repeat",count:2},{action:"unknown"},{kind:"unknown"},{cooldownSeconds:4}]){
    const before=copy([...h.memory]);await assert.rejects(h.batch(changes));assert.deepEqual([...h.memory],before);
  }
});

await test("single-use credit ignores client credit amount, records receipt, and replay never credits twice",async()=>{
  const h=harness(),[{code}]=await h.batch();
  const preview=await h.call("previewBaliBonusQR",{code});
  assert.equal(preview.action,"credit");assert.equal(preview.quantity,3);assert.equal(preview.maxQuantity,3);
  const first=await h.apply(code,"a",999);
  assert.equal(first.receipt.count,3);assert.equal(first.receipt.balanceAfter,3);
  assert.equal(first.receipt.expiresAt,h.time()+30*DAY);
  assert.equal(h.wallet(guest)[0].remaining,3);
  const history=await h.call("listMyBaliHistory");
  assert.equal(history.items.length,1);assert.equal(history.items[0].source,"bonus-qr");
  assert.equal(history.items[0].name,preview.name);assert.equal(history.items[0].receiptExpiresAt,first.receipt.expiresAt);
  const saved=copy([...h.memory]),replay=await h.apply(code,"a",999);
  assert.equal(replay.alreadyProcessed,true);assert.deepEqual([...h.memory],saved);
  await assert.rejects(h.apply(code,"b"),errorCode("failed-precondition"));
  await assert.rejects(h.apply(code,"c",1,other),errorCode("failed-precondition"));
  await assert.rejects(h.call("previewBaliBonusQR",{code}),errorCode("failed-precondition"));
  assert.deepEqual([...h.memory],saved);
});

await test("debit validates quantity and active finite balance; insufficient funds leave QR and wallet unchanged",async()=>{
  const h=harness(),[{code}]=await h.batch({action:"debit",quantity:3});
  h.memory.set("guestWallets/"+guest,{uid:guest,grants:[
    {id:"active",kind:"shot",remaining:2},
    {id:"expired",kind:"shot",remaining:20,expiresAt:new Stamp(h.time()-1)},
    {id:"unlimited",kind:"shot",remaining:20,unlimited:true}
  ]});
  assert.equal((await h.call("previewBaliBonusQR",{code})).available,2);
  for(const quantity of [0,-1,1.5,4,"1",Infinity,3]){
    const saved=copy([...h.memory]);await assert.rejects(h.apply(code,"a",quantity));assert.deepEqual([...h.memory],saved);
  }
  const out=await h.apply(code,"b",2);assert.equal(out.receipt.type,"redeem");
  assert.equal(out.receipt.count,2);assert.equal(out.receipt.balanceAfter,0);
  assert.equal(h.wallet(guest)[0].remaining,0);assert.equal(h.wallet(guest)[1].remaining,20);
  const saved=copy([...h.memory]);
  assert.equal((await h.apply(code,"b",2)).alreadyProcessed,true);
  await assert.rejects(h.apply(code,"b",1),errorCode("already-exists"));
  assert.deepEqual([...h.memory],saved,"changed debit replay neither spends nor claims a new success");
});

await test("concurrent uses of once-code have one winner across guests",async()=>{
  const h=harness(),[{code}]=await h.batch();
  const results=await Promise.allSettled([h.apply(code,"a",1,guest),h.apply(code,"b",1,other)]);
  assert.equal(results.filter(r=>r.status==="fulfilled").length,1);
  assert.equal(results.filter(r=>r.status==="rejected"&&r.reason.code==="failed-precondition").length,1);
  assert.equal(h.wallet(guest).length+h.wallet(other).length,1);
  assert.equal([...h.memory.keys()].filter(k=>k.startsWith("walletOperations/")).length,1);
});

await test("repeat-code cooldown is per guest, honours elapsed time, and credits still respect 999 cap",async()=>{
  const h=harness(),[{code}]=await h.batch({mode:"repeat",quantity:500});
  await h.apply(code,"a");const saved=copy([...h.memory]);
  await assert.rejects(h.apply(code,"b"),errorCode("resource-exhausted"));assert.deepEqual([...h.memory],saved);
  assert.equal((await h.apply(code,"c",1,other)).receipt.balanceAfter,500);
  h.advance(30000);
  const before=copy([...h.memory]);
  await assert.rejects(h.apply(code,"d"),errorCode("resource-exhausted"));assert.deepEqual([...h.memory],before);
  const [{code:small}]=await h.batch({mode:"repeat",quantity:1});
  assert.equal((await h.apply(small,"e")).receipt.balanceAfter,501);
  h.advance(30000);assert.equal((await h.apply(small,"f")).receipt.balanceAfter,502);
  assert.equal(h.memory.get("baliBonusQRCodes/"+small).uses,0,
    "multi-use redemptions must never update the shared QR document");
  const listed=await h.call("listBaliQrCodes",{},staff);
  assert.equal(listed.codes.find(row=>row.code===small).uses,2,
    "admin counts real committed receipts without a hot counter");
});

await test("invalid, unknown and revoked vouchers fail without writes; custom bonus kinds remain usable",async()=>{
  const h=harness();
  for(const code of ["../wallets",null,"A".repeat(48),"a".repeat(47)])
    await assert.rejects(h.apply(code),errorCode("invalid-argument"));
  await assert.rejects(h.apply("a".repeat(48)),errorCode("failed-precondition"));
  await assert.rejects(h.batch({kind:"constructor"}),errorCode("not-found"));
  await h.call("createBaliBonusKind",{kind:"constructor",name:"Особый бонус"},staff);
  const [constructor]=await h.batch({kind:"constructor"});
  assert.equal(constructor.name,"Особый бонус","prototype property names require the real protected registry too");
  assert.equal((await h.call("createBaliBonusKind",{kind:"dessert",name:"Десерт",emoji:"🍰"},staff)).ok,true);
  const [{code}]=await h.batch({kind:"dessert"});
  assert.equal((await h.call("previewBaliBonusQR",{code})).kind,"dessert");
  await h.call("revokeBaliQrCode",{code},staff);const before=copy([...h.memory]);
  await assert.rejects(h.call("previewBaliBonusQR",{code}),errorCode("failed-precondition"));
  await assert.rejects(h.apply(code),errorCode("failed-precondition"));assert.deepEqual([...h.memory],before);
});

await test("spent/expired finite grants release credit capacity and immutable receipts survive compaction",async()=>{
  const h=harness(),[{code}]=await h.batch();
  const old=Array.from({length:79},(_,i)=>({id:"spent-"+i,kind:"shot",remaining:0}));
  old.push({id:"expired",kind:"shot",remaining:5,expiresAt:new Stamp(h.time()-1)});
  h.memory.set("guestWallets/"+guest,{uid:guest,grants:old});
  h.memory.set("walletOperations/old-history",{guestUid:guest,type:"redeem",count:1,createdAt:new Stamp(h.time()-1000)});
  assert.equal((await h.apply(code)).receipt.balanceAfter,3);
  assert.equal(h.wallet(guest).length,1);assert(h.memory.has("walletOperations/old-history"));
  h.memory.set("guestWallets/"+guest,{uid:guest,grants:Array.from({length:80},(_,i)=>({id:"live-"+i,kind:"shot",remaining:1}))});
  const [{code:blocked}]=await h.batch();const before=copy([...h.memory]);
  await assert.rejects(h.apply(blocked),errorCode("resource-exhausted"));assert.deepEqual([...h.memory],before);
});

await test("recipient QR is opaque and expires after five minutes; own and expired codes are rejected",async()=>{
  const h=harness(),out=await h.call("issueGuestQr");
  assert.equal(out.expiresAt,h.time()+300000);assert.match(out.qrDataUrl,/^data:image\/png;base64,/);
  const rows=[...h.memory].filter(([key])=>key.startsWith("guestRecipientQr/"));
  assert.equal(rows.length,1);assert.match(rows[0][0].split("/")[1],/^[a-f0-9]{64}$/);
  const decoded=new URL(await decode(out.qrDataUrl)),code=decoded.searchParams.get("baliRecipientQr");
  assert.match(code,/^[a-f0-9]{48}$/);assert.equal(decoded.hash,"#id");
  assert(!decoded.href.includes(guest),"recipient QR does not embed a Firebase UID");
  const {createHash}=require("node:crypto");
  assert.equal(rows[0][0],"guestRecipientQr/"+createHash("sha256").update(code).digest("hex"));
  await assert.rejects(h.call("previewBaliRecipientQr",{code}),errorCode("failed-precondition"));
  const preview=await h.call("previewBaliRecipientQr",{code},other);
  assert.equal(preview.number,"000001");assert.equal(preview.name,"Тестовый гость");
  assert.deepEqual(Object.keys(preview).sort(),["name","number"]);
  h.advance(300000);
  await assert.rejects(h.call("previewBaliRecipientQr",{code},other),errorCode("failed-precondition"));
});
