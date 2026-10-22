import {authorizeStaff,handlerError,errorJson} from "../_lib/staff-auth.js";
/* BALI STAFF: protected, read-only access to guest requests in Cloudflare KV.
 * Never fetches Firebase order documents. Each request is stored separately.
 */
const json=(value,status=200)=>new Response(JSON.stringify(value),{status,headers:{
  "Content-Type":"application/json; charset=utf-8","Cache-Control":"no-store",
  "X-Content-Type-Options":"nosniff","Vary":"Authorization"}});
const idOk=id=>typeof id==="string"&&/^[a-f0-9-]{36}$/.test(id)&&
  /^[a-f0-9]{8}-[a-f0-9]{4}-[1-8][a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/.test(id);
async function listOrders(kv,options){
  const {date,eventId}=options;
  const rows=[];let cursor=undefined,truncated=false,rounds=0;
  do{
    if(++rounds>8){truncated=true;break;}
    const batch=await kv.list({prefix:"guest:order:",limit:1000,...(cursor?{cursor}:{})});
    if(!batch||!Array.isArray(batch.keys))throw Error("private-inbox-unavailable");
    for(let offset=0;offset<batch.keys.length;offset+=25){
      const chunk=batch.keys.slice(offset,offset+25);
      const found=await Promise.all(chunk.map(k=>kv.get(k.name,"json")));
      for(const row of found){
        if(!row||row.source!=="guest-kv"||!Array.isArray(row.items))continue;
        if(date&&row.eventDate!==date)continue;
        if(eventId&&row.eventId!==eventId)continue;
        rows.push(row);
      }
    }
    cursor=batch.list_complete?undefined:batch.cursor;
  }while(cursor);
  rows.sort((a,b)=>(b.createdAtMs||0)-(a.createdAtMs||0));
  return {rows,truncated};
}
export async function onRequestGet({request,env}){
  try{
    await authorizeStaff(request);
    if(!env?.BALI_GUEST_PREORDERS)return errorJson(503,"private-inbox-unavailable");
    const url=new URL(request.url),date=url.searchParams.get("date")||"";
    const eventId=url.searchParams.get("event")||"";
    if(date&&!/^\d{4}-\d{2}-\d{2}$/.test(date))return errorJson(400,"invalid-date");
    if(eventId&&!/^\d{4}-\d{2}-\d{2}(?:__(?:2|3))?$/.test(eventId))
      return errorJson(400,"invalid-event");
    const result=await listOrders(env.BALI_GUEST_PREORDERS,{date,eventId});
    if(result.truncated)return json({error:"inbox-scan-too-large",complete:false},503);
    return json({orders:result.rows,complete:true,source:"guest-kv"});
  }catch(e){return handlerError(e);}
}
export async function onRequestPatch({request,env}){
  try{
    const actor=await authorizeStaff(request);
    if(!env?.BALI_GUEST_PREORDERS)return errorJson(503,"private-inbox-unavailable");
    if(request.headers.get("Origin")!==new URL(request.url).origin)
      return errorJson(403,"invalid-origin");
    const data=await request.json().catch(()=>null);
    if(!idOk(data?.requestId)||!["pending","confirmed","cancelled"].includes(data.status))
      return errorJson(400,"invalid-update");
    const key="guest:order:"+data.requestId;
    const order=await env.BALI_GUEST_PREORDERS.get(key,"json");
    if(!order||order.requestId!==data.requestId||order.source!=="guest-kv")
      return errorJson(404,"guest-order-not-found");
    if(order.status!==data.status){
      order.status=data.status;
      order.updatedAtMs=Date.now();
      order.statusChangedBy=actor.uid;
      const expiry=Math.floor(Number(order.createdAtMs||0)/1000)+30*86400;
      if(expiry<=Math.floor(Date.now()/1000))return errorJson(410,"guest-order-expired");
      await env.BALI_GUEST_PREORDERS.put(key,JSON.stringify(order),{expiration:expiry});
    }
    return json({ok:true,id:order.id,status:order.status});
  }catch(e){return handlerError(e);}
}
export async function onRequestPost(){return errorJson(405,"method-not-allowed");}
