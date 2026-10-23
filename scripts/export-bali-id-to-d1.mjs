/* Owner-initiated BALI ID migration inventory and immutable D1 snapshots.
 * Dry-run is the default, with zero Cloudflare writes.
 * This script NEVER changes Firebase, Wallet balances, or the active BALI ID.
 * Firebase ADC must be scoped to bali-menu-5a48b. Cloudflare credentials
 * must be supplied through a protected GitHub Actions environment.
 */
import {createRequire} from "node:module";
import {createHash} from "node:crypto";
import {readFileSync,writeFileSync,mkdirSync} from "node:fs";
import {dirname} from "node:path";
import {sealSnapshot} from "./bali-id-sealed-snapshot.mjs";
import {newSnapshotId,SNAPSHOT_PROJECT,SOURCE_COLLECTIONS,LOYALTY_COLLECTIONS,
 NESTED_SOURCES,SNAPSHOT_TABLES,snapshotTable,record,manifest}
 from "./bali-id-source-snapshot.mjs";
const functionsRequire=createRequire(new URL("../functions/package.json",import.meta.url));
const admin=functionsRequire("firebase-admin");
const apply=process.env.BALI_ID_STAGE_APPLY==="true";
const project=process.env.FIREBASE_PROJECT_ID||process.env.GCLOUD_PROJECT;
if(project!==SNAPSHOT_PROJECT)
 throw Error("Refusing to access a Firebase project other than "+SNAPSHOT_PROJECT);
const started=Date.now(),snapshotId=newSnapshotId();
admin.initializeApp({credential:admin.credential.applicationDefault(),projectId:project});
const firestore=admin.firestore();
const PAGE=250,MAX_PER_COLLECTION=15000,MAX_ALL=50000;
async function listCollection(ref){
 const docs=[];let cursor=null;
 for(let page=0;page<=Math.ceil(MAX_PER_COLLECTION/PAGE);page++){
  let q=ref.orderBy(admin.firestore.FieldPath.documentId()).limit(PAGE);
  if(cursor)q=q.startAfter(cursor);
  const batch=await q.get();
  if(batch.empty)return docs;
  docs.push(...batch.docs);
  if(docs.length>MAX_PER_COLLECTION)
   throw Error("Source collection exceeded verified safety limit");
  cursor=batch.docs.at(-1);
  if(batch.size<PAGE)return docs;
 }
 throw Error("Source pagination exceeds safety bound");
}
async function source(){
 const records=[];
 for(const [scope,name] of Object.entries({...SOURCE_COLLECTIONS,...LOYALTY_COLLECTIONS})){
  const docs=await listCollection(firestore.collection(name));
  for(const item of docs)records.push(record(scope,item.ref.path,item.data(),
    {updateTime:item.updateTime}));
  if(records.length>MAX_ALL)throw Error("Total source exceeds safety bound");
 }
 // Generic collectionGroup('items'|'history'|'events') scans unrelated app
 // data and can exhaust Firestore reads before BALI source is captured.
 // Query only the immediate subcollections under each known BALI root.
 // listDocuments() includes missing parent documents with live subcollections,
 // so orphaned nested records are retained and validation can reject them.
 const parentRoots={
  agreements:"users","event-checkins":"users",
  "transfer-inbox":"baliTransferInbox",
  "coin-history":"baliCoinAccounts","coin-user-vouchers":"baliCoinAccounts",
  "brsm-entries":"brsmCampaigns","brsm-campaign-events":"brsmCampaigns",
  "brsm-rounds":"brsmCampaigns","brsm-round-private":"brsmCampaigns",
  "brsm-campaign-audit":"brsmCampaigns"
 };
 const parentsByRoot=new Map();
 let scopedQueries=0;
 for(const [scope,{group,path}] of Object.entries(NESTED_SOURCES)){
  // These names are specific to BALI and cost one collection-group query
  // instead of thousands of empty per-user subcollection queries. Generic
  // names (items/history/events/vouchers/entries/...) MUST stay scoped.
  if(scope==="agreements"||scope==="event-checkins"){
   const docs=await listCollection(firestore.collectionGroup(group));
   for(const doc of docs){
    if(path.test(doc.ref.path))records.push(record(scope,doc.ref.path,
      doc.data(),{updateTime:doc.updateTime}));
   }
   if(records.length>MAX_ALL)throw Error("Total source exceeds safety bound");
   continue;
  }
  const root=parentRoots[scope];
  if(!root)throw Error("Unmapped nested snapshot scope");
  if(!parentsByRoot.has(root)){
   const refs=await firestore.collection(root).listDocuments();
   if(!Array.isArray(refs)||refs.length>MAX_PER_COLLECTION)
    throw Error("Nested parent inventory exceeded safety bound");
   const unique=new Set();
   for(const parent of refs){
    if(typeof parent.path!=="string"||
       parent.path.split("/").length!==2||!parent.path.startsWith(root+"/")||
       typeof parent.collection!=="function"||unique.has(parent.path))
      throw Error("Invalid nested parent reference");
    unique.add(parent.path);
   }
   parentsByRoot.set(root,refs);
  }
  for(const parent of parentsByRoot.get(root)){
   // An empty subcollection still costs a query: stop unreasonable fanout
   // rather than turning a damaged source hierarchy into a quota storm.
   if(++scopedQueries>6000)throw Error("Nested query budget exceeded");
   const docs=await listCollection(parent.collection(group));
   for(const doc of docs){
    if(!path.test(doc.ref.path))throw Error("Unexpected nested source path");
    records.push(record(scope,doc.ref.path,doc.data(),
      {updateTime:doc.updateTime}));
   }
   if(records.length>MAX_ALL)throw Error("Total source exceeds safety bound");
  }
 }
 if(records.length>MAX_ALL)throw Error("Total source exceeds safety bound");
 return records;
}
const original=await source();
const expected=manifest(original);
console.log(JSON.stringify({mode:apply?"staging":"dry-run",sourceProject:project,
 scopes:expected.scopes,totalDocuments:expected.total,
 sourceManifest:expected.digest,activeWalletsStay:"firebase",cutoverAllowed:false}));
if(process.env.BALI_SNAPSHOT_SEAL_PATH){
 // The public Actions artifact contains ciphertext only. Recipient private key
 // never enters GitHub. Re-read the source before releasing the sealed copy.
 const current=manifest(await source());
 if(current.total!==expected.total||current.digest!==expected.digest)
  throw Error("Source changed before encrypted export; no artifact released");
 const sealed=sealSnapshot({project,snapshotId,startedAtMs:started,
  records:original,manifest:expected},
  readFileSync(process.env.BALI_SNAPSHOT_PUBLIC_KEY_FILE,"utf8"));
 mkdirSync(dirname(process.env.BALI_SNAPSHOT_SEAL_PATH),{recursive:true,mode:0o700});
 writeFileSync(process.env.BALI_SNAPSHOT_SEAL_PATH,JSON.stringify(sealed),{mode:0o600,flag:"wx"});
 console.log(JSON.stringify({sealedSnapshotId:snapshotId,recipient:sealed.recipient,
  totalDocuments:expected.total,sourceManifest:expected.digest,containsPlaintext:false}));
}
if(!apply){
 console.log("No Cloudflare writes executed. Snapshot validated only.");
 process.exit(0);
}
const account=process.env.CF_ACCOUNT_ID;
const database=process.env.CF_D1_DATABASE_ID;
const token=process.env.CF_API_TOKEN;
const expectedAccount="399972c0a0358037b0cb4d0d46ce69a3";
const expectedDatabase="6ec5e063-e2b7-48ce-beb9-d59af7207353";
if(!account||!database||!token)
 throw Error("Staging blocked: protected Cloudflare credentials missing");
if(account!==expectedAccount||database!==expectedDatabase)
 throw Error("Staging blocked: Cloudflare account or D1 database mismatch");
const endpoint="https://api.cloudflare.com/client/v4/accounts/"+account+
 "/d1/database/"+database+"/query";
async function query(sql,params=[]){
 const response=await fetch(endpoint,{
  method:"POST",headers:{"Authorization":"Bearer "+token,"Content-Type":"application/json"},
  body:JSON.stringify({sql,params}),signal:AbortSignal.timeout(25000)
 });
 if(!response.ok)throw Error("Cloudflare D1 API rejected staging (HTTP "+response.status+")");
 const result=await response.json();
 if(result.success!==true||!Array.isArray(result.result)||
    result.result.some(x=>x.success===false))
  throw Error("Cloudflare D1 rejected a statement; migration stopped");
 return result.result[0]?.results||[];
}
const tables=await query("SELECT name FROM sqlite_master WHERE type='table' AND name IN ('bali_source_snapshots','bali_snapshot_manifests','bali_nested_source_snapshots','bali_loyalty_source_snapshots')");
if(tables.length!==4)throw Error("Apply D1 migrations 0006, 0007 and 0008 before staging");
if(expected.total===0)throw Error("Empty Firebase export is not eligible for staging");
await query("INSERT INTO bali_snapshot_manifests "+
 "(snapshot_id,source_project,state,document_count,source_manifest_digest,"+
 "staged_manifest_digest,started_at_ms,notes) VALUES (?,?,?,?,?,?,?,?)",
 [snapshotId,project,"pending",expected.total,expected.digest,"0".repeat(64),started,
  "Copy in progress; source Firebase remains authoritative"]);
try{
for(let index=0;index<original.length;index++){
 const r=original[index];
 const table=snapshotTable(r.scope);
 await query("INSERT INTO "+table+
  " (snapshot_id,source_path,scope,firebase_uid,payload_json,source_digest,staged_at_ms) "+
  "VALUES (?,?,?,?,?,?,?) ON CONFLICT(snapshot_id,source_path) DO NOTHING",
  [snapshotId,r.path,r.scope,r.uid,r.payload,r.digest,started]);
 if((index+1)%1000===0)console.log("Staged documents:",index+1);
}
const staged=[];
for(const table of SNAPSHOT_TABLES){
 for(let offset=0;;offset+=PAGE){
  const chunk=await query("SELECT source_path,payload_json,source_digest FROM "+table+
   " WHERE snapshot_id=? ORDER BY source_path LIMIT ? OFFSET ?",
   [snapshotId,PAGE,offset]);
  for(const row of chunk){
   const digest=createHash("sha256").update(row.payload_json).digest("hex");
   if(digest!==row.source_digest)throw Error("Staged payload digest mismatch");
   staged.push(row.source_path+"\t"+digest);
  }
  if(staged.length>MAX_ALL)throw Error("Staged readback exceeds safety bound");
  if(chunk.length<PAGE)break;
 }
}
if(staged.length!==expected.total)throw Error("Readback count differs from Firebase");
const stagedDigest=createHash("sha256").update(staged.sort().join("\n")).digest("hex");
if(stagedDigest!==expected.digest)
 throw Error("D1 digest mismatch: verification forbidden");
const current=await source(),latest=manifest(current);
const stable=latest.total===expected.total&&latest.digest===expected.digest;
const state=stable?"verified":"blocked";
await query("UPDATE bali_snapshot_manifests SET state=?,staged_manifest_digest=?,finished_at_ms=?,notes=? WHERE snapshot_id=? AND state='pending'",
 [state,stagedDigest,
  Date.now(),stable?"Immutable source snapshot; no wallet cutover":
  "Firebase changed during staging; do not apply",snapshotId]);
console.log(JSON.stringify({snapshotId,state,sourceCount:expected.total,
 sourceManifest:expected.digest,stagedDigest,
 firebaseSourceUnchanged:stable,cutoverAllowed:false}));
if(!stable)throw Error("Firebase source changed during copy; snapshot blocked");
console.log("Snapshot verified. Source Firebase remains authoritative.");
}catch(error){
 // Do not publish raw Firebase errors, paths, QR codes, guest data or balances.
 await query("UPDATE bali_snapshot_manifests SET state='blocked',finished_at_ms=?,notes=? WHERE snapshot_id=? AND state='pending'",
  [Date.now(),"Copy or verification failed; source unchanged; cutover forbidden",snapshotId])
  .catch(()=>{});
 throw Error("Snapshot staging failed; source Firebase remains authoritative");
}
