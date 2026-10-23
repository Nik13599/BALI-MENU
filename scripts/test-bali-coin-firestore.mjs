/* Real transaction contention in the loopback demo emulator only. */
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {createHash} from 'node:crypto';
if(!/^(localhost|127\.0\.0\.1|\[::1\]):\d+$/.test(process.env.FIRESTORE_EMULATOR_HOST||''))
 throw Error('Refusing non-loopback Firestore');
if((process.env.GCLOUD_PROJECT||process.env.GOOGLE_CLOUD_PROJECT)!=='demo-bali-menu')
 throw Error('Refusing non-demo project');
const require=createRequire(new URL('../functions/package.json',import.meta.url));
const admin=require('firebase-admin');
admin.initializeApp({projectId:'demo-bali-menu'});
const db=admin.firestore(),TS=admin.firestore.Timestamp;
const sha=s=>createHash('sha256').update(s).digest('hex');
const failure=(code,message)=>Object.assign(Error(message),{code});
const createRollout=require('./coin-rollout.js');
const fail=(code,message)=>{throw failure(code,message)};
const coinRollout=createRollout({fail,env:{BALI_COIN_WRITE_MODE:'live',
  BALI_COIN_VERIFIED_EXPORT_SHA256:'a'.repeat(64),
  BALI_COIN_LIVE_CONFIRM:'VERIFIED_SOURCE_AND_WALLETS'}});
const staff='emulator_coin_staff_01',campaignId='emulator_campaign_01',eventId='emulator_event_01';
const guests=Array.from({length:96},(_,i)=>'emulator_coin_guest_'+String(i).padStart(3,'0'));
const buyers=Array.from({length:8},(_,i)=>'emulator_coin_buyer_'+String(i).padStart(2,'0'));
const backend=require('./bali-coin.js')({api:(_name,handler)=>handler,admin,db,TS,coinRollout,
 verified:req=>{if(!req.auth?.uid)fail('unauthenticated','Missing fixture identity');return req.auth.uid},
 privileged:async uid=>uid===staff,fail,
 nameAndId:async uid=>{
  const [p,c]=await Promise.all([db.doc('users/'+uid).get(),db.doc('baliIds/'+uid).get()]);
  if(!p.exists||!c.exists)fail('failed-precondition','Missing fixture card');
  return {uid,name:p.get('name'),number:String(c.get('number')).padStart(6,'0')};
 }
});
const awards=require('./brsm-coin-awards.js')({db,TS,fail,coinRollout});
const call=(name,uid,data)=>backend[name]({auth:{uid},data});
// Retry only an explicitly transient Firestore abort using the SAME request ID.
// Validation, insufficient funds and every other application error are final.
const retry=async action=>{
 for(let attempt=0;;attempt++){
  try{return await action()}catch(e){if(attempt>=2||![10,'aborted'].includes(e.code))throw e;}
 }
};
try{
 let seed=db.batch();
 for(const [i,uid] of guests.entries()){
  seed.set(db.doc('users/'+uid),{name:'Emulator guest'});
  seed.set(db.doc('baliIds/'+uid),{uid,number:10000+i});
  seed.set(db.doc('guestPrivileges/'+uid),{uid,tier:i%2?'Gold':'Member',benefits:[]});
 }
 for(const [i,uid] of buyers.entries()){
  seed.set(db.doc('users/'+uid),{name:'Emulator buyer'});
  seed.set(db.doc('baliIds/'+uid),{uid,number:20000+i});
  seed.set(db.doc('baliCoinAccounts/'+uid),{balance:75});
 }
 seed.set(db.doc('preorderStaff/'+staff),{active:true,role:'preorders'});
 seed.set(db.doc('baliCoinRewards/'+sha(campaignId+'|EVENT|'+eventId)),{active:true,amount:40});
 seed.set(db.doc('baliCoinLots/'+campaignId+'_single_drink'),{
  campaignId,lotId:'single_drink',name:'Fixture drink',category:'bar',price:50,stock:1,sold:0,active:true
 });
 await seed.commit();
 const rateBefore=(await db.doc('baliCoinRewards/'+sha(campaignId+'|EVENT|'+eventId)).get()).updateTime;
 const issued=await Promise.all(guests.map(uid=>retry(()=>db.runTransaction(async tx=>{
  const result=await awards.award(tx,{uid,campaignId,eventId});
  tx.create(db.doc('brsmCampaigns/'+campaignId+'/entries/'+uid),{visits:[{eventId,source:'qr'}]});
  return result;
 }))));
 assert(issued.every(x=>x.amount===40));
 const accounts=await Promise.all(guests.map(uid=>db.doc('baliCoinAccounts/'+uid).get()));
 assert(accounts.every(x=>x.get('balance')===40));
 const rateAfter=(await db.doc('baliCoinRewards/'+sha(campaignId+'|EVENT|'+eventId)).get()).updateTime;
 assert(rateAfter.isEqual(rateBefore),'96 visits must not update a shared reward counter');
 const replay=await call('coinClaimVisit',guests[0],{campaignId,eventId});
 assert.equal(replay.result.alreadyProcessed,true,'Claim API shares check-in idempotency');
 const failedUid='emulator_coin_failed_01';
 await assert.rejects(db.runTransaction(async tx=>{
  await awards.award(tx,{uid:failedUid,campaignId,eventId});
  tx.create(db.doc('brsmCampaigns/'+campaignId+'/entries/'+failedUid),{visits:[{eventId}]});
  throw failure('fixture-abort','Abort after staged reward');
 }),e=>e.code==='fixture-abort');
 assert.equal((await db.doc('baliCoinAccounts/'+failedUid).get()).exists,false);
 assert.equal((await db.doc('brsmCampaigns/'+campaignId+'/entries/'+failedUid).get()).exists,false);
 const duplicate={number:'010001',amount:15,comment:'fixture',requestId:'parallel_same_request_01'};
 const repeats=await Promise.all(Array.from({length:6},()=>retry(()=>call('coinTransfer',guests[0],duplicate))));
 assert.equal(repeats.filter(x=>!x.result.alreadyProcessed).length,1);
 assert.equal((await db.doc('baliCoinAccounts/'+guests[0]).get()).get('balance'),25);
 assert.equal((await db.doc('baliCoinAccounts/'+guests[1]).get()).get('balance'),55);
 const burst=await Promise.allSettled(Array.from({length:16},(_,i)=>retry(()=>call('coinTransfer',guests[2],{
  number:'010003',amount:15,comment:'contention fixture',requestId:'different_request_'+String(i).padStart(4,'0')
 }))));
 assert.equal(burst.filter(x=>x.status==='fulfilled').length,2);
 assert(burst.filter(x=>x.status==='rejected').every(x=>x.reason.code==='failed-precondition'));
 assert.equal((await db.doc('baliCoinAccounts/'+guests[2]).get()).get('balance'),10);
 assert.equal((await db.doc('baliCoinAccounts/'+guests[3]).get()).get('balance'),70);
 const purchases=await Promise.allSettled(buyers.map((uid,i)=>retry(()=>call('coinRedeemLot',uid,{
  campaignId,lotId:'single_drink',requestId:'purchase_fixture_'+String(i).padStart(4,'0')
 }))));
 assert.equal(purchases.filter(x=>x.status==='fulfilled').length,1);
 assert(purchases.filter(x=>x.status==='rejected').every(x=>x.reason.code==='failed-precondition'));
 assert.equal((await db.doc('baliCoinLots/'+campaignId+'_single_drink').get()).get('sold'),1);
 const balances=await Promise.all(buyers.map(uid=>db.doc('baliCoinAccounts/'+uid).get()));
 assert.equal(balances.reduce((sum,x)=>sum+x.get('balance'),0),8*75-50);
 const winner=purchases.findIndex(x=>x.status==='fulfilled');
 const voucher=purchases[winner].value.result.voucher;
 const served=await Promise.all(Array.from({length:6},()=>retry(()=>call('coinVoucherFulfill',staff,{
  number:String(20000+winner).padStart(6,'0'),voucher
 }))));
 assert.equal(served.filter(x=>!x.result.alreadyFulfilled).length,1);
 assert.equal((await db.collection('baliCoinVouchers').count().get()).data().count,1);
 assert.equal((await db.doc('baliCoinVouchers/'+sha(voucher)).get()).get('status'),'served');
 console.log('BALI COIN real emulator: 96 atomic visits, rollback, shared retry receipt, overdraft contention, single-stock purchase and one-time bar fulfilment PASS');
}finally{await admin.app().delete();}
