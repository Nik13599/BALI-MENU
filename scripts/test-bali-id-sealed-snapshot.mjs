import assert from 'node:assert/strict';
import {generateKeyPairSync} from 'node:crypto';
import {sealSnapshot,openSnapshot} from './bali-id-sealed-snapshot.mjs';
import {record,manifest,SNAPSHOT_PROJECT} from './bali-id-source-snapshot.mjs';
const pair=()=>generateKeyPairSync('rsa',{modulusLength:3072,
 publicKeyEncoding:{type:'spki',format:'pem'},privateKeyEncoding:{type:'pkcs8',format:'pem'}});
const keys=pair(),other=pair(),uid='fixture_uid_sealed_01';
const records=[record('profiles','users/'+uid,{name:'Private fixture name',phone:'+375290000000'}),
 record('cards','baliIds/'+uid,{number:123456,uid})];
const snapshot={project:SNAPSHOT_PROJECT,snapshotId:'f'.repeat(32),startedAtMs:Date.now(),
 records,manifest:manifest(records)};
const sealed=sealSnapshot(snapshot,keys.publicKey);
assert.deepEqual(openSnapshot(sealed,keys.privateKey),snapshot);
assert(!JSON.stringify(sealed).includes(uid));
assert(!JSON.stringify(sealed).includes('Private fixture name'));
assert(!JSON.stringify(sealed).includes('+375290000000'));
assert.throws(()=>openSnapshot(sealed,other.privateKey));
assert.throws(()=>openSnapshot({...sealed,snapshotId:'e'.repeat(32)},keys.privateKey));
const damaged=Buffer.from(sealed.ciphertext,'base64');damaged[0]^=1;
assert.throws(()=>openSnapshot({...sealed,ciphertext:damaged.toString('base64')},keys.privateKey));
assert.throws(()=>sealSnapshot({...snapshot,manifest:{total:2,digest:'0'.repeat(64)}},keys.publicKey));
assert.notEqual(sealSnapshot(snapshot,keys.publicKey).ciphertext,sealed.ciphertext);
console.log('Sealed BALI snapshot: exact roundtrip, private fields hidden, wrong recipient/header/ciphertext rejected, source manifest checked PASS');
