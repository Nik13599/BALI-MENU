/* Encrypted transport only. No credentials, balance writes or wallet cutover. */
import {createPublicKey,createPrivateKey,createHash,randomBytes,
 createCipheriv,createDecipheriv,publicEncrypt,privateDecrypt,constants} from 'node:crypto';
import {SNAPSHOT_PROJECT,manifest} from './bali-id-source-snapshot.mjs';
const fingerprint=key=>createHash('sha256').update(createPublicKey(key)
 .export({type:'spki',format:'der'})).digest('hex');
function checked(snapshot){
 if(snapshot.project!==SNAPSHOT_PROJECT||!/^[a-f0-9]{32}$/.test(snapshot.snapshotId)||
  !Number.isSafeInteger(snapshot.startedAtMs)||!Array.isArray(snapshot.records))
  throw Error('invalid-sealed-snapshot');
 const actual=manifest(snapshot.records);
 if(actual.total===0||actual.total!==snapshot.manifest.total||actual.digest!==snapshot.manifest.digest)
  throw Error('sealed-manifest-mismatch');
 return snapshot;
}
const aad=header=>Buffer.from(JSON.stringify(header));
export function sealSnapshot(snapshot,recipientPem){
 checked(snapshot);
 const recipient=createPublicKey(recipientPem);
 if(recipient.asymmetricKeyType!=='rsa'||recipient.asymmetricKeyDetails.modulusLength<3072)
  throw Error('RSA recipient must have at least 3072 bits');
 const header={version:1,project:SNAPSHOT_PROJECT,snapshotId:snapshot.snapshotId,
  recipient:fingerprint(recipientPem)};
 const key=randomBytes(32),iv=randomBytes(12);
 const cipher=createCipheriv('aes-256-gcm',key,iv);
 cipher.setAAD(aad(header));
 const ciphertext=Buffer.concat([cipher.update(JSON.stringify(snapshot),'utf8'),cipher.final()]);
 const wrappedKey=publicEncrypt({key:recipient,padding:constants.RSA_PKCS1_OAEP_PADDING,
  oaepHash:'sha256'},key);
 key.fill(0);
 return {...header,wrappedKey:wrappedKey.toString('base64'),iv:iv.toString('base64'),
  tag:cipher.getAuthTag().toString('base64'),ciphertext:ciphertext.toString('base64')};
}
export function openSnapshot(envelope,privatePem){
 const privateKey=createPrivateKey(privatePem);
 const recipient=createPublicKey(privateKey).export({type:'spki',format:'pem'});
 const {version,project,snapshotId,recipient:target}=envelope;
 if(version!==1||project!==SNAPSHOT_PROJECT||target!==fingerprint(recipient)||
  !/^[a-f0-9]{32}$/.test(snapshotId))throw Error('sealed-recipient-or-header-mismatch');
 const key=privateDecrypt({key:privateKey,padding:constants.RSA_PKCS1_OAEP_PADDING,
  oaepHash:'sha256'},Buffer.from(envelope.wrappedKey,'base64'));
 try{
  const decipher=createDecipheriv('aes-256-gcm',key,Buffer.from(envelope.iv,'base64'));
  decipher.setAAD(aad({version,project,snapshotId,recipient:target}));
  decipher.setAuthTag(Buffer.from(envelope.tag,'base64'));
  const snapshot=checked(JSON.parse(Buffer.concat([
   decipher.update(Buffer.from(envelope.ciphertext,'base64')),decipher.final()
  ]).toString('utf8')));
  if(snapshot.snapshotId!==snapshotId)throw Error('sealed-snapshot-id-mismatch');
  return snapshot;
 }finally{key.fill(0);}
}
