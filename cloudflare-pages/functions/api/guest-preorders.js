/* BALI: guest preorder -> protected staff inbox, NEVER Firestore or D1.
 * Requires Turnstile human verification. Every request stored under its own
 * expiring KV key to avoid shared-array lost updates. The guest gets only a
 * random request reference; private contact details are staff-only.
 */
const EVENT_KEY="bali:public:v1:events",MENU_KEY="bali:public:v1:menu";
const TTL=30*24*60*60;
const SITEKEY="0x4AAAAAAFgaCfqEqtblIfyT";
const send=(data,status=200)=>new Response(JSON.stringify(data),{status,headers:{
  "Content-Type":"application/json; charset=utf-8","Cache-Control":"no-store",
  "X-Content-Type-Options":"nosniff"}});
const val=(fields,key)=>fields?.[key]?.stringValue??"";
const num=(fields,key)=>Number(fields?.[key]?.integerValue??fields?.[key]?.doubleValue);
const flag=(fields,key)=>fields?.[key]?.booleanValue===true;
const phoneOk=p=>/^\+[1-9][0-9]{7,14}$/.test(p);
const allowedHost=h=>h==="baliminsk.by"||h==="www.baliminsk.by"||
  h==="bali-nightclub-menu.pages.dev"||h.endsWith(".bali-nightclub-menu.pages.dev");
async function siteVerify(token,secret,remoteip){
  const body=new URLSearchParams({secret,response:token,remoteip:remoteip||""});
  const answer=await fetch("https://challenges.cloudflare.com/turnstile/v0/siteverify",{
    method:"POST",headers:{"Content-Type":"application/x-www-form-urlencoded"},
    body,signal:AbortSignal.timeout(7000)
  });
  if(!answer.ok)return false;
  const verified=await answer.json();
  return verified.success===true&&verified.action==="guest-preorder"&&
    allowedHost(verified.hostname||"");
}
async function validatedCatalog(env){
  const [events,menu]=await Promise.all([
    env.BALI_PUBLIC_CONTENT?.get(EVENT_KEY,"json"),
    env.BALI_PUBLIC_CONTENT?.get(MENU_KEY,"json")
  ]);
  if(!Array.isArray(events?.documents)||!Array.isArray(menu?.documents)||
    !Number.isFinite(events.cachedAt)||!Number.isFinite(menu.cachedAt)||
    Date.now()-events.cachedAt>20*60*1000||Date.now()-menu.cachedAt>60*60*1000||
    events.cachedAt>Date.now()||menu.cachedAt>Date.now())
    throw Object.assign(Error("public-content-not-ready"),{status:503});
  return {events:events.documents,menu:menu.documents};
}
function validateInput(x){
  if(!x||typeof x!=="object"||Array.isArray(x))return null;
  const name=String(x.customer_name||"").trim().replace(/\s+/g," ");
  const phone=String(x.customer_phone||"").trim().replace(/[\s()-]/g,"");
  const date=String(x.event_date||""),eventId=String(x.event_id||"");
  const table=String(x.table_number||"").trim(),booking=String(x.booking_id||"").trim();
  const notes=String(x.notes||"").trim();
  const requestId=String(x.request_id||"");
  if(name.length<2||name.length>100||!phoneOk(phone)||!/^\d{4}-\d{2}-\d{2}$/.test(date)||
    ![date,date+"__2",date+"__3"].includes(eventId)||
    table.length>20||booking.length>60||(!table&&!booking)||
    notes.length>500||!/^[-a-f0-9]{36}$/.test(requestId)||
    !Array.isArray(x.items)||x.items.length<1||x.items.length>12||
    x.privacy_accepted!==true)return null;
  const normalized=[],used=new Set();
  for(const item of x.items){
    const id=Number(item?.id),quantity=Number(item?.quantity);
    if(!Number.isSafeInteger(id)||id<=0||used.has(id)||!Number.isInteger(quantity)||
      quantity<1||quantity>50)return null;
    used.add(id);normalized.push({id,quantity});
  }
  return {name,phone,date,eventId,table,booking,notes,items:normalized,requestId};
}
export async function onRequestPost({request,env}){
  try{
    if(!env?.BALI_GUEST_PREORDERS||!env?.BALI_PUBLIC_CONTENT||
       !env?.BALI_GUEST_TURNSTILE_SECRET)return send({error:"guest-intake-unavailable"},503);
    const origin=request.headers.get("Origin");
    if(!origin||origin!==new URL(request.url).origin)return send({error:"invalid-origin"},403);
    if(Number(request.headers.get("Content-Length")||0)>6500)return send({error:"request-too-large"},413);
    const raw=await request.text();
    if(raw.length>6500)return send({error:"request-too-large"},413);
    let body;
    try{body=JSON.parse(raw);}catch{return send({error:"invalid-request"},400);}
    const data=validateInput(body);
    if(!data||body.website)return send({error:"invalid-order-or-contact"},400);
    const key="guest:order:"+data.requestId;
    // The same browser can safely retry after losing the success response.
    const previous=await env.BALI_GUEST_PREORDERS.get(key,"json");
    if(previous&&previous.eventId===data.eventId&&previous.customerPhone===data.phone)
      return send({success:true,order_id:previous.id,event_title:previous.eventTitle,
        order_number:previous.id,table_number:previous.tableNumber,
        booking_id:previous.bookingId,queued:true});
    const cfIp=request.headers.get("CF-Connecting-IP");
    if(!cfIp)return send({error:"client-verification-unavailable"},503);
    const token=String(body.turnstile_token||"");
    if(token.length<20||token.length>2500||
      !await siteVerify(token,env.BALI_GUEST_TURNSTILE_SECRET,cfIp))
      return send({error:"human-verification-required"},403);
    const {events,menu}=await validatedCatalog(env);
    const event=events.find(doc=>doc.name?.split("/").at(-1)===data.eventId);
    const fields=event?.fields||{};
    if(!event||val(fields,"date")!==data.date||!flag(fields,"preorderEnabled")||
      !val(fields,"title")||new Date(fields.closesAt?.timestampValue||0).getTime()<=Date.now())
      return send({error:"event-closed"},409);
    const priced=[],byId=new Map(menu.map(doc=>[String(doc.name?.split("/").at(-1)),doc]));
    for(const row of data.items){
      const product=byId.get(String(row.id));const f=product?.fields||{};
      const price=num(f,"price"),label=val(f,"name");
      if(!product||!flag(f,"available")||!label||label.length>200||
        !Number.isFinite(price)||price<0||price>99999)
        return send({error:"menu-item-unavailable"},409);
      priced.push({id:row.id,name:label,quantity:row.quantity,
        unitPrice:Math.round(price*100)/100});
    }
    const now=Date.now();
    const order={
      id:"G-"+data.requestId.slice(0,8).toUpperCase(),requestId:data.requestId,
      eventId:data.eventId,eventDate:data.date,eventTitle:val(fields,"title"),
      customerName:data.name,customerPhone:data.phone,email:"",
      tableNumber:data.table,bookingId:data.booking,notes:data.notes,
      source:"guest-kv",ownerUid:"",status:"pending",archived:false,
      items:priced,createdAtMs:now,updatedAtMs:now,
      createdAt:{seconds:Math.floor(now/1000)},
      totalMinor:priced.reduce((sum,x)=>sum+Math.round(x.unitPrice*100)*x.quantity,0)
    };
    await env.BALI_GUEST_PREORDERS.put(key,JSON.stringify(order),{expirationTtl:TTL});
    return send({success:true,order_id:order.id,order_number:order.id,
      event_title:order.eventTitle,table_number:order.tableNumber,
      booking_id:order.bookingId,queued:true});
  }catch(_e){return send({error:"guest-intake-unavailable"},503);}
}
export async function onRequestGet(){return send({error:"method-not-allowed"},405);}
