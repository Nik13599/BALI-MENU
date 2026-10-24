"use strict";
// Offline release contract: every registered BRSM/COIN callable must be deployed.
const test=require("node:test"),assert=require("node:assert/strict"),fs=require("node:fs"),path=require("node:path");
const read=file=>fs.readFileSync(path.join(__dirname,"..",file),"utf8");
const modules=["brsm","brsm-campaigns","bali-coin"];
const required=modules.flatMap(name=>[...read("functions/"+name+".js").matchAll(/\bapi\("([A-Za-z0-9]+)"/g)].map(m=>m[1]));
const workflow=read(".github/workflows/bali-coin-brsm-pilot-release.yml");
function verify(source){
  const deployed=[...source.matchAll(/functions:bali-id:([A-Za-z0-9]+)/g)].map(m=>m[1]);
  assert.ok(required.length>0,"No backend callables discovered");
  assert.deepEqual([...new Set(deployed)].sort(),[...new Set(required)].sort(),"Release must include all BRSM membership, CONTACT, campaigns and COIN callables, without unrelated exports");
  assert.equal(deployed.length,new Set(deployed).size,"Do not deploy a callable twice");
}
test("protected release covers the full BRSM and COIN backend",()=>verify(workflow));
test("release contract catches missing promo activation",()=>{
  assert.throws(()=>verify(workflow.replace("functions:bali-id:activateBrsmPromo","")),/Release must include/);
});
test("release contract rejects unrelated function deployment",()=>{
  assert.throws(()=>verify(workflow+" functions:bali-id:submitBaliPreorder"),/Release must include/);
});
test("guest and admin callable names resolve to the released backend",()=>{
  for(const file of ["brsm-admin.js","brsm-campaign-admin.js","brsm-card.js","bali-coin-firebase-api.js"]){
    const names=[...read(file).matchAll(/"([A-Za-z]+Brsm[A-Za-z]*|coin[A-Z][A-Za-z]*)"/g)].map(m=>m[1]);
    assert.ok(names.length>0,"No client callable names found in "+file);
    for(const name of names)assert.ok(required.includes(name),file+" calls an unregistered operation: "+name);
  }
});
