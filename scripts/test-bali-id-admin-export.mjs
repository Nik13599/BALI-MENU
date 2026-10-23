import assert from "node:assert/strict";
import {createRequire} from "node:module";
import {readFileSync} from "node:fs";
import {DatabaseSync} from "node:sqlite";
const require=createRequire(import.meta.url);
const {prepareGrant,operationRecord,stable,sha,counts}=
 require("./stage-bali-id-from-firestore.cjs");
const uid="firebase_uid_001";
const t={toMillis:()=>1774200000000};
const rawGrant={id:"grant_abc",kind:"shot",originalCount:4,remaining:2,
 transferable:true,unlimited:false,issuedAt:t,expiresAt:t};
const grant=prepareGrant(uid,rawGrant);
assert.equal(grant.uid,uid);
assert.equal(grant.original,4);
assert.equal(grant.remaining,2);
assert.equal(grant.expires,1774200000000);
assert.equal(grant.hash.length,64);
assert.throws(()=>prepareGrant(uid,{...rawGrant,remaining:5}),/invalid-grant-quantity/);
assert.throws(()=>prepareGrant(uid,{...rawGrant,id:"",remaining:2}),/invalid-grant-quantity/);
assert.throws(()=>prepareGrant(uid,{...rawGrant,remaining:-1}),/invalid-grant-quantity/);
const cardUIDs=new Set([uid]);
const rec=operationRecord("op_01",{guestUid:uid,type:"grant",kind:"shot",count:4,
 createdAt:t,source:"bonus-qr",comment:"test",qrCodeHash:"abc"},cardUIDs);
assert.equal(rec.delta,4);
assert.equal(rec.type,"grant");
assert.equal(rec.data.createdAt,1774200000000);
assert.equal(rec.data.comment,"test");
assert.equal(rec.data.qrCodeHash,"abc");
assert.equal(operationRecord("op_02",{guestUid:uid,type:"redeem",kind:"shot",count:2,createdAt:t},cardUIDs).delta,-2);
assert.equal(operationRecord("op_03",{guestUid:uid,type:"transfer-out",kind:"shot",count:2,createdAt:t},cardUIDs).delta,-2);
assert.equal(operationRecord("op_04",{guestUid:uid,type:"transfer-in",kind:"shot",count:2,createdAt:t},cardUIDs).delta,2);
assert.throws(()=>operationRecord("op_05",{guestUid:"not_registered",type:"grant",count:1,createdAt:t},cardUIDs),/orphan-history/);
assert.throws(()=>operationRecord("op_06",{guestUid:uid,type:"unknown",count:1,createdAt:t},cardUIDs),/unrecognized-history/);
assert.throws(()=>operationRecord("op_07",{guestUid:uid,type:"grant",count:1,createdAt:null},cardUIDs),/timestamp/);
assert.equal(sha({z:1,a:{last:1,first:2}}),sha({a:{first:2,last:1},z:1}));
assert.deepEqual(stable({last:t,first:{b:2,a:1}}),{first:{a:1,b:2},last:1774200000000});
const count=counts({profiles:[{}],ids:[{}],grants:[{}],ops:[{},{}],noPrivilege:0});
assert.deepEqual(count,{profiles:1,cards:1,grants:1,operations:2,profilesWithoutPrivilege:0,coinWallets:0});
const db=new DatabaseSync(":memory:");
db.exec("PRAGMA foreign_keys=ON;");
db.exec(readFileSync("cloudflare-pages/d1/migrations/0005_bali_id_staging.sql","utf8"));
db.exec(readFileSync("cloudflare-pages/d1/migrations/0006_bali_id_operation_details_staging.sql","utf8"));
const digest="a".repeat(64);
db.prepare("INSERT INTO bali_guest_profiles_staging (firebase_uid,source_updated_at_ms,source_digest,staged_at_ms) VALUES (?,?,?,?)")
 .run(uid,1000,digest,2000);
db.prepare("INSERT INTO bali_id_cards_staging(firebase_uid,card_number,level,active,source_updated_at_ms,source_digest,staged_at_ms) VALUES (?,?,?,?,?,?,?)")
 .run(uid,"000010","Member",1,1000,digest,2000);
db.prepare("INSERT INTO bali_wallet_operations_staging(source_operation_id,firebase_uid,kind,operation_type,quantity_delta,created_at_ms,source_digest) VALUES (?,?,?,?,?,?,?)")
 .run("op_01",uid,"shot","grant",4,1000,digest);
db.prepare("INSERT INTO bali_wallet_operation_details_staging(source_operation_id,payload_json,source_digest,staged_at_ms) VALUES (?,?,?,?)")
 .run("op_01",JSON.stringify(rec.data),digest,2000);
assert.throws(()=>db.prepare("INSERT INTO bali_wallet_operation_details_staging(source_operation_id,payload_json,source_digest,staged_at_ms) VALUES (?,?,?,?)")
 .run("op_missing","{}",digest,2000));
assert.throws(()=>db.prepare("INSERT INTO bali_wallet_operation_details_staging(source_operation_id,payload_json,source_digest,staged_at_ms) VALUES (?,?,?,?)")
 .run("op_01","{INVALID_JSON}",digest,2000));
assert.equal(db.prepare("SELECT COUNT(*) AS n FROM bali_wallet_operation_details_staging").get().n,1);
db.close();
const cli=readFileSync("scripts/stage-bali-id-from-firestore.cjs","utf8");
assert.match(cli,/BALI_ID_STAGING_APPROVED/);
assert.match(cli,/CLOUDFLARE_API_TOKEN/);
assert.match(cli,/checkpoint:"pending"/);
assert.match(cli,/firebaseWrites:0/);
assert.match(cli,/cutover:false/);
console.log("BALI ID: secure source mapping, UID integrity, immutability, history details, explicit staging authorization and no cutover PASS.");
