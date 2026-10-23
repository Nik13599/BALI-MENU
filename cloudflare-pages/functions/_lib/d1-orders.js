/*
 * BALI D1 orders service. The same backend serves:
 *   1. guests with Turnstile, 2. logged-in guests,
 *   3. authorized Staff (same existing UI).
 * No direct browser D1 access, no Google Sheets writes, no Firestore orders.
 * A migration_state='complete' record is required for ALL operations.
 */
import {authorizeStaff,authorizeUser} from "./staff-auth.js";
const orderActions=new Set(["guestCreateOrder","createOrder","editOrder","cancelOrder","myOrders",
 "staffRecentOrders","staffOrders","staffCreateOrder","staffEditOrder","staffStatus","menu",
 "staffArchiveOrder","staffDeleteOrder","staffClearExpiredOrders"]);
const error=(code,message,status=400)=>({ok:false,error:{code,message},status});
const good=data=>({ok:true,data,status:200});
const idPattern=/^[A-Za-z0-9_-]{8,128}$/;
const tokenPattern=/^[a-f0-9]{32}$/;
const datePattern=/^\d{4}-\d{2}-\d{2}$/;
const statuses=new Set(["pending","confirmed","cancelled"]);
const field=(f,k)=>f?.[k]?.stringValue??f?.[k]?.integerValue??f?.[k]?.doubleValue??f?.[k]?.booleanValue??f?.[k]?.timestampValue;
const asNumber=v=>Number(v);
const toMinor=value=>{
 const n=asNumber(value);
 if(!Number.isFinite(n)||n<0||n>20000)throw Error("invalid-price");
 return Math.round(n*100);
};
const digest=async x=>{
 const hash=await crypto.subtle.digest("SHA-256",new TextEncoder().encode(JSON.stringify(x)));
 return Array.from(new Uint8Array(hash),v=>v.toString(16).padStart(2,"0")).join("");
};
const checkString=(value,max=200)=>String(value??"").trim().slice(0,max);
async function published(env,path){
 const kv=env.BALI_PUBLIC_CONTENT;
 if(!kv)throw Error("public-kv-unavailable");
 const row=await kv.get("bali:public:v1:"+path,"json");
 if(!row||!Array.isArray(row.documents))throw Error("public-source-unavailable");
 return row.documents;
}
const menuRow=doc=>({
 id:Number(field(doc.fields,"id")??doc.name?.split("/").at(-1)),
 name:checkString(field(doc.fields,"name"),200),
 price:Number(field(doc.fields,"price")),available:field(doc.fields,"available")===true,
 category:checkString(field(doc.fields,"category"),90)
});
const eventRow=doc=>({
 id:String(doc.name||"").split("/").at(-1),
 title:checkString(field(doc.fields,"title"),300),
 date:checkString(field(doc.fields,"date"),10),
 preorderEnabled:field(doc.fields,"preorderEnabled")===true,
 closesAt:checkString(field(doc.fields,"closesAt"),64)
});
async function catalog(env){
 const [menus,events]=await Promise.all([published(env,"menu"),published(env,"events")]);
 return {menu:menus.map(menuRow).filter(m=>Number.isSafeInteger(m.id)&&m.id>0&&
  m.name&&Number.isFinite(m.price)),events:events.map(eventRow).filter(e=>e.id&&e.title)};
}
function validateBody(payload,{staff=false,editing=false}={}){
 const eventId=checkString(payload.eventId,100);
 const eventDate=String(payload.eventDate||"");
 if(!datePattern.test(eventDate)||!eventId||eventId.length>100)
  throw Error("invalid-event");
 const customerName=checkString(payload.customerName,100);
 const customerPhone=checkString(payload.customerPhone,50);
 if(!editing&&!staff&&(customerName.length<2||!/^\+[1-9]\d{7,14}$/.test(customerPhone)))
  throw Error("invalid-customer");
 if(staff&&(customerName.length<2||!/^\+[1-9]\d{7,14}$/.test(customerPhone)))
  throw Error("invalid-customer");
 const tableNumber=checkString(payload.tableNumber,20),bookingId=checkString(payload.bookingId,60);
 if(!tableNumber&&!bookingId)throw Error("missing-booking-reference");
 const notes=checkString(payload.notes,500);
 const input=payload.items;
 if(!Array.isArray(input)||input.length<1||input.length>12)throw Error("invalid-items");
 const found=new Set(),items=[];
 for(const row of input){
  const id=Number(row.id),quantity=Number(row.quantity);
  if(!Number.isSafeInteger(id)||id<1||found.has(id)||
     !Number.isInteger(quantity)||quantity<1||quantity>50)
   throw Error("invalid-item-quantity");
  found.add(id);items.push({id,quantity});
 }
 const status=staff?String(payload.status||"pending"):"pending";
 if(!statuses.has(status))throw Error("invalid-status");
 return {eventId,eventDate,customerName,customerPhone,tableNumber,bookingId,notes,items,status};
}
const iso=ms=>new Date(Number(ms)).toISOString();
function normalized(o,items=[]){
 const lines=items.map(i=>({id:Number(i.menu_id),name:i.item_name,unitPrice:i.unit_price_minor/100,
  quantity:i.quantity}));
 return {id:o.id,eventId:o.event_id,eventDate:o.event_date,eventTitle:o.event_title,
  orderNumber:o.order_number,customerName:o.customer_name,customerPhone:o.customer_phone,
  tableNumber:o.table_number,bookingId:o.booking_id,notes:o.notes,status:o.status,
  source:o.source,ownerUid:o.owner_uid,createdByUid:o.created_by_uid,
  createdAt:iso(o.created_at_ms),updatedAt:iso(o.updated_at_ms),
  archived:!!o.archived_at_ms,items:lines,total:lines.reduce((a,i)=>a+i.unitPrice*i.quantity,0)};
}
async function readOne(db,id){
 const order=await db.prepare("SELECT * FROM preorder_orders WHERE id=?").bind(id).first();
 if(!order)return null;
 const result=await db.prepare("SELECT * FROM preorder_items WHERE order_id=? ORDER BY item_name").bind(id).all();
 return normalized(order,result.results||[]);
}
async function list(db,{date="",eventId="",uid="",limit=100}={}){
 let sql="SELECT * FROM preorder_orders WHERE 1=1",args=[];
 if(date){sql+=" AND event_date=?";args.push(date);}
 if(eventId){sql+=" AND event_id=?";args.push(eventId);}
 if(uid){sql+=" AND owner_uid=?";args.push(uid);}
 sql+=" ORDER BY event_date DESC, created_at_ms DESC LIMIT ?";
 args.push(Math.min(limit,1500));
 const orders=(await db.prepare(sql).bind(...args).all()).results||[];
 if(!orders.length)return [];
 const ids=orders.map(o=>o.id),placeholders=ids.map(()=>"?").join(",");
 const rows=(await db.prepare("SELECT * FROM preorder_items WHERE order_id IN ("+placeholders+") ORDER BY item_name")
  .bind(...ids).all()).results||[];
 const byId=new Map();
 for(const line of rows){
  if(!byId.has(line.order_id))byId.set(line.order_id,[]);
  byId.get(line.order_id).push(line);
 }
 return orders.map(o=>normalized(o,byId.get(o.id)||[]));
}
async function priced(env,data,{mustBeActive=true}={}){
 const pub=await catalog(env),e=pub.events.find(x=>x.id===data.eventId);
 if(!e||e.date!==data.eventDate)throw Error("event-not-found");
 if(mustBeActive&&(!e.preorderEnabled||!Date.parse(e.closesAt)||
   Date.parse(e.closesAt)<=Date.now()))throw Error("event-no-longer-accepts-orders");
 const rows=data.items.map(x=>{
  const item=pub.menu.find(m=>m.id===x.id);
  if(!item||!item.available)throw Error("menu-item-not-available");
  return {...x,name:item.name,minor:toMinor(item.price)};
 });
 return {event:e,items:rows};
}
async function verifiedIdentity(input,request){
 const token=String(input.token||"");
 return authorizeUser(new Request(request.url,{headers:{Authorization:"Bearer "+token}}));
}
function messages(e){
 const msg=String(e?.message||"");
 const valid=new Set(["invalid-price","invalid-event","invalid-customer","missing-booking-reference",
  "invalid-items","invalid-item-quantity","invalid-status","event-not-found",
  "event-no-longer-accepts-orders","menu-item-not-available","public-kv-unavailable",
  "public-source-unavailable","request-id-reused","order-conflict","order-not-found",
  "order-not-editable","not-owner","unsupported-order-action","unknown-order-source"]);
 if(valid.has(msg)){
  const service=msg.includes("unavailable");
  return error(service?"unavailable":msg,msg,service?503:msg==="order-conflict"?409:400);
 }
 return error("service-unavailable","Не удалось сохранить заказ. Повторите действие.",503);
}
async function create(db,env,input,request,{staff=false,guest=false}={}){
 const idToken=input.token;
 let identity;
 if(staff)identity=await authorizeStaff(request);
 else if(guest)identity=idToken?await verifiedIdentity(input,request):null;
 else identity=await verifiedIdentity(input,request);
 if(!guest&&!identity)return error("unauthenticated","Войдите в BALI.",401);
 const p=input.payload||{};
 const data=validateBody({...p,
  ...(!guest&&!staff?{customerName:p.customerName,customerPhone:p.customerPhone}:{}),
 },{staff});
 const ownerUid=staff?checkString(p.ownerUid,128):identity?.uid||"";
 if(!guest&&!staff&&(!ownerUid||ownerUid.length<8))
  return error("unauthenticated","Требуется вход.",401);
 const reqId=String(p.requestId||"");
 if(!tokenPattern.test(reqId))return error("invalid-argument","Некорректный ID запроса.",400);
 if(guest&&(p.privacyConsent!==true||p.internationalConsent!==true||p.guestVerified!==true))
  return error("consent-required","Подтвердите согласия и проверку.",400);
 const actorKey=staff?"staff:"+identity.uid:ownerUid?"user:"+ownerUid:"guest:"+reqId;
 const fingerprint=await digest({...data,ownerUid});
 const receipt=()=>db.prepare(
  "SELECT fingerprint,order_id FROM preorder_request_receipts WHERE actor_key=? AND request_id=?"
 ).bind(actorKey,reqId).first();
 const already=await receipt();
 if(already){
  if(already.fingerprint!==fingerprint)return error("request-id-reused","Повторный ID с другими данными.",409);
  const order=await readOne(db,already.order_id);
  return order?good({order}):error("service-unavailable","Запись заказа недоступна.",503);
 }
 const {event,items}=await priced(env,data);
 const orderId="o_"+reqId,now=Date.now();
 // D1 batches execute in one transaction: counter -> order -> items -> receipt.
 // The order's number comes from the counter WITHIN the same transaction,
 // not from a racy read and a second write.
 const stmts=[
  db.prepare("INSERT INTO preorder_counters (event_id,event_date,last_number,updated_at_ms) "+
   "VALUES (?,?,1,?) ON CONFLICT(event_id) DO UPDATE SET "+
   "last_number=last_number+1,event_date=excluded.event_date,updated_at_ms=excluded.updated_at_ms")
   .bind(data.eventId,data.eventDate,now),
  db.prepare("INSERT INTO preorder_orders (id,event_id,event_date,event_title,order_number,"+
   "owner_uid,created_by_uid,customer_name,customer_phone,table_number,booking_id,notes,"+
   "status,source,created_at_ms,updated_at_ms) "+
   "SELECT ?,?,?,?,last_number,?,?,?,?,?,?,?,?,?,?,? FROM preorder_counters WHERE event_id=?")
   .bind(orderId,data.eventId,data.eventDate,event.title,ownerUid,
    staff?identity.uid:"",data.customerName,data.customerPhone,data.tableNumber,data.bookingId,
    data.notes,data.status,staff?"staff":"guest",now,now,data.eventId)
 ];
 for(const item of items)stmts.push(db.prepare(
  "INSERT INTO preorder_items (order_id,menu_id,item_name,unit_price_minor,quantity) VALUES (?,?,?,?,?)"
 ).bind(orderId,String(item.id),item.name,item.minor,item.quantity));
 stmts.push(db.prepare("INSERT INTO preorder_request_receipts "+
  "(actor_key,request_id,fingerprint,order_id,created_at_ms) VALUES (?,?,?,?,?)")
  .bind(actorKey,reqId,fingerprint,orderId,now));
 stmts.push(db.prepare("INSERT INTO preorder_audit (order_id,actor_uid,action,created_at_ms,details) VALUES (?,?,?,?,?)")
  .bind(orderId,identity?.uid||"guest","created",now,"{}"));
 try{await db.batch(stmts);}
 catch(e){
  const prior=await receipt().catch(()=>null);
  if(prior?.fingerprint===fingerprint){
   const order=await readOne(db,prior.order_id);
   if(order)return good({order});
  }
  return error("order-conflict","Параллельный заказ. Повторите попытку.",409);
 }
 const result=await readOne(db,orderId);
 return result?good({order:result}):error("service-unavailable","Заказ не прочитан после записи.",503);
}
async function updateStatus(db,input,request){
 const staff=await authorizeStaff(request),p=input.payload||{};
 const id=String(p.id||""),status=String(p.status||"");
 if(!idPattern.test(id)||!statuses.has(status))return error("invalid-argument","Недопустимый заказ или статус.",400);
 const current=await db.prepare("SELECT * FROM preorder_orders WHERE id=?").bind(id).first();
 if(!current)return error("not-found","Заказ не найден.",404);
 const requestId=tokenPattern.test(p.requestId)?p.requestId:crypto.randomUUID().replace(/-/g,"");
 const existing=await db.prepare("SELECT * FROM preorder_status_actions WHERE actor_uid=? AND request_id=?")
  .bind(staff.uid,requestId).first();
 if(existing)return existing.order_id===id&&existing.new_status===status?
   good({result:{id,status,updatedAt:iso(existing.applied_updated_at_ms)}}):
   error("request-id-reused","Действие уже использовано.",409);
 if(p.expectedUpdatedAt&&Date.parse(p.expectedUpdatedAt)!==Number(current.updated_at_ms))
  return error("order-conflict","Заказ изменён в другой вкладке.",409);
 if(status===current.status)return good({result:{id,status,updatedAt:iso(current.updated_at_ms)}});
 const now=Math.max(Date.now(),Number(current.updated_at_ms)+1);
 const queries=[
  db.prepare("INSERT INTO preorder_status_actions "+
   "(actor_uid,request_id,order_id,new_status,expected_updated_at_ms,applied_updated_at_ms,created_at_ms) "+
   "SELECT ?,?,?,?,?,?,? WHERE EXISTS "+
   "(SELECT 1 FROM preorder_orders WHERE id=? AND updated_at_ms=?)")
   .bind(staff.uid,requestId,id,status,current.updated_at_ms,now,now,id,current.updated_at_ms),
  db.prepare("UPDATE preorder_orders SET status=?,updated_at_ms=? WHERE id=? AND updated_at_ms=? "+
   "AND EXISTS(SELECT 1 FROM preorder_status_actions WHERE actor_uid=? AND request_id=?)")
   .bind(status,now,id,current.updated_at_ms,staff.uid,requestId),
  db.prepare("INSERT INTO preorder_audit (order_id,actor_uid,action,created_at_ms,details) "+
   "SELECT ?,?,?,?,? WHERE EXISTS(SELECT 1 FROM preorder_status_actions "+
   "WHERE actor_uid=? AND request_id=? AND applied_updated_at_ms=?)")
   .bind(id,staff.uid,"status",now,JSON.stringify({status}),staff.uid,requestId,now)
 ];
 let changes;
 try{changes=await db.batch(queries);}
 catch{return error("order-conflict","Параллельное изменение статуса.",409);}
 if(changes.some(result=>Number(result?.meta?.changes)!==1))
  return error("order-conflict","Заказ изменён другим сотрудником.",409);
 return good({result:{id,status,updatedAt:iso(now)}});
}
async function change(db,env,input,request,{staff=false}={}){
 const user=staff?await authorizeStaff(request):await verifiedIdentity(input,request);
 const p=input.payload||{};
 const id=String(p.id||"");
 if(!idPattern.test(id))return error("invalid-argument","Некорректный заказ.",400);
 const old=await db.prepare("SELECT * FROM preorder_orders WHERE id=?").bind(id).first();
 if(!old)return error("not-found","Заказ не найден.",404);
 if(!staff&&old.owner_uid!==user.uid)return error("permission-denied","Нет доступа к заказу.",403);
 if(old.archived_at_ms||(!staff&&old.status!=="pending"))return error("order-not-editable","Заказ закрыт.",409);
 if(p.expectedUpdatedAt&&Date.parse(p.expectedUpdatedAt)!==Number(old.updated_at_ms))
  return error("order-conflict","Заказ изменён в другой вкладке.",409);
 const data=validateBody({
  ...p,
  eventId:p.eventId||old.event_id,eventDate:p.eventDate||old.event_date,
  customerName:staff?p.customerName:old.customer_name,
  customerPhone:staff?p.customerPhone:old.customer_phone,
  status:staff?p.status:old.status
 },{staff,editing:true});
 const {event,items}=await priced(env,data,{mustBeActive:old.event_id!==data.eventId});
 const moved=old.event_id!==data.eventId,now=Math.max(Date.now(),Number(old.updated_at_ms)+1);
 const stmts=[];
 if(moved)stmts.push(db.prepare("INSERT INTO preorder_counters "+
  "(event_id,event_date,last_number,updated_at_ms) VALUES (?,?,1,?) "+
  "ON CONFLICT(event_id) DO UPDATE SET last_number=last_number+1,updated_at_ms=excluded.updated_at_ms")
  .bind(data.eventId,data.eventDate,now));
 stmts.push(db.prepare("UPDATE preorder_orders SET event_id=?,event_date=?,event_title=?,"+
  "order_number="+(moved?"(SELECT last_number FROM preorder_counters WHERE event_id=?)":"order_number")+
  ",customer_name=?,customer_phone=?,table_number=?,booking_id=?,notes=?,status=?,updated_at_ms=? "+
  "WHERE id=? AND updated_at_ms=?").bind(
   data.eventId,data.eventDate,event.title,...(moved?[data.eventId]:[]),
   data.customerName,data.customerPhone,data.tableNumber,data.bookingId,data.notes,data.status,now,id,old.updated_at_ms
  ));
 const updateIndex=stmts.length-1;
 stmts.push(db.prepare("DELETE FROM preorder_items WHERE order_id=? "+
  "AND EXISTS(SELECT 1 FROM preorder_orders WHERE id=? AND updated_at_ms=?)")
  .bind(id,id,now));
 for(const x of items)stmts.push(db.prepare("INSERT INTO preorder_items "+
  "(order_id,menu_id,item_name,unit_price_minor,quantity) "+
  "SELECT ?,?,?,?,? WHERE EXISTS "+
  "(SELECT 1 FROM preorder_orders WHERE id=? AND updated_at_ms=?)")
  .bind(id,String(x.id),x.name,x.minor,x.quantity,id,now));
 stmts.push(db.prepare("INSERT INTO preorder_audit (order_id,actor_uid,action,created_at_ms,details) "+
  "SELECT ?,?,?,?,? WHERE EXISTS "+
  "(SELECT 1 FROM preorder_orders WHERE id=? AND updated_at_ms=?)")
  .bind(id,user.uid,"edited",now,JSON.stringify({moved}),id,now));
 let outcome;
 try{outcome=await db.batch(stmts);}
 catch{return error("order-conflict","Заказ уже изменён.",409);}
 if(Number(outcome?.[updateIndex]?.meta?.changes)!==1)
  return error("order-conflict","Заказ был изменён в другой вкладке.",409);
 const order=await readOne(db,id);
 return good({order});
}
export async function handleD1OrderAction(input,request,env){
 try{
  const action=String(input?.action||"");
  if(!orderActions.has(action))return null;
  const db=env.BALI_OPERATIONS_DB;
  if(!db)return error("service-unavailable","D1 временно недоступна.",503);
  const state=await db.prepare("SELECT status FROM migration_state WHERE id='preorders'").first();
  if(state?.status!=="complete")
   return error("preorder-cutover-not-ready","Заказы переключаются. Повторите попытку.",503);
  const staffRequest=new Request(request.url,{headers:{
   Authorization:"Bearer "+String(input.token||""),
   ...(request.headers.get("Origin")?{"Origin":request.headers.get("Origin")}:{})
  }});
  if(action==="menu"){
   await authorizeStaff(staffRequest);
   const data=await catalog(env);return good(data);
  }
  if(action==="guestCreateOrder")return create(db,env,input,staffRequest,{guest:true});
  if(action==="createOrder")return create(db,env,input,staffRequest);
  if(action==="staffCreateOrder")return create(db,env,input,staffRequest,{staff:true});
  if(action==="staffStatus")return updateStatus(db,input,staffRequest);
  if(action==="editOrder")return change(db,env,input,staffRequest);
  if(action==="staffEditOrder")return change(db,env,input,staffRequest,{staff:true});
  if(action==="myOrders"){
   const user=await verifiedIdentity(input,staffRequest);
   return good({orders:await list(db,{uid:user.uid,limit:40})});
  }
  if(action==="cancelOrder"){
   const user=await verifiedIdentity(input,staffRequest),id=String(input.payload?.id||"");
   const order=await db.prepare("SELECT id,owner_uid,updated_at_ms,status FROM preorder_orders WHERE id=?").bind(id).first();
   if(!order||order.owner_uid!==user.uid)return error("not-found","Заказ не найден.",404);
   if(order.status!=="pending")return error("order-not-editable","Нельзя отменить подтверждённый заказ.",409);
   const now=Math.max(Date.now(),Number(order.updated_at_ms)+1);
   const saved=await db.prepare("UPDATE preorder_orders SET status='cancelled',updated_at_ms=? WHERE id=? AND updated_at_ms=?")
    .bind(now,id,order.updated_at_ms).run();
   if(Number(saved?.meta?.changes)!==1)return error("order-conflict","Заказ уже изменён.",409);
   return good({ok:true});
  }
  if(action==="staffArchiveOrder"||action==="staffDeleteOrder"){
   const staff=await authorizeStaff(staffRequest,{
     adminOnly:action==="staffDeleteOrder"
   }),id=String(input.payload?.id||"");
   if(!idPattern.test(id))return error("invalid-argument","Неверный номер заказа.",400);
   const current=await db.prepare("SELECT * FROM preorder_orders WHERE id=?").bind(id).first();
   if(!current)return error("not-found","Заказ не найден.",404);
   if(action==="staffDeleteOrder"){
    // Cascades to items, receipts, status actions. Audit is intentionally preserved.
    const result=await db.prepare("DELETE FROM preorder_orders WHERE id=? AND updated_at_ms=?")
      .bind(id,current.updated_at_ms).run();
    if(Number(result?.meta?.changes)!==1)return error("order-conflict","Заказ изменён.",409);
    return good({deleted:id});
   }
   const archived=Boolean(input.payload?.archived),now=Math.max(Date.now(),current.updated_at_ms+1);
   const result=await db.prepare("UPDATE preorder_orders SET archived_at_ms=?,"+
    "status=CASE WHEN ?=1 THEN 'cancelled' ELSE status END,updated_at_ms=? "+
    "WHERE id=? AND updated_at_ms=?")
    .bind(archived?now:null,archived?1:0,now,id,current.updated_at_ms).run();
   if(Number(result?.meta?.changes)!==1)return error("order-conflict","Заказ изменён.",409);
   return good({order:await readOne(db,id)});
  }
  if(action==="staffClearExpiredOrders"){
   await authorizeStaff(staffRequest,{adminOnly:true});
   const cutoff=Date.now()-30*86400000;
   const old=await db.prepare("SELECT id FROM preorder_orders WHERE created_at_ms<? LIMIT 50")
    .bind(cutoff).all();
   const found=old.results||[];
   if(!found.length)return good({removed:0});
   const statements=found.map(x=>db.prepare("DELETE FROM preorder_orders WHERE id=? AND created_at_ms<?")
    .bind(x.id,cutoff));
   await db.batch(statements);
   return good({removed:found.length});
  }
  if(action==="staffOrders"||action==="staffRecentOrders"){
   await authorizeStaff(staffRequest);
   const p=input.payload||{};
   const date=String(p.date||""),eventId=String(p.eventId||"");
   if(date&&!datePattern.test(date))return error("invalid-argument","Неверная дата.",400);
   const orders=await list(db,{date,eventId,limit:action==="staffOrders"?1500:100});
   return good({orders,canEditOrders:true,canCreateOrders:true});
  }
  return error("unsupported-order-action","Неизвестная операция.",400);
 }catch(e){
  if(e.status===401)return error("unauthenticated","Войдите в аккаунт.",401);
  if(e.status===403)return error("permission-denied","Нет доступа.",403);
  return messages(e);
 }
}
