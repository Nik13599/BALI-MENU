/* Production-safe smoke test: READS + DENIED calls only.
 * NEVER creates, edits, confirms, cancels or deletes any actual order.
 * Tests canonical HTTPS, D1 client flag, public catalogue, and Staff ACL.
 */
import assert from "node:assert/strict";
const origin="https://baliminsk.by";
const fetchSafe=async(path,options={})=>{
  let last;
  for(let attempt=0;attempt<2;attempt++){
    try{
      const response=await fetch(origin+path,{
        ...options,signal:AbortSignal.timeout(18000),
        redirect:"follow",cache:"no-store"
      });
      if(response.status>=500&&attempt===0){last=Error("HTTP "+response.status);continue;}
      return response;
    }catch(e){last=e;}
  }
  throw Error("Production smoke request unavailable: "+String(last?.message||last));
};
const config=await fetchSafe("/bali-sheets-config.js");
assert.equal(config.status,200,"Live site must serve preorder configuration");
const flags=await config.text();
assert.match(flags,/BALI_D1_PREORDERS_ENABLED\s*=\s*true/,
  "Guests and Staff must use the same D1 cutover flag");
assert.match(flags,/BALI_SHEETS_API_ENABLED\s*=\s*false/,
  "Legacy Google Sheets write path must remain disabled");
const page=await fetchSafe("/preorders.html");
assert.equal(page.status,200,"BALI Staff must be reachable");
const html=await page.text();
assert.match(html,/preorders-workspace\.css/,
  "Desktop and mobile Staff must preserve their existing stylesheet");
const bundle=await fetchSafe("/api/public-bundle");
assert.equal(bundle.status,200,"Menu and events should load through the unified public API");
const publicData=await bundle.json();
assert(Array.isArray(publicData?.sources?.menu)&&publicData.sources.menu.length>0,
  "Published menu must contain available items");
assert(Array.isArray(publicData?.sources?.events)&&publicData.sources.events.length>0,
  "Published calendar must contain event data");
const send=async body=>{
  const response=await fetchSafe("/api/bali-v3",{
    method:"POST",headers:{"Content-Type":"application/json","Origin":origin},
    body:JSON.stringify(body)
  });
  let json;try{json=await response.json()}catch{json=null;}
  return {status:response.status,body:json};
};
for(const action of ["staffRecentOrders","staffOrders","staffStatus","staffCreateOrder",
  "staffDeleteOrder","myOrders","createOrder"]){
  const {status,body}=await send({action,payload:{}});
  assert.equal(status,401,action+" must reject anonymous access");
  assert.equal(body?.ok,false,action+" must not return a success payload");
}
const guest=await send({action:"guestCreateOrder",payload:{
 eventDate:"2099-10-23",eventId:"fake-event",
 requestId:"abcdef123456abcdef123456abcdef12",
 privacyConsent:true,internationalConsent:true,
 customerName:"TEST",customerPhone:"+375291234567",
 tableNumber:"1",items:[{id:101,quantity:1}]
}});
assert.equal(guest.status,400,"Turnstile must block guest writes without a verified challenge");
assert.equal(guest.body?.error?.code,"turnstile-required");
console.log("BALI PRODUCTION SMOKE PASS: HTTPS, D1 enabled, Sheets disabled, menu/events, Staff ACL (7), Turnstile, zero writes");
