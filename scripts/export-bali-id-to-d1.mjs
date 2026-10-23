/* Owner-initiated BALI ID migration inventory and immutable D1 snapshots.
 * Dry-run is the default, with zero Cloudflare writes.
 * This script NEVER changes Firebase, Wallet balances, or the active BALI ID.
 * Firebase ADC must be scoped to bali-menu-5a48b. Cloudflare credentials
 * must be supplied through a protected GitHub Actions environment.
 */
import {createRequire} from "node:module";
import {createHash} from "node:crypto";
import {newSnapshotId,SNAPSHOT_PROJECT,SOURCE_COLLECTIONS,record,manifest}
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
async function listCollection(name){
 const docs=[];let cursor=null;
 for(let page=0;page<=Math.ceil(MAX_PER_COLLECTION/PAGE);page++){
  let q=firestore.collection(name)
   .orderBy(admin.firestore.FieldPath.documentId()).limit(PAGE);
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
 for(const [scope,name] of Object.entries(SOURCE_COLLECTIONS)){
  const docs=await listCollection(name);
  for(const item of docs)records.push(record(scope,item.ref.path,item.data(),
    {updateTime:item.updateTime}));
  if(records.length>MAX_ALL)throw Error("Total source exceeds safety bound");
 }
 const cards=records.filter(x=>x.scope==="cards");
 for(const card of cards){
  const path="users/"+card.uid+"/baliIdAgreements/privilege";
  const snap=await firestore.doc(path).get();
  if(snap.exists)records.push(record("agreements",path,snap.data(),
    {updateTime:snap.updateTime}));
 }
 if(records.length>MAX_ALL)throw Error("Total source exceeds safety bound");
 return records;
}
const original=await source();
const expected=manifest(original);
console.log(JSON.stringify({mode:apply?"staging":"dry-run",sourceProject:project,
 scopes:expected.scopes,totalDocuments:expected.total,
 sourceManifest:expected.digest,activeWalletsStay:"firebase",cutoverAllowed:false}));
if(!apply){
 console.log("No Cloudflare writes executed. Snapshot validated only.");
 process.exit(0);
}
const account=process.env.CF_ACCOUNT_ID;
const database=process.env.CF_D1_DATABASE_ID;
const token=process.env.CF_API_TOKEN;
if(!account||!database||!token)
 throw Error("Staging blocked: protected Cloudflare credentials missing");
if(!/^[a-f0-9-]{30,40}$/i.test(database))
 throw Error("Unrecognized D1 database identifier");
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
const tables=await query("SELECT name FROM sqlite_master WHERE type='table' AND name IN ('bali_source_snapshots','bali_snapshot_manifests')");
if(tables.length!==2)throw Error("Apply migration 0006 to D1 before staging");
if(expected.total===0)throw Error("Empty Firebase export is not eligible for staging");
for(let index=0;index<original.length;index++){
 const r=original[index];
 await query("INSERT INTO bali_source_snapshots "+
  "(snapshot_id,source_path,scope,firebase_uid,payload_json,source_digest,staged_at_ms) "+
  "VALUES (?,?,?,?,?,?,?) ON CONFLICT(snapshot_id,source_path) DO NOTHING",
  [snapshotId,r.path,r.scope,r.uid,r.payload,r.digest,started]);
 if((index+1)%1000===0)console.log("Staged documents:",index+1);
}
const staged=[];
for(let offset=0;offset<expected.total;offset+=PAGE){
 const chunk=await query("SELECT source_path,source_digest FROM bali_source_snapshots "+
  "WHERE snapshot_id=? ORDER BY source_path LIMIT ? OFFSET ?",
  [snapshotId,PAGE,offset]);
 for(const row of chunk)staged.push(row.source_path+"\t"+row.source_digest);
}
if(staged.length!==expected.total)throw Error("Readback count differs from Firebase");
const stagedDigest=createHash("sha256").update(staged.join("\n")).digest("hex");
if(stagedDigest!==expected.digest)
 throw Error("D1 digest mismatch: verification forbidden");
const current=await source(),latest=manifest(current);
const stable=latest.total===expected.total&&latest.digest===expected.digest;
const state=stable?"verified":"blocked";
await query("INSERT INTO bali_snapshot_manifests "+
 "(snapshot_id,source_project,state,document_count,source_manifest_digest,"+
 "staged_manifest_digest,started_at_ms,finished_at_ms,notes) VALUES (?,?,?,?,?,?,?,?,?)",
 [snapshotId,project,state,expected.total,expected.digest,stagedDigest,started,
  Date.now(),stable?"Immutable source snapshot; no wallet cutover":
  "Firebase changed during staging; do not apply"]);
console.log(JSON.stringify({snapshotId,state,sourceCount:expected.total,
 sourceManifest:expected.digest,stagedDigest,
 firebaseSourceUnchanged:stable,cutoverAllowed:false}));
if(!stable)throw Error("Firebase source changed during copy; snapshot blocked");
console.log("Snapshot verified. Source Firebase remains authoritative.");
