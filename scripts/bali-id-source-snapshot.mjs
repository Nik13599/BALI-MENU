/* Canonical, lossless Firebase source migration primitives.
 * Does not grant privileges or modify any wallet.
 * Never log payload_json: it contains private guest/account details.
 */
import {createHash,randomBytes} from "node:crypto";

export const SNAPSHOT_PROJECT="bali-menu-5a48b";
export const SOURCE_COLLECTIONS=Object.freeze({
  profiles:"users",
  cards:"baliIds",
  privileges:"guestPrivileges",
  wallets:"guestWallets",
  operations:"walletOperations",
  transfers:"bonusTransfers",
  "bonus-kinds":"baliBonusKinds",
  "privilege-rules":"privilegeRules"
});
const hex=s=>createHash("sha256").update(s).digest("hex");
export const newSnapshotId=()=>randomBytes(16).toString("hex");

export function canonicalize(v,depth=0){
  if(depth>32)throw Error("source-depth-limit");
  if(v===null||v===undefined)return v===undefined?null:null;
  if(typeof v==="string"||typeof v==="boolean")return v;
  if(typeof v==="number"){
    if(!Number.isFinite(v))throw Error("non-finite-source-value");
    return v;
  }
  if(typeof v==="bigint")return String(v);
  if(v instanceof Date)return {$date:v.toISOString()};
  // Firebase Admin Timestamp, preserving nanosecond resolution exactly.
  if(Number.isInteger(v.seconds)&&Number.isInteger(v.nanoseconds)&&
    typeof v.toMillis==="function")
    return {$timestamp:{seconds:v.seconds,nanoseconds:v.nanoseconds}};
  if(v instanceof Uint8Array)return {$bytes:Buffer.from(v).toString("base64")};
  if(Array.isArray(v))return v.map(x=>canonicalize(x,depth+1));
  if(typeof v==="object"){
    if(typeof v.path==="string"&&typeof v.get==="function")
      return {$documentReference:v.path};
    const out={};
    for(const key of Object.keys(v).sort()){
      if(key==="__proto__"||key==="constructor"||key==="prototype")
        throw Error("unsafe-source-key");
      out[key]=canonicalize(v[key],depth+1);
    }
    return out;
  }
  throw Error("unsupported-firestore-source-value");
}
export function encode(data){
  return JSON.stringify(canonicalize(data));
}
export function record(scope,path,data,{updateTime=null}={}){
  if(!Object.hasOwn(SOURCE_COLLECTIONS,scope)&&!["agreements","event-checkins","transfer-inbox"].includes(scope))
    throw Error("invalid-snapshot-scope");
  const base=path.split("/").filter(Boolean);
  if(scope==="agreements"){
    if(base.length!==4||base[0]!=="users"||base[2]!=="baliIdAgreements")
      throw Error("unexpected-agreement-source");
  }else if(scope==="event-checkins"){
    if(base.length!==4||base[0]!=="users"||base[2]!=="eventCheckins")
      throw Error("unexpected-checkin-source");
  }else if(scope==="transfer-inbox"){
    if(base.length!==4||base[0]!=="baliTransferInbox"||base[2]!=="items")
      throw Error("unexpected-inbox-source");
  }else if(base.length!==2||base[0]!==SOURCE_COLLECTIONS[scope])
    throw Error("unexpected-source-path");
  if(!data||typeof data!=="object"||Array.isArray(data))
    throw Error("invalid-source-document");
  // Preserve every original field, including versioned consents and
  // unforeseen extensions. Filtering profiles makes a "lossless" copy false.
  const details=data;
  const uid=["profiles","cards","privileges","wallets"].includes(scope)
    ?base[1]:scope==="operations"?data.guestUid:
    scope==="transfers"?data.fromUid:
    ["agreements","event-checkins","transfer-inbox"].includes(scope)?base[1]:null;
  if(uid!==null&&(typeof uid!=="string"||!/^[A-Za-z0-9_-]{8,128}$/.test(uid)))
    throw Error("invalid-firebase-uid");
  const payload=encode({fields:details,
    sourceUpdateTime:updateTime?canonicalize(updateTime):null});
  return {scope,path,uid,payload,digest:hex(payload)};
}
const cardNo=value=>{
  const n=Number(value);
  if(!Number.isSafeInteger(n)||n<1||n>999999999)
    throw Error("invalid-card-number");
  return n;
};
export function validateRecords(rows){
  const paths=new Set(),profiles=new Set(),cards=new Map(),numbers=new Set();
  const count={};
  for(const r of rows){
    if(paths.has(r.path))throw Error("duplicate-source-path");
    paths.add(r.path);count[r.scope]=(count[r.scope]||0)+1;
    if(hex(r.payload)!==r.digest)throw Error("snapshot-digest-mismatch");
    if(r.scope==="profiles")profiles.add(r.uid);
    if(r.scope==="cards"){
      const fields=JSON.parse(r.payload).fields;
      const n=cardNo(fields.number);
      if(numbers.has(n))throw Error("duplicate-bali-id-number");
      numbers.add(n);cards.set(r.uid,fields);
      if(fields.uid&&fields.uid!==r.uid)throw Error("card-uid-mismatch");
    }
  }
  for(const r of rows){
    const fields=JSON.parse(r.payload).fields;
    if(r.scope==="cards"&&!profiles.has(r.uid))
      throw Error("card-without-profile");
    if(["wallets","privileges","operations"].includes(r.scope)&&
      !cards.has(r.uid))throw Error("orphan-card-related-record");
    // An agreement may legitimately precede card allocation. Preserve it
    // as long as its Firebase account exists, even if onboarding failed.
    if(["agreements","event-checkins","transfer-inbox"].includes(r.scope)&&
      !profiles.has(r.uid))throw Error("nested-record-without-profile");
    if(r.scope==="wallets"){
      if(fields.uid&&fields.uid!==r.uid)throw Error("wallet-uid-mismatch");
      if(!Array.isArray(fields.grants))throw Error("invalid-wallet-grants");
      const grantIds=new Set();
      for(const grant of fields.grants){
        if(!grant||typeof grant.id!=="string"||!grant.id)
          throw Error("invalid-bonus-grant-id");
        if(grantIds.has(grant.id))throw Error("duplicate-bonus-grant");
        grantIds.add(grant.id);
        if(grant.unlimited===true)continue;
        if(!Number.isSafeInteger(grant.remaining)||grant.remaining<0||
          !Number.isSafeInteger(grant.originalCount)||
          grant.originalCount<grant.remaining||grant.originalCount>999)
          throw Error("invalid-bonus-balance");
      }
    }
    if(r.scope==="transfers"&&
      (!cards.has(fields.fromUid)||!cards.has(fields.toUid)))
      throw Error("orphan-transfer-participant");
  }
  return count;
}
export function manifest(rows){
  const sorted=rows.map(x=>x.path+"\t"+x.digest).sort();
  return {total:rows.length,digest:hex(sorted.join("\n")),scopes:validateRecords(rows)};
}
