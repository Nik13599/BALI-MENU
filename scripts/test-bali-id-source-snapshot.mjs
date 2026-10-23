import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
import {DatabaseSync} from "node:sqlite";
import {canonicalize,record,manifest} from "./bali-id-source-snapshot.mjs";
const uidA="firebase_uid_example_001",uidB="firebase_uid_example_002";
const card=(uid,num)=>record("cards","baliIds/"+uid,{uid,number:num});
const profile=(uid)=>record("profiles","users/"+uid,{
 uid,name:"Guest",phone:"+375291234567",newCustomProfileField:"retained",
 consentVersion:3,createdAt:new Date("2026-10-23T00:00:00Z")
});
const wallet=(uid)=>record("wallets","guestWallets/"+uid,{
 uid,grants:[{id:"grant_"+uid,kind:"shot",originalCount:4,remaining:3,
  transferable:true,unlimited:false,expiresAt:null}],
 updatedAt:{seconds:1792723861,nanoseconds:123456789,toMillis(){return 1792723861123;}}
});
const op=record("operations","walletOperations/qr_test_123",{
 guestUid:uidA,type:"grant",count:1,kind:"shot",balanceAfter:3,
 createdAt:{seconds:1792723861,nanoseconds:900000000,toMillis(){return 1792723861900;}}
});
const transfer=record("transfers","bonusTransfers/example123",{
 fromUid:uidA,toUid:uidB,requestId:"a".repeat(32),items:[{quantity:1,kind:"shot"}]
});
const source=[profile(uidA),profile(uidB),card(uidA,1001),card(uidB,1002),
 wallet(uidA),wallet(uidB),op,transfer,
 record("privileges","guestPrivileges/"+uidA,{uid:uidA,tier:"Member",benefits:[]}),
 record("agreements","users/"+uidA+"/baliIdAgreements/privilege",{version:1}),
 record("bonus-kinds","baliBonusKinds/testbonus",{active:true,name:"Test Bonus"}),
 record("privilege-rules","privilegeRules/main",{levels:{Member:{benefits:[]}}})
];
assert.match(profile(uidA).payload,/newCustomProfileField/);
assert.match(wallet(uidA).payload,/\$timestamp/);
assert.equal(JSON.parse(wallet(uidA).payload).fields.updatedAt.$timestamp.nanoseconds,123456789);
assert.deepEqual(canonicalize({b:2,a:1}),{a:1,b:2});
assert.throws(()=>canonicalize({unsafe:Number.POSITIVE_INFINITY}));
assert.throws(()=>record("cards","users/invalid",{number:100}));
assert.throws(()=>record("other","other/name",{}));
const m=manifest(source);
assert.equal(m.total,12);
assert.equal(m.scopes.cards,2);
assert.equal(m.scopes.wallets,2);
assert.equal(m.scopes.operations,1);
assert.equal(m.scopes.transfers,1);
assert.equal(m.scopes.agreements,1);
const uidWithoutCard="firebase_uid_example_003";
const pendingConsent=record("agreements",
 "users/"+uidWithoutCard+"/baliIdAgreements/privilege",{version:1});
assert.equal(manifest([...source,profile(uidWithoutCard),pendingConsent]).scopes.agreements,2,
 "Save consent even when card allocation has not completed");
assert.throws(()=>manifest([...source,pendingConsent]),/nested-record-without-profile/);
assert.equal(m.digest.length,64);
assert.equal(manifest([...source].reverse()).digest,m.digest,"Stable order-independent source checksum");
assert.notEqual(manifest([...source.slice(0,4),
 record("wallets","guestWallets/"+uidA,{uid:uidA,grants:[{
  id:"grant_"+uidA,kind:"shot",originalCount:4,remaining:2,
  transferable:true,unlimited:false
 }]}),...source.slice(5)]).digest,m.digest,"Changed wallet must stop cutover");
assert.throws(()=>manifest([...source,source[0]]),/duplicate-source-path/);
assert.throws(()=>manifest([...source.slice(0,2),card(uidA,1001),card(uidB,1001),...source.slice(4)]),/duplicate-bali-id-number/);
assert.throws(()=>manifest(source.filter(r=>r.path!=="users/"+uidB)),/card-without-profile/);
assert.throws(()=>manifest(source.filter(r=>r.path!=="baliIds/"+uidA)),/orphan-card-related-record/);
assert.throws(()=>manifest(source.map(r=>r.path==="guestWallets/"+uidA?
  record("wallets",r.path,{uid:uidA,grants:[{id:"bad",kind:"shot",originalCount:1,remaining:2}]}):r)),
  /invalid-bonus-balance/);
assert.throws(()=>manifest(source.map(r=>r.path==="guestWallets/"+uidA?
  record("wallets",r.path,{uid:uidA,grants:[
   {id:"duplicate",kind:"shot",originalCount:1,remaining:1},
   {id:"duplicate",kind:"shot",originalCount:1,remaining:1}]}):r)),
  /duplicate-bonus-grant/);
const wrong={...source[0],digest:"f".repeat(64)};
assert.throws(()=>manifest([wrong,...source.slice(1)]),/snapshot-digest-mismatch/);
const db=new DatabaseSync(":memory:");
db.exec(readFileSync("cloudflare-pages/d1/migrations/0006_bali_source_snapshots.sql","utf8"));
const id="f".repeat(32),save=db.prepare(
 "INSERT INTO bali_source_snapshots (snapshot_id,source_path,scope,firebase_uid,payload_json,source_digest,staged_at_ms) VALUES(?,?,?,?,?,?,?)");
for(const r of source)save.run(id,r.path,r.scope,r.uid,r.payload,r.digest,1792723861000);
assert.equal(db.prepare("SELECT COUNT(*) AS n FROM bali_source_snapshots WHERE snapshot_id=?").get(id).n,12);
assert.throws(()=>save.run(id,source[0].path,source[0].scope,source[0].uid,
 source[0].payload,source[0].digest,1792723861000));
assert.throws(()=>save.run("x".repeat(32),"bad/doc","cards",uidA,"not-json","f".repeat(64),1792723861000));
db.prepare("INSERT INTO bali_snapshot_manifests (snapshot_id,source_project,state,document_count,source_manifest_digest,staged_manifest_digest,started_at_ms,finished_at_ms) VALUES(?,?,?,?,?,?,?,?)")
 .run(id,"bali-menu-5a48b","verified",m.total,m.digest,m.digest,1792723861000,1792723961000);
assert.throws(()=>db.prepare("INSERT INTO bali_snapshot_manifests (snapshot_id,source_project,state,document_count,source_manifest_digest,staged_manifest_digest,started_at_ms) VALUES(?,?,?,?,?,?,?)")
 .run("e".repeat(32),"other-firebase","verified",0,m.digest,m.digest,1792723861000));
const actual=db.prepare("SELECT source_path,source_digest FROM bali_source_snapshots ORDER BY source_path").all();
assert.deepEqual(actual.map(r=>r.source_path),source.map(r=>r.path).sort());
assert.equal(db.prepare("SELECT state FROM bali_snapshot_manifests").get().state,"verified");
const mockAuth=[
 'const errorJson=(status,error)=>new Response(JSON.stringify({error}),{status});',
 'const handlerError=e=>errorJson(e.status===403?403:503,"service-unavailable");',
 'const authorizeStaff=async(req,{adminOnly}={})=>{',
 ' if(req.headers.get("Authorization")!=="Bearer owner-test"||adminOnly!==true)',
 ' throw Object.assign(Error("denied"),{status:403});',
 ' return {uid:"owner"};',
 '};'
].join("\n");
const auditSource=readFileSync("cloudflare-pages/functions/api/admin/bali-id-source-snapshot-status.js","utf8");
const importLine='import {authorizeStaff,handlerError,errorJson} from "../../_lib/staff-auth.js";';
assert(auditSource.includes(importLine));
const audit=await import("data:text/javascript;base64,"+
 Buffer.from(auditSource.replace(importLine,mockAuth)).toString("base64"));
const store={
 prepare(sql){
  const q=db.prepare(sql);
  return {
   first:async()=>q.get()||null,
   bind(...args){return {all:async()=>({results:q.all(...args)})};}
  };
 }
};
const url="https://baliminsk.by/api/admin/bali-id-source-snapshot-status";
let response=await audit.onRequestGet({request:new Request(url),env:{BALI_OPERATIONS_DB:store}});
assert.equal(response.status,403,"Non-owners cannot inspect migration metadata");
response=await audit.onRequestPost();
assert.equal(response.status,405,"Snapshot audit must never accept writes");
response=await audit.onRequestGet({request:new Request(url,{
 headers:{Authorization:"Bearer owner-test"}
}),env:{BALI_OPERATIONS_DB:store}});
assert.equal(response.status,200);
const report=await response.json();
assert.equal(report.sourceOfTruth,"firebase");
assert.equal(report.sourceVerified,true);
assert.equal(report.cutoverAllowed,false);
assert.equal(report.stagedDocuments,12);
assert.equal(report.scopes.wallets,2);
assert(!JSON.stringify(report).includes(uidA),"Audit must not reveal Firebase UIDs");
db.close();
const script=readFileSync("scripts/export-bali-id-to-d1.mjs","utf8");
assert(script.includes('expectedAccount="399972c0a0358037b0cb4d0d46ce69a3"'));
assert(script.includes('expectedDatabase="6ec5e063-e2b7-48ce-beb9-d59af7207353"'));
assert(script.includes("Cloudflare account or D1 database mismatch"));
console.log("BALI ID source snapshots: complete guest profiles, linked UID/cards, exact grants, operations, transfers, nanosecond timestamps, SQL integrity PASS");
