import {test} from 'node:test';
import assert from 'node:assert/strict';
import {createOrderSnapshotReader} from '../bali-order-snapshots.js';

const row=(id,version=1)=>({id,data:()=>({updatedAt:version,status:'pending'})});
const snapshot=docs=>({docs});

test('100 orders: one changed document triggers one line read, metadata triggers none',async()=>{
  let reads=0;
  const read=createOrderSnapshotReader(async()=>{reads++;return [{unitPrice:12,quantity:2}];});
  const docs=Array.from({length:100},(_,i)=>row(String(i)));
  const initial=await read(snapshot(docs));
  assert.equal(reads,100);
  assert.equal(initial[0].total,24);
  await read(snapshot(docs));
  assert.equal(reads,100);
  docs[4]=row('4',2);
  await read(snapshot(docs));
  assert.equal(reads,101);
});

test('overlapping snapshots share pending reads and failures can be retried',async()=>{
  let release,reads=0;
  const gate=new Promise(resolve=>release=resolve);
  const read=createOrderSnapshotReader(async()=>{reads++;await gate;return [];});
  const first=read(snapshot([row('one')])),second=read(snapshot([row('one')]));
  release();await Promise.all([first,second]);
  assert.equal(reads,1);
  let attempts=0;
  const retry=createOrderSnapshotReader(async()=>{if(++attempts===1)throw Error('offline');return [];});
  await assert.rejects(retry(snapshot([row('one')])));
  assert.equal((await retry(snapshot([row('one')]))).length,1);
  assert.equal(attempts,2);
});

test('removed orders and a new subscription do not retain old lines',async()=>{
  let reads=0;
  const load=async()=>{reads++;return [];};
  const read=createOrderSnapshotReader(load);
  await read(snapshot([row('one')]));
  await read(snapshot([]));
  await read(snapshot([row('one')]));
  await createOrderSnapshotReader(load)(snapshot([row('one')]));
  assert.equal(reads,3);
});
