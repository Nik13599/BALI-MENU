#!/usr/bin/env node
"use strict";
/*
 * BALI ID: server-side FIREBASE ADMIN -> CLOUDFLARE D1 STAGING.
 * No browser access to walletOperations, and NO LIVE WALLET WRITES.
 * Default mode is audit-only. Apply requires explicit environment gate.
 * All PII stays in process memory and Cloudflare D1; logs are counts only.
 *
 *   GOOGLE_CLOUD_PROJECT=bali-menu-5a48b node scripts/stage-bali-id-from-firestore.cjs
 *   GOOGLE_CLOUD_PROJECT=bali-menu-5a48b BALI_ID_STAGING_APPROVED=YES \
 *     CLOUDFLARE_API_TOKEN=... node scripts/stage-bali-id-from-firestore.cjs --apply
 *
 * For GitHub Actions prefer Workload Identity Federation. NEVER commit
 * service-account JSON, printed guest exports, access tokens or raw receipts.
 */
const {createRequire}=require("node:module");
const {createHash}=require("node:crypto");
const path=require("node:path");
const {pathToFileURL}=require("node:url");
const base=path.resolve(__dirname,"..");
const fRequire=createRequire(pathToFileURL(path.join(base,"functions","package.json")));
const PROJECT="bali-menu-5a48b";
const ACCOUNT="399972c0a0358037b0cb4d0d46ce69a3";
const DATABASE="6ec5e063-e2b7-48ce-beb9-d59af7207353";
const scopes=["bali-id","bali-bonuses","bali-coin","qr-history"];
const levels=new Set(["Member","Silver","Gold","Platinum","Black","Private","ResidentDJ"]);
const events=new Set(["grant","redeem","transfer-out","transfer-in"]);
const numeric=v=>Number.isSafeInteger(v)&&v>=0;
const ms=v=>{
  if(v==null)return null;
  if(typeof v.toMillis==="function")return v.toMillis();
  if(typeof v==="number")return v;
  if(typeof v==="string"){const n=Date.parse(v);return Number.isFinite(n)?n:null;}
  return null;
};
function stable(v){
 if(v&&typeof v.toMillis==="function")return v.toMillis();
 if(v===null||typeof v!=="object")return v;
 if(Array.isArray(v))return v.map(stable);
 return Object.fromEntries(Object.entries(v).sort(([a],[b])=>a.localeCompare(b))
  .map(([k,x])=>[k,stable(x)]).filter(([,x])=>x!==undefined));
}
const sha=value=>createHash("sha256").update(JSON.stringify(stable(value))).digest("hex");
const str=(x,max=200)=>String(x??"").trim().slice(0,max);
function must(condition,code){if(!condition)throw Error(code);}
function snapshot(s){return s.exists?s.data():null;}
function prepareGrant(uid,g){
 must(g&&typeof g==="object","invalid-grant-object");
 const id=str(g.id,95),kind=str(g.kind,30);
 const remaining=Number(g.remaining);
 const original=Number(g.originalCount??remaining);
 must(id&&kind&&numeric(remaining)&&numeric(original)&&remaining<=original,"invalid-grant-quantity");
 return {id,uid,kind,original,remaining,transferable:g.transferable===true?1:0,
  unlimited:g.unlimited===true?1:0,eventRef:str(g.eventRef,150),
  expires:ms(g.expiresAt),hash:sha({uid,grant:g})};
}
function operationRecord(id,doc,known){
 const uid=str(doc.guestUid,128),type=str(doc.type,35);
 must(id&&uid&&known.has(uid),"orphan-history-record");
 must(events.has(type),"unrecognized-history-type");
 const count=Number(doc.count||0);
 must(numeric(count),"invalid-history-count");
 const at=ms(doc.createdAt);
 must(Number.isSafeInteger(at)&&at>0,"missing-history-timestamp");
 const kind=str(doc.kind,35);
 const delta=["grant","transfer-in"].includes(type)?count:-count;
 const permitted=["source","type","kind","count","reason","createdAt","transferId",
  "items","comment","balanceAfter","fromNumber","toNumber","fromName","toName",
  "name","expiresAt","receiptExpiresAt","qrCodeHash","sourceQR","staffUid",
  "transferable","guestUid","receiptId"];
 const data=Object.fromEntries(permitted.filter(k=>doc[k]!==undefined)
  .map(k=>[k,stable(doc[k])]));
 return {id,uid,type,kind,delta,at,hash:sha({id,data}),data};
}
async function scan(collection,db,max=50000){
 let last=null,result=[];
 for(;;){
  let q=db.collection(collection).orderBy("__name__").limit(300);
  if(last)q=q.startAfter(last);
  const snap=await q.get();
  result.push(...snap.docs);
  must(result.length<=max,"firestore-source-too-large");
  if(snap.size<300)break;
  last=snap.docs.at(-1);
 }
 return result;
}
async function collect(db){
 const cards=await scan("baliIds",db,15000);
 const seenNumbers=new Set(),uids=new Set(),profiles=[],ids=[],grants=[];
 let noPrivilege=0;
 for(let at=0;at<cards.length;at+=60){
  const batch=cards.slice(at,at+60);
  const refs=batch.flatMap(c=>[
   db.doc("users/"+c.id),db.doc("guestPrivileges/"+c.id),db.doc("guestWallets/"+c.id)
  ]);
  const docs=await db.getAll(...refs);
  for(let n=0;n<batch.length;n++){
   const card=batch[n],uid=card.id,actual=card.data(),person=snapshot(docs[n*3]),
    levelDoc=snapshot(docs[n*3+1]),wallet=snapshot(docs[n*3+2]);
   must(person&&actual?.uid===uid,"missing-card-profile-or-uid-mismatch");
   const number=Number(actual.number);
   must(Number.isSafeInteger(number)&&number>0&&number<=999999,"invalid-card-number");
   must(!uids.has(uid)&&!seenNumbers.has(number),"duplicate-card-number-or-uid");
   uids.add(uid);seenNumbers.add(number);
   const tier=levelDoc?.tier||"Member";
   must(levels.has(tier),"unsupported-bali-id-tier");
   const benefits=levelDoc?.benefits||[];
   must(Array.isArray(benefits)&&benefits.length<=5,"invalid-card-privileges");
   if(!levelDoc)noPrivilege++;
   const t=ms(person.updatedAt)||ms(actual.createdAt)||Date.now();
   const personRow={uid,name:str(person.name),phone:str(person.phone,60),
    email:str(person.email,150),consent:str(person.consentVersion,100),
    updated:t,hash:sha({uid,person}),staged:Date.now()};
   profiles.push(personRow);
   ids.push({uid,number:String(number).padStart(6,"0"),tier,active:1,
    benefits:JSON.stringify(stable(benefits)),updated:ms(levelDoc?.updatedAt)||t,
    hash:sha({uid,card:actual,levelDoc}),staged:Date.now()});
   const raw=Array.isArray(wallet?.grants)?wallet.grants:[];
   must(raw.length<=80,"oversized-bali-wallet");
   grants.push(...raw.map(g=>prepareGrant(uid,g)));
  }
 }
 const grantIds=new Set();
 for(const g of grants){must(!grantIds.has(g.id),"duplicate-grant-id");grantIds.add(g.id);}
 const opDocs=await scan("walletOperations",db);
 const ops=opDocs.map(s=>operationRecord(s.id,s.data(),uids));
 return {profiles,ids,grants,ops,noPrivilege};
}
function counts(data){
 return {profiles:data.profiles.length,cards:data.ids.length,
  grants:data.grants.length,operations:data.ops.length,
  profilesWithoutPrivilege:data.noPrivilege,coinWallets:0};
}
function assertEnvironment(apply){
 const project=process.env.GOOGLE_CLOUD_PROJECT||process.env.GCLOUD_PROJECT;
 must(project===PROJECT,"wrong-firebase-project");
 if(!apply)return;
 must(process.env.BALI_ID_STAGING_APPROVED==="YES","staging-approval-missing");
 must(process.env.CLOUDFLARE_API_TOKEN?.length>=30,"cloudflare-token-missing");
 must((process.env.CLOUDFLARE_ACCOUNT_ID||ACCOUNT)===ACCOUNT,"wrong-cloudflare-account");
 must((process.env.CLOUDFLARE_D1_DATABASE_ID||DATABASE)===DATABASE,"wrong-cloudflare-database");
}
async function runD1(sql,params=[]){
 const resp=await fetch("https://api.cloudflare.com/client/v4/accounts/"+ACCOUNT+
  "/d1/database/"+DATABASE+"/query",{
   method:"POST",headers:{"Authorization":"Bearer "+process.env.CLOUDFLARE_API_TOKEN,
    "Content-Type":"application/json"},body:JSON.stringify({sql,params})
  });
 const data=await resp.json();
 if(!resp.ok||data.success!==true||!data.result?.[0]?.success)
  throw Error("d1-staging-statement-rejected");
 return data.result[0].results||[];
}
async function reconcile(sql,expected){
 const all=await runD1(sql);
 must(all.length===expected.length,"staging-count-mismatch");
 const actual=new Map(all.map(r=>[r.id,r.source_digest]));
 for(const row of expected)
  must(actual.get(row.id)===row.hash,"staging-digest-mismatch");
}
async function applyStaging(data){
 // Fail closed if tables are absent; never create/modify production wallets.
 for(const table of ["bali_guest_profiles_staging","bali_id_cards_staging",
  "bali_bonus_grants_staging","bali_wallet_operations_staging",
  "bali_wallet_operation_details_staging","bali_migration_checkpoints"]){
  await runD1("SELECT COUNT(*) AS n FROM "+table);
 }
 const insert=async(sql,rows,values)=>{
  for(const row of rows)await runD1(sql,values(row));
 };
 const upsert=(table,cols,key)=>
  "INSERT INTO "+table+" ("+cols.join(",")+") VALUES ("+cols.map(()=>"?").join(",")+")"+
  " ON CONFLICT("+key+") DO UPDATE SET "+
  cols.filter(c=>c!==key).map(c=>c+"=excluded."+c).join(",");
 await insert(upsert("bali_guest_profiles_staging",
  ["firebase_uid","display_name","phone","email","consent_version",
   "source_updated_at_ms","source_digest","staged_at_ms"],"firebase_uid"),
  data.profiles,p=>[p.uid,p.name,p.phone,p.email,p.consent,p.updated,p.hash,p.staged]);
 await insert(upsert("bali_id_cards_staging",
  ["firebase_uid","card_number","level","active","privileges_json",
   "source_updated_at_ms","source_digest","staged_at_ms"],"firebase_uid"),
  data.ids,c=>[c.uid,c.number,c.tier,c.active,c.benefits,c.updated,c.hash,c.staged]);
 await insert(upsert("bali_bonus_grants_staging",
  ["grant_id","firebase_uid","kind","original_quantity","remaining",
   "transferable","unlimited","event_ref","expires_at_ms","source_digest"],"grant_id"),
  data.grants,g=>[g.id,g.uid,g.kind,g.original,g.remaining,
   g.transferable,g.unlimited,g.eventRef,g.expires,g.hash]);
 await insert(upsert("bali_wallet_operations_staging",
  ["source_operation_id","firebase_uid","kind","operation_type","quantity_delta",
   "created_at_ms","source_digest"],"source_operation_id"),
  data.ops,o=>[o.id,o.uid,o.kind,o.type,o.delta,o.at,o.hash]);
 await insert(upsert("bali_wallet_operation_details_staging",
  ["source_operation_id","payload_json","source_digest","staged_at_ms"],"source_operation_id"),
  data.ops,o=>[o.id,JSON.stringify(o.data),o.hash,Date.now()]);
 await reconcile("SELECT firebase_uid AS id,source_digest FROM bali_guest_profiles_staging",
  data.profiles.map(p=>({id:p.uid,hash:p.hash})));
 await reconcile("SELECT firebase_uid AS id,source_digest FROM bali_id_cards_staging",
  data.ids.map(p=>({id:p.uid,hash:p.hash})));
 await reconcile("SELECT grant_id AS id,source_digest FROM bali_bonus_grants_staging",
  data.grants);
 await reconcile("SELECT source_operation_id AS id,source_digest FROM bali_wallet_operations_staging",
  data.ops);
 await reconcile("SELECT source_operation_id AS id,source_digest FROM bali_wallet_operation_details_staging",
  data.ops);
 const at=Date.now();
 // Counts+digests are locally reconciled; source can still change during the
 // export. The operational checkpoints stay PENDING, never VERIFIED.
 for(const [scope,amount] of [
  ["bali-id",data.ids.length],["bali-bonuses",data.grants.length],
  ["qr-history",data.ops.length]
 ]){
  await runD1("INSERT INTO bali_migration_checkpoints "+
   "(scope,source_backend,source_count,staged_count,missing_count,mismatched_count,"+
   "status,snapshot_at_ms,checked_at_ms,notes) "+
   "VALUES (?,'firebase-admin',?,?,0,0,'pending',?,?,?) "+
   "ON CONFLICT(scope) DO UPDATE SET source_backend=excluded.source_backend,"+
   "source_count=excluded.source_count,staged_count=excluded.staged_count,"+
   "missing_count=excluded.missing_count,mismatched_count=excluded.mismatched_count,"+
   "status='pending',snapshot_at_ms=excluded.snapshot_at_ms,"+
   "checked_at_ms=excluded.checked_at_ms,notes=excluded.notes",
   [scope,amount,amount,at,at,"Read-only snapshot, live Firebase unchanged"]);
 }
 await runD1("INSERT INTO bali_migration_checkpoints "+
  "(scope,source_backend,source_count,staged_count,missing_count,mismatched_count,"+
  "status,snapshot_at_ms,checked_at_ms,notes) VALUES "+
  "('bali-coin','google-sheets-disabled',0,0,0,0,'blocked',?,?,?) "+
  "ON CONFLICT(scope) DO UPDATE SET status='blocked',checked_at_ms=excluded.checked_at_ms",
  [at,at,"No verified BALI COIN ledger: never invent a zero balance"]);
}
async function main(){
 const apply=process.argv.includes("--apply");
 assertEnvironment(apply);
 const admin=fRequire("firebase-admin");
 if(!admin.apps.length)admin.initializeApp({projectId:PROJECT});
 try{
  const snapshot=await collect(admin.firestore());
  const totals=counts(snapshot);
  // No private UID/card, balance, name or history is logged.
  console.log(JSON.stringify({source:"firebase-admin",mode:apply?"staging-only":"audit-only",
   totals,cutover:false,sourceOfTruth:"firebase"}));
  if(apply){
   await applyStaging(snapshot);
   console.log(JSON.stringify({staged:true,verifiedPerRecordDigest:true,
    checkpoint:"pending",firebaseWrites:0,cutover:false}));
  }
 }finally{await admin.app().delete();}
}
if(require.main===module)main().catch(e=>{
 console.error("BALI ID staging blocked:",String(e?.message||"unknown").replace(/[\r\n].*/s,"").slice(0,90));
 process.exitCode=1;
});
module.exports={prepareGrant,operationRecord,counts,stable,sha};
