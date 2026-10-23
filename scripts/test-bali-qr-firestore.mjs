/* BALI QR multi-use contention regression on REAL Firestore emulator.
 * No production account, credentials or live backend access are allowed.
 * Example:
 *   firebase emulators:exec --config firebase.emulator.json --project demo-bali-menu
 *     --only firestore "node scripts/test-bali-qr-firestore.mjs"
 */
import assert from "node:assert/strict";
import {createRequire} from "node:module";
import {randomBytes,createHash} from "node:crypto";
const require=createRequire(import.meta.url);
const fRequire=createRequire(new URL("../functions/package.json",import.meta.url));
const admin=fRequire("firebase-admin");
const createQr=fRequire("./bonus-qr.js");
if(!/^(localhost|127\.0\.0\.1|\[::1\]):\d+$/.test(process.env.FIRESTORE_EMULATOR_HOST||""))
  throw new Error("Refusing real Firestore: FIRESTORE_EMULATOR_HOST must be loopback.");
const project=process.env.GCLOUD_PROJECT||process.env.GOOGLE_CLOUD_PROJECT;
if(project!=="demo-bali-menu")throw new Error("Refusing non-demo Firebase project.");
admin.initializeApp({projectId:project});
const db=admin.firestore(),TS=admin.firestore.Timestamp;
const digest=s=>createHash("sha256").update(s).digest("hex");
const code=randomBytes(24).toString("hex");
const allGuests=Array.from({length:96},(_,i)=>"simulated_QR_guest_"+String(i).padStart(4,"0"));
const issuer="simulated_QR_director";
const failure=(code,msg)=>Object.assign(new Error(msg),{code});
const backend=createQr({
  api:(_name,handler)=>handler,
  admin,db,TS,
  verified:req=>{
    if(!req.auth?.uid||req.auth.token?.email_verified!==true)throw failure("unauthenticated","not signed in");
    return req.auth.uid;
  },
  privileged:async uid=>uid===issuer,
  fail:(code,msg)=>{throw failure(code,msg);},
  nameAndId:async uid=>{
    const [person,id]=await Promise.all([
      db.doc("users/"+uid).get(),db.doc("baliIds/"+uid).get()]);
    if(!person.exists||!id.exists)throw failure("failed-precondition","card missing");
    return {uid,name:person.get("name"),number:String(id.get("number")).padStart(6,"0")};
  },
  wallet:(uid,snapshot)=>({uid,grants:Array.isArray(snapshot.data()?.grants)?snapshot.data().grants:[]})
});
const seed=db.batch();
allGuests.forEach((uid,i)=>{
  seed.set(db.doc("users/"+uid),{name:"Гость "+i});
  seed.set(db.doc("baliIds/"+uid),{uid,number:100+i});
});
seed.set(db.doc("baliBonusQRCodes/"+code),{
  kind:"shot",name:"Шоты",action:"credit",mode:"repeat",
  quantity:1,maxQuantity:1,active:true,used:false,uses:0,cooldownSeconds:30,
  createdAt:TS.now(),createdBy:issuer
});
await seed.commit();
const call=(uid,key)=>backend.applyBaliBonusQR({
  auth:{uid,token:{email_verified:true}},
  data:{code,requestId:key}
});
try{
  const started=Date.now();
  // Concurrent transactions hit a real Firestore emulator instead of an in-memory queue.
  const outcome=await Promise.allSettled(allGuests.map(uid=>call(uid,"a".repeat(32))));
  const errors=outcome.filter(r=>r.status==="rejected").map(r=>r.reason?.code||r.reason?.message);
  assert.deepEqual(errors,[],"Every distinct guest should receive exactly one bonus");
  assert.equal(outcome.filter(x=>x.value?.ok).length,allGuests.length);
  const qr=(await db.doc("baliBonusQRCodes/"+code).get()).data();
  assert.equal(qr.uses,0,"No mass redemption writes a shared QR counter");
  const result=await db.collection("walletOperations")
    .where("qrCodeHash","==",digest(code)).count().get();
  assert.equal(result.data().count,allGuests.length,"Exactly one committed receipt per guest");
  const walletChecks=await Promise.all(allGuests.map(uid=>db.doc("guestWallets/"+uid).get()));
  assert(walletChecks.every(w=>w.exists&&w.data().grants.length===1&&w.data().grants[0].remaining===1),
    "All 96 individual wallets must have one grant");
  const again=await call(allGuests[0],"a".repeat(32));
  assert.equal(again.alreadyProcessed,true,"A retry must not grant twice");
  await assert.rejects(call(allGuests[0],"b".repeat(32)),
    error=>error?.code==="resource-exhausted","Cooldown rejects a new request from the same guest");
  const checkAgain=await db.collection("walletOperations")
    .where("qrCodeHash","==",digest(code)).count().get();
  assert.equal(checkAgain.data().count,allGuests.length);
  const codes=await backend.listBaliQrCodes({auth:{uid:issuer,token:{email_verified:true}}});
  assert.equal(codes.codes.find(c=>c.code===code)?.uses,allGuests.length);
  console.log("BALI QR real Firestore emulator: 96 concurrent wallets, no hot counter, no duplicate grants, aggregate receipts PASS",{
    elapsedMs:Date.now()-started,redemptions:allGuests.length
  });
}finally{
  await admin.app().delete();
}
