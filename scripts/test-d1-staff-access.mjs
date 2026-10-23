import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
const src=readFileSync("cloudflare-pages/functions/_lib/staff-auth.js","utf8");
const auth=await import("data:text/javascript;base64,"+Buffer.from(src).toString("base64"));
const uid="PpentrythOSBDg9ShRmiucXfK7G3";
const email="staff+staff01@staff.baliminsk.by";
const token="T".repeat(128);
let profile={localId:uid,email,emailVerified:true,disabled:false};
let firestoreAdmin="missing",firestoreStaff="missing",grant={role:"preorders",active:1},queries=0;
const reply=(data,status=200)=>new Response(JSON.stringify(data),{status,headers:{"Content-Type":"application/json"}});
globalThis.fetch=async(url)=>{
  url=String(url);
  if(url.includes("/v1/accounts:lookup"))return reply({users:[profile]});
  if(url.includes("/documents/admins/")){
    if(firestoreAdmin==="missing")return reply({},404);
    if(firestoreAdmin==="forbidden")return reply({},403);
    return reply({fields:{active:{booleanValue:firestoreAdmin==="active"}}});
  }
  if(url.includes("/documents/preorderStaff/")){
    if(firestoreStaff==="missing")return reply({},404);
    if(firestoreStaff==="forbidden")return reply({},403);
    return reply({fields:{active:{booleanValue:firestoreStaff==="active"},
      role:{stringValue:"preorders"}}});
  }
  throw Error("Unexpected upstream: "+url);
};
const env={BALI_OPERATIONS_DB:{prepare(sql){
  assert.match(sql,/FROM preorder_staff_access WHERE uid=\\? AND email=\\?/);
  return {bind(target,addr){return {async first(){
    queries++;
    return target===uid&&addr===email?grant:null;
  }}}};
}}};
const request=new Request("https://baliminsk.by/api/bali-v3",
  {headers:{Authorization:"Bearer "+token}});
const expectFailure=async(status,options={env})=>{
  await assert.rejects(auth.authorizeStaff(request,options),e=>e.status===status);
};
let user=await auth.authorizeStaff(request,{env});
assert.deepEqual(user,{uid,role:"staff"},"Existing Firebase identity + active D1 grant");
assert.equal(queries,1);
await expectFailure(403,{adminOnly:true,env});
grant={role:"preorders",active:0};await expectFailure(403);
grant=null;await expectFailure(403);
grant={role:"preorders",active:1};
firestoreStaff="inactive";await expectFailure(403);
firestoreStaff="forbidden";await expectFailure(503);
firestoreStaff="active";user=await auth.authorizeStaff(request,{});
assert.equal(user.role,"staff","Existing authorized Firestore staff remains supported");
firestoreStaff="missing";
firestoreAdmin="active";user=await auth.authorizeStaff(request,{adminOnly:true});
assert.equal(user.role,"admin","Existing Firebase administrator remains supported");
firestoreAdmin="missing";
profile={...profile,email:"different@example.com"};await expectFailure(403);
profile={...profile,email,emailVerified:false};await expectFailure(401);
profile={...profile,emailVerified:true,disabled:true};await expectFailure(401);
profile={...profile,disabled:false};
await expectFailure(503,{});
console.log("BALI Staff auth: Firebase identity, D1 grant, revocation, admin-only and fail-closed PASS");
