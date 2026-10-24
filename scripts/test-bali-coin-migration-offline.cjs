"use strict";
const test=require("node:test");
const assert=require("node:assert/strict");
const fs=require("node:fs");
const os=require("node:os");
const path=require("node:path");
const {spawnSync}=require("node:child_process");

test("BALI COIN export can be audited offline without Firebase credentials",()=>{
  const temp=fs.mkdtempSync(path.join(os.tmpdir(),"bali-coin-audit-"));
  const input=path.join(temp,"private-export.json");
  const tool=path.join(__dirname,"migrate-bali-coins.cjs");
  const card={uid:"test_firebase_uid_123",number:"000123",coinBalance:12};
  const earlier={uid:card.uid,id:"event-1",type:"credit",count:15,balance:15,
    reason:"event",createdAt:"2026-10-01T20:00:00Z"};
  const later={uid:card.uid,id:"event-2",type:"debit",count:3,balance:12,
    reason:"redeem",createdAt:"2026-10-02T20:00:00Z"};
  const run=(cards,history,extra=[])=>{
    fs.writeFileSync(input,JSON.stringify({cards,history}));
    return spawnSync(process.execPath,[tool,"--offline","--input",input,...extra],{
      encoding:"utf8",env:{...process.env,GOOGLE_APPLICATION_CREDENTIALS:"/does-not-exist"}
    });
  };
  try{
    const good=run([card],[earlier,later]);
    assert.equal(good.status,0,good.stderr);
    const report=JSON.parse(good.stdout);
    assert.equal(report.audit,"LOCAL_FORMAT_ONLY");
    assert.equal(report.wallets,1);
    assert.equal(report.operations,2);
    assert.equal(report.totalCoinBalance,"12");
    assert.equal(report.firebaseIdentityVerified,false);
    assert.equal(report.actualSourceReconciled,false);
    assert.equal(report.firebaseWrites,0);
    assert.match(report.exportSha256,/^[0-9a-f]{64}$/);
    assert.notEqual(run([],[]).status,0,"empty export cannot count as a successful audit");
    assert.notEqual(run([card,card],[earlier,later]).status,0,"duplicate card must fail");
    assert.notEqual(run([card],[later,earlier]).status,0,"nonchronological history must fail");
    assert.notEqual(run([card],[{...earlier,balance:16},later]).status,0,
      "intermediate balance mismatch must fail even when the final balance matches");
    assert.notEqual(run([card],[{...earlier,count:20},later]).status,0,
      "a credit with impossible negative opening balance must fail");
    assert.notEqual(run([card],[{...earlier,type:"transfer-out"}, {...later,type:"transfer-in"}]).status,0,
      "inconsistent transfer signs must fail ledger arithmetic checks");
    assert.equal(run([card],[{...earlier,type:"transfer-in"}, {...later,type:"transfer-out",count:3}]).status,0,
      "balanced transfer-in and transfer-out history must pass");
    const importWithoutVerifiedDigest=spawnSync(process.execPath,[tool,"--apply","--input",input,
      "--confirm","FIREBASE_COIN_IMPORT","--project","bali-menu-5a48b"],{
        encoding:"utf8",env:{...process.env,GOOGLE_APPLICATION_CREDENTIALS:"/does-not-exist"}
      });
    assert.notEqual(importWithoutVerifiedDigest.status,0,
      "production import without the reviewed export hash must fail before accessing Firebase");
    assert.notEqual(run([{...card,coinBalance:8}],[earlier,later]).status,0,
      "final history and balance mismatch must fail");
    assert.notEqual(run([card],[earlier,later],["--apply","--confirm","FIREBASE_COIN_IMPORT"]).status,0,
      "offline mode must never write");
  }finally{fs.rmSync(temp,{recursive:true,force:true})}
});
