"use strict";
// BALI COIN migration tool. By default it only validates; --apply is explicit.
// Input JSON: {"cards":[{"uid":"firebaseUid","number":"000123","coinBalance":125}],
// "history":[{"uid":"firebaseUid","id":"op1","type":"credit","count":125,
// "balance":125,"reason":"Посещение","createdAt":"2026-10-23T18:00:00Z"}]}
const fs=require("node:fs"),path=require("node:path"),crypto=require("node:crypto");
const args=process.argv.slice(2),param=k=>args.includes(k)?args[args.indexOf(k)+1]:null;
const apply=args.includes("--apply"),offline=args.includes("--offline"),file=param("--input");
if(offline&&apply)throw Error("Offline validation cannot write to Firebase");
if(!file)throw Error("Specify --input private-export.json");
if(apply&&param("--confirm")!=="FIREBASE_COIN_IMPORT")throw Error("Write requires --confirm FIREBASE_COIN_IMPORT");
const data=JSON.parse(fs.readFileSync(path.resolve(file),"utf8"));
if(!Array.isArray(data.cards)||!Array.isArray(data.history))throw Error("Expected cards[] and history[]");
if(!data.cards.length)throw Error("Source wallet export is empty: no migration can be verified");
const sha=s=>crypto.createHash("sha256").update(s).digest("hex");
const bal=n=>Number.isSafeInteger(n)&&n>=0&&n<=999999999;
const users=new Map(),numbers=new Set();
for(const c of data.cards){
  if(!/^[A-Za-z0-9_-]{8,128}$/.test(c.uid)||!/^\d{6}$/.test(c.number)||!bal(c.coinBalance))
    throw Error("Invalid UID, number or balance in export");
  if(users.has(c.uid)||numbers.has(c.number))throw Error("Duplicate UID/number");
  users.set(c.uid,{card:c,history:[]});numbers.add(c.number);
}
const operations=new Set();
for(const h of data.history){
  if(!users.has(h.uid)||!String(h.id||"").trim()||!["credit","debit","transfer-in","transfer-out"].includes(h.type)||
    !Number.isSafeInteger(h.count)||h.count<1||!bal(h.balance)||!Number.isFinite(Date.parse(h.createdAt))||
    typeof h.reason!=="string")throw Error("Malformed history export");
  const key=h.uid+"|"+h.id;
  if(operations.has(key))throw Error("Duplicate history ID");
  operations.add(key);users.get(h.uid).history.push(h);
}
const signature=x=>sha(JSON.stringify({number:x.card.number,balance:x.card.coinBalance,
  history:x.history.map(h=>[h.id,h.type,h.count,h.balance,h.createdAt,h.reason])}));
for(const item of users.values()){
  const hist=item.history;
  let lastTime=-Infinity;
  for(const h of hist){
    const currentTime=Date.parse(h.createdAt);
    if(currentTime<lastTime)throw Error("History is not chronological for "+item.card.number);
    lastTime=currentTime;
  }
  if(hist.length&&hist.at(-1).balance!==item.card.coinBalance)
    throw Error("Balance does not match final history for "+item.card.number);
}
if(offline){
  const total=[...users.values()].reduce((sum,x)=>sum+BigInt(x.card.coinBalance),0n);
  console.log(JSON.stringify({
    audit:"LOCAL_FORMAT_ONLY",
    wallets:users.size,
    operations:data.history.length,
    totalCoinBalance:total.toString(),
    exportSha256:sha(fs.readFileSync(path.resolve(file))),
    firebaseIdentityVerified:false,
    actualSourceReconciled:false,
    firebaseWrites:0
  }));
  process.exit(0);
}
const admin=require(require.resolve("firebase-admin",{paths:[path.join(__dirname,"../functions")]}));
if(!admin.apps.length)admin.initializeApp();
const db=admin.firestore();
(async()=>{
  // Validate all immutable Firebase card IDs before writing the first balance.
  for(const x of users.values()){
    const {card}=x;
    const [identity,previous]=await Promise.all([
      db.doc("baliIds/"+card.uid).get(),db.doc("baliCoinAccounts/"+card.uid).get()]);
    if(!identity.exists||String(identity.data().number).padStart(6,"0")!==card.number)
      throw Error("Firebase BALI ID mismatch: "+card.number);
    if(previous.exists&&(previous.data().source!=="legacy-sheets-migration"||
      previous.data().migrationDigest!==signature(x)))
      throw Error("Existing wallet must not be overwritten: "+card.number);
  }
  console.log((apply?"IMPORT":"DRY RUN")+": "+users.size+" wallets; "+data.history.length+" rows");
  if(!apply){console.log("No Firestore writes. Freeze legacy edits before applying.");return;}
  let processed=0;
  for(const x of users.values()){
    const {card,history}=x,ref=db.doc("baliCoinAccounts/"+card.uid),digest=signature(x);
    await db.runTransaction(async tx=>{
      const previous=await tx.get(ref);
      if(!previous.exists)tx.create(ref,{balance:card.coinBalance,
        source:"legacy-sheets-migration",migrationDigest:digest,
        migrationComplete:history.length===0,updatedAt:admin.firestore.Timestamp.now()});
      else if(previous.data().migrationDigest!==digest)throw Error("Import conflict");
    });
    // Deterministic history IDs make a partially interrupted import resumable.
    for(let i=0;i<history.length;i+=100){
      const slice=history.slice(i,i+100),refs=slice.map(h=>
        ref.collection("history").doc("legacy_"+sha(card.uid+"|"+h.id)));
      const snaps=await db.getAll(...refs),batch=db.batch();
      let pending=0;
      for(let j=0;j<slice.length;j++)if(!snaps[j].exists){
        const h=slice[j];
        batch.create(refs[j],{type:h.type,count:h.count,balance:h.balance,
          reason:h.reason,source:"legacy-sheets-migration",
          createdAt:admin.firestore.Timestamp.fromDate(new Date(h.createdAt))});
        pending++;
      }
      if(pending)await batch.commit();
    }
    await ref.update({migrationComplete:true,migrationCompletedAt:admin.firestore.Timestamp.now()});
    processed++;
    if(processed%25===0||processed===users.size)console.log(processed+"/"+users.size);
  }
  console.log("Verify totals and receipt history before enabling Firebase coins on production.");
})().catch(e=>{console.error("ABORTED: "+e.message);process.exitCode=1});
