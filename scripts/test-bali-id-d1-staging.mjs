import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
import {DatabaseSync} from "node:sqlite";
const db=new DatabaseSync(":memory:");
db.exec("PRAGMA foreign_keys=ON;");
db.exec(readFileSync("cloudflare-pages/d1/migrations/0005_bali_id_staging.sql","utf8"));
const digest="a".repeat(64);
const uid="firebase_uid_001";
const profile=db.prepare("INSERT INTO bali_guest_profiles_staging(firebase_uid,source_updated_at_ms,source_digest,staged_at_ms) VALUES(?,?,?,?)");
const card=db.prepare("INSERT INTO bali_id_cards_staging(firebase_uid,card_number,level,active,source_updated_at_ms,source_digest,staged_at_ms) VALUES(?,?,?,?,?,?,?)");
profile.run(uid,1000,digest,2000);
card.run(uid,"000101","Member",1,1000,digest,2000);
const bonus=db.prepare("INSERT INTO bali_bonus_grants_staging(grant_id,firebase_uid,kind,original_quantity,remaining,transferable,unlimited,source_digest) VALUES(?,?,?,?,?,?,?,?)");
bonus.run("grant_1",uid,"shot",3,2,1,0,digest);
assert.throws(()=>bonus.run("grant_2",uid,"shot",3,-1,1,0,digest));
assert.throws(()=>bonus.run("grant_3",uid,"shot",1,2,1,0,digest));
assert.throws(()=>card.run("other_uid_001","000101","Gold",1,1000,digest,2000));
assert.throws(()=>card.run("other_uid_001","000102","NotATier",1,1000,digest,2000));
assert.throws(()=>card.run("other_uid_001","000102","Gold",1,1000,digest,2000));
db.prepare("INSERT INTO bali_coin_balances_staging(firebase_uid,balance,source_digest,source_updated_at_ms) VALUES(?,?,?,?)")
 .run(uid,0,digest,1000);
assert.throws(()=>db.prepare("UPDATE bali_coin_balances_staging SET balance=-1 WHERE firebase_uid=?").run(uid));
db.prepare("INSERT INTO bali_wallet_operations_staging(source_operation_id,firebase_uid,kind,operation_type,quantity_delta,created_at_ms,source_digest) VALUES(?,?,?,?,?,?,?)")
 .run("operation_1",uid,"shot","grant",3,1000,digest);
assert.throws(()=>db.prepare("INSERT INTO bali_wallet_operations_staging(source_operation_id,firebase_uid,kind,operation_type,quantity_delta,created_at_ms,source_digest) VALUES(?,?,?,?,?,?,?)")
 .run("operation_1",uid,"shot","grant",3,1000,digest));
const sqlite={
 prepare(sql){const stmt=db.prepare(sql);return {
  first:async()=>stmt.get()||null,
  all:async()=>({results:stmt.all()})
 }};
};
const authMock=[
 'const errorJson=(status,error)=>new Response(JSON.stringify({error}),{status});',
 'const handlerError=e=>errorJson(e.status===401?401:e.status===403?403:503,"service-unavailable");',
 'const authorizeStaff=async(req,{adminOnly}={})=>{',
 ' if(req.headers.get("Authorization")!=="Bearer verified-owner"||!adminOnly)',
 ' throw Object.assign(Error("denied"),{status:403});',
 ' return {uid:"owner_uid"};',
 '};'
].join("\n");
const routeCode=readFileSync("cloudflare-pages/functions/api/admin/bali-id-migration-status.js","utf8");
const marker='import {authorizeStaff,handlerError,errorJson} from "../../_lib/staff-auth.js";';
assert(routeCode.includes(marker));
const {onRequestGet,onRequestPost}=await import("data:text/javascript;base64,"+
 Buffer.from(routeCode.replace(marker,authMock)).toString("base64"));
const url="https://baliminsk.by/api/admin/bali-id-migration-status";
let result=await onRequestGet({request:new Request(url),env:{BALI_OPERATIONS_DB:sqlite}});
assert.equal(result.status,403);
result=await onRequestPost();
assert.equal(result.status,405);
result=await onRequestGet({request:new Request(url,{headers:{Authorization:"Bearer verified-owner"}}),env:{BALI_OPERATIONS_DB:sqlite}});
assert.equal(result.status,200);
const body=await result.json();
assert.equal(body.sourceOfTruth,"firebase");
assert.equal(body.cutoverAllowed,false);
assert.equal(body.stagedCounts.profiles,1);
assert.equal(body.stagedCounts.cards,1);
assert.equal(body.stagedCounts.bonusGrants,1);
assert.equal(body.stagedCounts.bonusOperations,1);
assert.equal(body.stagedCounts.coinWallets,1);
assert.equal(body.orphanedRecords,0);
assert.equal(body.snapshotReconciliationVerified,false);
assert(!JSON.stringify(body).includes(uid),"No private Firebase UID in audit");
db.close();
console.log("BALI ID staging: unique UID/number, valid tiers, immutable operations, safe bonuses, nonnegative COIN and private fail-closed audit PASS");
