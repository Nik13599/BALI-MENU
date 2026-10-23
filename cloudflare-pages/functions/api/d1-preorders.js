import {authorizeStaff,handlerError} from "../_lib/staff-auth.js";
import {output,abort,catalog,checkEvent,priceLines,validatedCustomer,
  getOrders,lookup,createOrder,millis,toError} from "../_lib/d1-preorders.js";
import {onRequestPost as setStatus} from "./staff-preorder-status.js";
/* Existing Staff controls send the old action names, but the only store is
 * D1. The server checks a live Firebase role for every action. Nothing in
 * this route trusts a client-supplied UID, total, price, serial or actor.
 */
const validKey=x=>typeof x==="string"&&/^[a-f0-9]{32}$/.test(x);
const validId=x=>typeof x==="string"&&/^[a-zA-Z0-9_-]{8,128}$/.test(x);
const withDate=(date)=>{if(!/^\d{4}-\d{2}-\d{2}$/.test(String(date||"")))
  throw abort("invalid-argument","Неверная дата.");return date;};
const json=data=>output({ok:true,data});
function parseRequest(body){
  if(!body||typeof body!=="object"||Array.isArray(body)||
      typeof body.action!=="string"||
      !["staffRecentOrders","staffOrders","menu","staffStatus",
        "staffCreateOrder","staffEditOrder","staffArchiveOrder",
        "staffDeleteOrder"].includes(body.action))
    throw abort("invalid-argument","Недопустимое действие.");
  if(typeof body.token!=="string"||body.token.length<100||body.token.length>5000)
    throw abort("unauthenticated","Сеанс сотрудника завершился.",401);
  if(body.payload!==undefined&&(!body.payload||typeof body.payload!=="object"||Array.isArray(body.payload)))
    throw abort("invalid-argument","Неверные данные запроса.");
  return {action:body.action,payload:body.payload||{},token:body.token};
}
async function updateOrder(db,actor,p,catalogue){
  const id=String(p.id||"");
  if(!validId(id))throw abort("invalid-argument","Неверный идентификатор заказа.");
  const old=await lookup(db,id);
  if(!old)throw abort("not-found","Заказ не найден.",404);
  if(old.archived)throw abort("failed-precondition","Заказ находится в архиве.",409);
  const expected=millis(p.expectedUpdatedAt);
  if(Date.parse(old.updatedAt)!==expected)
    throw abort("failed-precondition","Этот заказ изменён. Обновите карточку.",409);
  const date=withDate(p.eventDate);
  const eventId=String(p.eventId||"");
  const moving=old.eventId!==eventId||old.eventDate!==date;
  const event=moving?checkEvent(catalogue.events,eventId,date):
    {title:old.eventTitle};
  const customer=validatedCustomer(p);
  const {lines}=priceLines(catalogue.menu,p.items);
  const status=p.status;
  if(!["pending","confirmed","cancelled"].includes(status))
    throw abort("invalid-argument","Неверный статус.");
  const now=Math.max(Date.now(),expected+1),steps=[];
  if(moving){
    steps.push(db.prepare(
      "INSERT INTO preorder_counters(event_id,event_date,last_number,updated_at_ms) "+
      "SELECT ?,?,1,? WHERE EXISTS(SELECT 1 FROM preorder_orders WHERE id=? AND updated_at_ms=?) "+
      "ON CONFLICT(event_id) DO UPDATE SET last_number=last_number+1,updated_at_ms=excluded.updated_at_ms"
    ).bind(eventId,date,now,id,expected));
  }
  const q="UPDATE preorder_orders SET event_id=?,event_date=?,event_title=?,"+
    "order_number="+(moving?"(SELECT last_number FROM preorder_counters WHERE event_id=?)":"order_number")+
    ",customer_name=?,customer_phone=?,table_number=?,booking_id=?,notes=?,status=?,updated_at_ms=?"+
    " WHERE id=? AND updated_at_ms=? AND archived_at_ms IS NULL";
  steps.push(db.prepare(q).bind(eventId,date,event.title,
    ...(moving?[eventId]:[]),
    customer.name,customer.phone,customer.table,customer.booking,customer.notes,
    status,now,id,expected));
  steps.push(db.prepare(
    "DELETE FROM preorder_items WHERE order_id=? AND EXISTS("+
    "SELECT 1 FROM preorder_orders WHERE id=? AND updated_at_ms=?)"
  ).bind(id,id,now));
  for(const line of lines)steps.push(db.prepare(
    "INSERT INTO preorder_items(order_id,menu_id,item_name,unit_price_minor,quantity) "+
    "SELECT ?,?,?,?,? WHERE EXISTS(SELECT 1 FROM preorder_orders WHERE id=? AND updated_at_ms=?)"
  ).bind(id,line.id,line.name,line.minor,line.quantity,id,now));
  steps.push(db.prepare(
    "INSERT INTO preorder_audit(order_id,actor_uid,action,created_at_ms,details) "+
    "SELECT ?,?,?,?,? WHERE EXISTS(SELECT 1 FROM preorder_orders WHERE id=? AND updated_at_ms=?)"
  ).bind(id,actor.uid,"staff-edit",now,JSON.stringify({moved:moving}),id,now));
  const writes=await db.batch(steps);
  const idx=moving?1:0;
  if(Number(writes?.[idx]?.meta?.changes)!==1)
    throw abort("failed-precondition","Данные заказа изменились. Обновите карточку.",409);
  return lookup(db,id);
}
export async function onRequestPost({request,env,waitUntil}){
  try{
    const origin=request.headers.get("Origin");
    if(origin&&origin!==new URL(request.url).origin)
      return output({ok:false,error:{code:"origin",message:"Недопустимый источник."}},403);
    const raw=await request.text();
    if(raw.length>30000)throw abort("invalid-argument","Слишком большой запрос.",413);
    let body;try{body=JSON.parse(raw)}catch{throw abort("invalid-argument","Неверный JSON.");}
    const {action,payload:p,token}=parseRequest(body);
    const signed=new Request(request.url,{headers:{Authorization:"Bearer "+token}});
    const actor=await authorizeStaff(signed,{
      adminOnly:action==="staffDeleteOrder",env
    });
    const db=env?.BALI_OPERATIONS_DB;
    if(!db)throw abort("unavailable","D1 недоступна.",503);
    const state=await db.prepare("SELECT status FROM migration_state WHERE id='preorders'").first();
    if(state?.status!=="complete")
      throw abort("failed-precondition","Перенос заказов ещё не активирован.",409);
    if(action==="staffRecentOrders")
      return json({orders:await getOrders(db,{limit:100}),
        canEditOrders:true,canCreateOrders:true});
    if(action==="staffOrders")
      return json({orders:await getOrders(db,{
        date:p.date?withDate(p.date):"",
        eventId:String(p.eventId||""),limit:500
      })});
    if(action==="menu"){
      const {menu,events}=await catalog(env);
      return json({menu:menu.filter(x=>x.available===true).map(x=>({
        id:Number(x.id),name:x.name,price:x.price,category:x.category
      })),events:events.map(x=>({
        id:x.id,date:x.date,title:x.title,closesAt:x.closesAt,
        preorderEnabled:x.preorderEnabled
      }))});
    }
    if(action==="staffStatus"){
      const id=String(p.id||""),status=String(p.status||"");
      if(!validId(id)||!["pending","confirmed","cancelled"].includes(status)||
        !validKey(p.requestId))throw abort("invalid-argument","Неверный запрос изменения статуса.");
      const old=await lookup(db,id);
      if(!old)throw abort("not-found","Заказ не найден.",404);
      const result=await setStatus({request:new Request(request.url,{
        method:"POST",headers:{
          "Authorization":"Bearer "+token,"Origin":new URL(request.url).origin,
          "Content-Type":"application/json"
        },
        body:JSON.stringify({id,status,requestId:p.requestId,
          expectedUpdatedAtMs:millis(p.expectedUpdatedAt)})
      }),env});
      const response=await result.json();
      if(!result.ok)throw abort(response.error||"failed-precondition","Не удалось подтвердить статус.",result.status);
      return json({result:{
        id,status,updatedAt:new Date(response.updatedAtMs).toISOString(),
        alreadyApplied:response.alreadyApplied===true
      }});
    }
    if(action==="staffCreateOrder"){
      if(!validKey(p.requestId))throw abort("invalid-argument","Неверный идентификатор запроса.");
      const {events,menu}=await catalog(env);
      const event=checkEvent(events,p.eventId,withDate(p.eventDate));
      const customer=validatedCustomer(p);
      const {lines}=priceLines(menu,p.items);
      const status=["pending","confirmed"].includes(p.status)?p.status:"pending";
      const order=await createOrder(db,{
        id:"o_"+p.requestId,eventId:event.id,eventDate:event.date,eventTitle:event.title,
        customer,lines,status,staffUid:actor.uid
      });
      if(!order.alreadyCreated){
        const {notifyNewStaffOrder}=await import("../_lib/staff-web-push.js");
        waitUntil?.(notifyNewStaffOrder(env,order).catch(e=>
          console.error("BALI Staff push dispatch failed",String(e?.message||"unknown").slice(0,80))));
      }
      return json({order});
    }
    if(action==="staffEditOrder"){
      const source=await catalog(env);
      const order=await updateOrder(db,actor,p,source);
      return json({order});
    }
    if(action==="staffArchiveOrder"){
      if(!validId(p.id))throw abort("invalid-argument","Неверный ID.");
      const now=Date.now();
      const archived=p.archived===true;
      await db.prepare("UPDATE preorder_orders SET archived_at_ms=?,status=CASE WHEN ? THEN 'cancelled' ELSE status END,updated_at_ms=? WHERE id=?")
        .bind(archived?now:null,archived?1:0,now,p.id).run();
      return json({order:await lookup(db,p.id)});
    }
    if(action==="staffDeleteOrder"){
      if(!validId(p.id))throw abort("invalid-argument","Неверный ID.");
      await db.prepare("DELETE FROM preorder_orders WHERE id=?").bind(p.id).run();
      return json({deleted:true,id:p.id});
    }
    throw abort("invalid-argument","Неизвестная команда.");
  }catch(error){return toError(error)}
}
export async function onRequestGet(){return output({ok:false,error:{code:"method-not-allowed"}},405)}
