import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
import vm from "node:vm";
const source=readFileSync("cloudflare-pages/functions/api/bali-v3.js","utf8")
  .replace(/export async function /g,"async function ")+"\nthis.api={onRequestPost,onRequestGet};";
let requests=[],siteverify={success:true,hostname:"baliminsk.by",action:"guest_preorder"};
const context={URL,Response,Headers,URLSearchParams,JSON,Set,Error,console,
  fetch:async(url,opts)=>{
    requests.push({url:String(url),body:String(opts?.body||"")});
    if(String(url).includes("siteverify"))
      return {ok:true,json:async()=>siteverify};
    return {ok:true,json:async()=>({ok:true,data:{order:{id:"o_guest",orderNumber:1}}})};
  }};
vm.createContext(context);
vm.runInContext(source,context,{filename:"cloudflare-pages/functions/api/bali-v3.js"});
const env={SHEETS_SCRIPT_URL:"https://script.google.com/macros/s/test/exec",
  BALI_BRIDGE_KEY:"test-secret",BALI_GUEST_TURNSTILE_SECRET:"turnstile-test-secret"};
async function submit(action,payload,token="",challenge="valid-guest-challenge",origin="https://baliminsk.by"){
 const request=new Request("https://baliminsk.by/api/bali-v3",{method:"POST",headers:{
  "Content-Type":"application/json",Origin:origin},body:JSON.stringify({action,payload,token,turnstileToken:challenge})});
 const response=await context.api.onRequestPost({request,env});
 return {status:response.status,body:await response.json()};
}
const payload={requestId:"guest_request_1234567890",guestVerified:true,
  customerName:"Гость",customerPhone:"+375291234567",
  privacyConsent:true,internationalConsent:true,
  eventDate:"2026-10-30",eventId:"2026-10-30",tableNumber:"12",
  items:[{id:101,quantity:1}]};
let response=await submit("guestCreateOrder",payload);
assert.equal(response.status,503,"Missing D1 must reject the order, not fall back to Sheets");
assert.equal(response.body.error.code,"unavailable");
assert.equal(requests.length,1,"Only Turnstile siteverify may run");
assert(requests[0].url.includes("siteverify"));
const fakeD1={prepare:()=>({first:async()=>({status:"pending"})})};
env.BALI_OPERATIONS_DB=fakeD1;
requests=[];
response=await submit("guestCreateOrder",payload);
assert.equal(response.status,503,"Pending migration must never write to Sheets");
assert.equal(response.body.error.code,"preorder-cutover-not-ready");
assert.equal(requests.length,1,"No legacy order destination under a failed cutover");
delete env.BALI_OPERATIONS_DB;
requests=[];
response=await submit("guestCreateOrder",payload,"","");
assert.equal(response.status,400);
assert.equal(response.body.error.code,"turnstile-required");
assert.equal(requests.length,0);
siteverify={success:true,hostname:"other.example",action:"guest_preorder"};
requests=[];
response=await submit("guestCreateOrder",payload);
assert.equal(response.status,403);
assert.equal(response.body.error.code,"turnstile-invalid");
assert.equal(requests.length,1);
siteverify={success:true,hostname:"baliminsk.by",action:"different_action"};
response=await submit("guestCreateOrder",payload);
assert.equal(response.status,403);
siteverify={success:true,hostname:"baliminsk.by",action:"guest_preorder"};
response=await submit("guestCreateOrder",{...payload,privacyConsent:false});
assert.equal(response.status,400);
assert.equal(response.body.error.code,"consent-required");
response=await submit("myOrders",{}, "");
assert.equal(response.status,401);
response=await submit("card",{}, "x".repeat(60), "", "https://evil.example");
assert.equal(response.status,403);
response=await submit("guestCreateOrder",{...payload,requestId:"!"});
assert.equal(response.status,400);
console.log("BALI guest checkout: Turnstile verified server-side, D1-only fail-closed routing, required consent and origin protections PASS");
