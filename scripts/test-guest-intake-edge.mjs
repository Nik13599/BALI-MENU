import assert from "node:assert/strict";
import {readFile} from "node:fs/promises";
const moduleFrom=code=>"data:text/javascript;base64,"+Buffer.from(code).toString("base64");
const guestCode=await readFile("cloudflare-pages/functions/api/guest-preorders.js","utf8");
const staffCode=await readFile("cloudflare-pages/functions/api/staff-guest-preorders.js","utf8");
const {onRequestPost:submit}=await import(moduleFrom(guestCode));
const authStub=moduleFrom(`
export async function authorizeStaff(request){
 if(request.headers.get("Authorization")!=="Bearer staff-test")
  throw Object.assign(Error("denied"),{status:403});
 return {uid:"staff-test"};
}
export const errorJson=(status,error)=>new Response(JSON.stringify({error}),{status});
export const handlerError=e=>errorJson(e.status===403?403:503,"access-denied");
`);
const staffSource=staffCode.replace('from "../_lib/staff-auth.js"',
  'from "'+authStub+'"');
const {onRequestGet:staffRead,onRequestPatch:staffEdit}=await import(moduleFrom(staffSource));
const now=Date.now();
const fsDoc=(name,fields)=>({name:"projects/demo/databases/(default)/documents/"+name,fields});
const snapshot=(docs)=>({cachedAt:Date.now(),documents:docs});
const event=fsDoc("events/2099-10-24",{
 date:{stringValue:"2099-10-24"},title:{stringValue:"BALI TEST"},
 preorderEnabled:{booleanValue:true},closesAt:{timestampValue:"2099-10-24T20:00:00Z"}
});
const menu=fsDoc("menu/1",{
 id:{integerValue:"1"},name:{stringValue:"Закуска"},
 price:{doubleValue:10.15},available:{booleanValue:true}
});
const publicKV=new Map([
 ["bali:public:v1:events",snapshot([event])],
 ["bali:public:v1:menu",snapshot([menu])]
]);
const stored=new Map();let putCount=0,siteChecks=0;
const env={
 BALI_PUBLIC_CONTENT:{get:async k=>publicKV.get(k)||null},
 BALI_GUEST_PREORDERS:{
  get:async k=>stored.get(k)||null,
  put:async(k,v)=>{putCount++;stored.set(k,JSON.parse(v))},
  list:async()=>({list_complete:true,keys:[...stored.keys()].map(name=>({name}))})
 },
 BALI_GUEST_TURNSTILE_SECRET:"test-secret"
};
globalThis.fetch=async (url,params)=>{
 assert(String(url).includes("turnstile/v0/siteverify"),"No Firebase/D1 request");
 siteChecks++;
 const p=params.body;
 assert.equal(p.get("secret"),"test-secret");
 return new Response(JSON.stringify({success:true,hostname:"baliminsk.by",action:"guest-preorder"}));
};
const requestId="550e8400-e29b-41d4-a716-446655440000";
const payload={request_id:requestId,customer_name:"Тестовый гость",
 customer_phone:"+375291234567",event_date:"2099-10-24",event_id:"2099-10-24",
 table_number:"12",booking_id:"",notes:"",items:[{id:1,quantity:2}],
 turnstile_token:"test-valid-token-long-enough",privacy_accepted:true};
const url="https://baliminsk.by/api/guest-preorders";
const ask=(body,origin="https://baliminsk.by")=>submit({request:new Request(url,{
 method:"POST",headers:{"Content-Type":"application/json",
   Origin:origin,"CF-Connecting-IP":"192.0.2.3"},
 body:JSON.stringify(body)
}),env});
const denied=await ask(payload,"https://untrusted.invalid");
assert.equal(denied.status,403);
const bad=await ask({...payload,customer_name:"A"});
assert.equal(bad.status,400);
const valid=await ask(payload);
assert.equal(valid.status,200);
const saved=await valid.json();
assert.equal(saved.success,true);
assert.equal(saved.order_number,"G-550E8400");
assert.equal(putCount,1);
const data=stored.get("guest:order:"+requestId);
assert.equal(data.email,"");
assert.equal(data.customerPhone,payload.customer_phone);
assert.equal(data.totalMinor,2030);
assert.equal(data.items.length,1);
assert.equal(siteChecks,1);
const duplicate=await ask(payload);
assert.equal(duplicate.status,200);
assert.equal(putCount,1);
assert.equal(siteChecks,1,"Idempotent browser retry needs no second challenge");
const forbidden=await staffRead({request:new Request("https://baliminsk.by/api/staff-guest-preorders"),env});
assert.equal(forbidden.status,403);
const authenticated=new Request("https://baliminsk.by/api/staff-guest-preorders?date=2099-10-24",{
 headers:{Authorization:"Bearer staff-test"}});
const inbox=await staffRead({request:authenticated,env});
assert.equal(inbox.status,200);
assert.equal((await inbox.json()).orders.length,1);
const changed=await staffEdit({request:new Request(
 "https://baliminsk.by/api/staff-guest-preorders",{
 method:"PATCH",headers:{Authorization:"Bearer staff-test",
 Origin:"https://baliminsk.by","Content-Type":"application/json"},
 body:JSON.stringify({requestId,status:"confirmed"})
}),env});
assert.equal(changed.status,200);
assert.equal(stored.get("guest:order:"+requestId).status,"confirmed");
assert.equal(siteChecks,1);
console.log("BALI no-account checkout: Turnstile, mandatory identity, private KV, idempotency, staff-only GET/PATCH, exact price PASS.");
