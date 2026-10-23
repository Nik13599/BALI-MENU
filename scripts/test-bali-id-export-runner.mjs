/* Execute the real exporter with fake Admin reads and a local SQLite D1 API.
 * No Firebase credentials, external requests or production data are used.
 */
import assert from 'node:assert/strict';
import {mkdtempSync,writeFileSync,readFileSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join,resolve} from 'node:path';
import {spawnSync} from 'node:child_process';
import {generateKeyPairSync} from 'node:crypto';
import {openSnapshot} from './bali-id-sealed-snapshot.mjs';
const directory=mkdtempSync(join(tmpdir(),'bali-snapshot-runner-'));
const preload=join(directory,'fake-admin.cjs');
const keys=generateKeyPairSync('rsa',{modulusLength:3072,
 publicKeyEncoding:{type:'spki',format:'pem'},privateKeyEncoding:{type:'pkcs8',format:'pem'}});
const publicKeyPath=join(directory,'recipient.pem');
writeFileSync(publicKeyPath,keys.publicKey);
writeFileSync(preload,String.raw`
const assert=require('node:assert/strict');
const fs=require('node:fs');
const Module=require('node:module');
const {DatabaseSync}=require('node:sqlite');
const db=new DatabaseSync(':memory:');
for(const name of ['0006_bali_source_snapshots.sql','0007_bali_nested_history.sql','0008_bali_loyalty_source_snapshots.sql'])
 db.exec(fs.readFileSync('cloudflare-pages/d1/migrations/'+name,'utf8'));
const uid='firebase_uid_fixture_001';
let reads=0,calls=0,corrupted=false;
const input=[
 ['users/'+uid,{uid,name:'Fixture Guest',retainedField:'original'}],
 ['baliIds/'+uid,{uid,number:123456}],
 ['baliCounters/guests',{count:123456,lastUid:uid}],
 ['guestWallets/'+uid,{uid,grants:[{id:'test',kind:'shot',originalCount:3,remaining:2}]}],
 ['walletOperations/qr_fixture',{guestUid:uid,count:2,qrId:'fixture-qr'}],
 ['baliBonusQRCodes/fixture-qr',{active:true,kind:'shot'}],
 ['baliBonusQRLocks/fixture-lock',{uid,qrId:'fixture-qr'}],
 ['guestRecipientQr/fixture-code',{uid}],
 ['users/'+uid+'/baliIdAgreements/privilege',{version:1}],
 ['users/'+uid+'/eventCheckins/event_one',{eventId:'event_one'}],
 ['baliTransferInbox/'+uid+'/items/fixture-transfer',{fromUid:uid}],
 ['baliCoinAccounts/'+uid,{balance:15}],
 ['baliCoinAccounts/'+uid+'/history/fixture-credit',{balance:15,count:15,type:'manual-credit'}],
 ['baliCoinAccounts/'+uid+'/vouchers/fixture-voucher',{status:'issued'}],
 ['baliCoinRequests/fixture-request',{uid,amount:15}],
 ['brsmCards/'+uid,{uid,active:true}],
 ['brsmCampaigns/campaign_one',{status:'draft'}],
 ['brsmCampaigns/campaign_one/entries/'+uid,{uid,visits:1}],
 ['brsmCampaigns/campaign_one/roundPrivate/round_one',{entries:[{uid,numbers:[1,2]}]}],
 // Unrelated app data must never be fetched by the BALI source exporter.
 ['otherModule/unrelated/items/not-bali',{privateRecord:true}],
 ['otherModule/unrelated/history/not-bali',{privateRecord:true}],
 ['otherModule/unrelated/events/not-bali',{privateRecord:true}]
];
// Exercise pagination in both Firestore and D1, beyond a single 250-row page.
for(let i=0;i<260;i++)input.push(['walletOperations/page_'+String(i).padStart(4,'0'),{guestUid:uid,count:1}]);
const timestamp={seconds:1792723861,nanoseconds:123456789,toMillis(){return 1792723861123;}};
const docs=input.map(([path,data])=>({ref:{path},data:()=>data,updateTime:timestamp}));
function query(filter){
 let max=250,after='';
 const q={orderBy(){return q},limit(n){max=n;return q},startAfter(doc){after=doc.ref.path;return q},
  async get(){
   reads++;
   if(process.env.BALI_FIXTURE_CASE==='source-change'&&reads>38)
    docs.find(d=>d.ref.path==='baliCoinAccounts/'+uid).data().balance=14;
   const batch=docs.filter(d=>filter(d.ref.path)&&d.ref.path>after)
    .sort((a,b)=>a.ref.path<b.ref.path?-1:1).slice(0,max);
   return {empty:batch.length===0,size:batch.length,docs:batch};
  }};
 return q;
}
const firestore=()=>({
 collection(name){
  const root=query(path=>path.split('/').length===2&&path.split('/')[0]===name);
  // Firestore listDocuments includes missing parents with live subcollections.
  root.listDocuments=async()=>{
   const ids=new Set();
   for(const doc of docs){
    const parts=doc.ref.path.split('/');
    if(parts[0]===name&&parts.length>=2)ids.add(parts[1]);
   }
   return [...ids].sort().map(id=>({
    path:name+'/'+id,
    collection(group){return query(path=>{
     const parts=path.split('/');
     return parts.length===4&&parts[0]===name&&parts[1]===id&&parts[2]===group;
    });}
   }));
  };
  return root;
 },
 collectionGroup(name){
  assert(['baliIdAgreements','eventCheckins'].includes(name),
   'Generic collectionGroup reads are prohibited: '+name);
  return query(path=>path.split('/').at(-2)===name);
 }
});
firestore.FieldPath={documentId:()=> '__name__'};
const fakeAdmin={credential:{applicationDefault:()=>({fixture:true})},
 initializeApp(options){assert.equal(options.projectId,'bali-menu-5a48b')},firestore};
const original=Module._load;
Module._load=function(request,...args){return request==='firebase-admin'?fakeAdmin:original.call(this,request,...args)};
global.fetch=async(url,options)=>{
 assert.equal(url,'https://api.cloudflare.com/client/v4/accounts/399972c0a0358037b0cb4d0d46ce69a3/d1/database/6ec5e063-e2b7-48ce-beb9-d59af7207353/query');
 calls++;
 const {sql,params}=JSON.parse(options.body);
 if(process.env.BALI_FIXTURE_CASE==='write-failure'&&sql.startsWith('INSERT INTO bali_source_snapshots'))
  return new Response('{}',{status:503});
 const statement=db.prepare(sql);
 let results=[];
 if(sql.startsWith('SELECT')){
  if(process.env.BALI_FIXTURE_CASE==='payload-corruption'&&!corrupted&&sql.includes('payload_json')){
   db.exec("UPDATE bali_source_snapshots SET payload_json='{}' WHERE scope='profiles'");corrupted=true;
  }
  results=statement.all(...params);
  if(process.env.BALI_FIXTURE_CASE==='missing-nested'&&sql.includes('FROM bali_nested_source_snapshots'))
   results=results.slice(1);
 }else statement.run(...params);
 return Response.json({success:true,result:[{success:true,results}]});
};
process.on('exit',()=>{
 const manifests=db.prepare('SELECT state,document_count FROM bali_snapshot_manifests').all();
 const counts=['bali_source_snapshots','bali_nested_source_snapshots','bali_loyalty_source_snapshots']
  .map(table=>db.prepare('SELECT COUNT(*) AS n FROM '+table).get().n);
 fs.writeFileSync(process.env.BALI_FIXTURE_REPORT,JSON.stringify({calls,reads,manifests,counts}));
 db.close();
});
`);
function run(scenario,apply){
 const reportPath=join(directory,scenario+'.json');
 const result=spawnSync(process.execPath,['--require',preload,resolve('scripts/export-bali-id-to-d1.mjs')],{
  encoding:'utf8',timeout:30000,
  env:{...process.env,FIREBASE_PROJECT_ID:'bali-menu-5a48b',BALI_ID_STAGE_APPLY:String(apply),
   CF_ACCOUNT_ID:'399972c0a0358037b0cb4d0d46ce69a3',
   CF_D1_DATABASE_ID:'6ec5e063-e2b7-48ce-beb9-d59af7207353',CF_API_TOKEN:'fixture-only',
   BALI_FIXTURE_CASE:scenario==='sealed-changing'?'source-change':scenario,BALI_FIXTURE_REPORT:reportPath,
   BALI_SNAPSHOT_SEAL_PATH:scenario.startsWith('sealed')?join(directory,scenario+'.sealed.json'):'',
   BALI_SNAPSHOT_PUBLIC_KEY_FILE:publicKeyPath}
 });
 assert(!result.error,result.error?.message);
 const report=JSON.parse(readFileSync(reportPath,'utf8'));
 assert(!result.stdout.includes('firebase_uid_fixture_001'),'No guest UID in stdout');
 assert(!result.stdout.includes('Fixture Guest'),'No guest name in stdout');
 assert(!result.stderr.includes('fixture-only'),'No credential in errors');
 return {result,report};
}
try{
 let {result,report}=run('dry-run',false);
 assert.equal(result.status,0,result.stderr);
 assert.equal(report.calls,0,'Dry-run must never call Cloudflare');
 assert.deepEqual(report.counts,[0,0,0]);
 const inventory=JSON.parse(result.stdout.split('\n')[0]);
 assert.equal(inventory.totalDocuments,279);
 assert.equal(inventory.scopes['transfer-inbox'],1,
  'Missing parent with nested inbox must be preserved');
 assert.equal(inventory.scopes['coin-history'],1,
  'Coin history must be read only under BALI account parents');
 assert.equal(inventory.scopes['card-counters'],1);
 assert.equal(inventory.scopes.operations,261);
 assert.equal(inventory.scopes['qr-codes'],1);
 assert.equal(inventory.scopes['coin-history'],1);
 assert.equal(inventory.scopes['brsm-round-private'],1);
 ({result,report}=run('sealed',false));
 assert.equal(result.status,0,result.stderr);
 assert.equal(report.calls,0,'Encrypted export remains write-free for D1');
 const transported=openSnapshot(JSON.parse(readFileSync(join(directory,'sealed.sealed.json'),'utf8')),keys.privateKey);
 assert.equal(transported.records.length,279);
 assert.equal(transported.manifest.digest,inventory.sourceManifest);
 ({result,report}=run('sealed-changing',false));
 assert.notEqual(result.status,0,'Changed source cannot release an encrypted copy');
 assert.equal(report.calls,0);
 ({result,report}=run('verified',true));
 assert.equal(result.status,0,result.stderr);
 assert.equal(report.manifests[0].state,'verified');
 assert.equal(report.manifests[0].document_count,279);
 assert.equal(report.counts.reduce((a,b)=>a+b),279);
 for(const scenario of ['source-change','payload-corruption','write-failure','missing-nested']){
  ({result,report}=run(scenario,true));
  assert.notEqual(result.status,0,scenario+' must fail closed');
  assert.equal(report.manifests[0].state,'blocked',scenario+' records blocked snapshot');
 }
 console.log('BALI snapshot exporter: paginated QR/COIN/BRSM inventory, zero-write dry-run, exact D1 readback, changed source, corruption, interrupted copy and missing nested history PASS');
}finally{rmSync(directory,{recursive:true,force:true});}
