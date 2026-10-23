/* Canonical BALI preorder operations in Cloudflare D1.
 * No legacy Sheets or Firestore order writes. All menu prices and live event
 * windows originate from administrator-published public KV, never the guest.
 * D1.batch transactions make (event serial + order + lines) atomic.
 */
const ID=/^[a-zA-Z0-9_-]{8,128}$/;
const DATE=/^\d{4}-\d{2}-\d{2}$/;
const STATES=new Set(["pending","confirmed","cancelled"]);
export const output=(value,status=200)=>new Response(JSON.stringify(value),{
  status,headers:{"Content-Type":"application/json;charset=utf-8",
    "Cache-Control":"private,no-store","X-Content-Type-Options":"nosniff"}
});
export const abort=(code,message,status=400)=>Object.assign(new Error(message),{code,status});
export const millis=value=>{
  if(Number.isSafeInteger(value)&&value>0)return value;
  const ms=Date.parse(String(value||""));
  if(!Number.isFinite(ms)||ms<=0)throw abort("invalid-argument","Некорректная дата изменения заказа.");
  return ms;
};
const value=f=>f?.stringValue??f?.timestampValue??f?.booleanValue??
  f?.integerValue??f?.doubleValue??"";
export const decodeDocument=doc=>{
  const data=Object.fromEntries(Object.entries(doc.fields||{}).map(([k,v])=>[k,value(v)]));
  return {id:doc.name?.split("/").pop(),...data,
    price:Number(data.price),available:data.available===true,
    preorderEnabled:data.preorderEnabled===true};
};
export async function catalog(env){
  const kv=env?.BALI_PUBLIC_CONTENT;
  if(!kv)throw abort("catalog-unavailable","Меню и календарь недоступны.",503);
  const data=await Promise.all(["events","menu"].map(async name=>{
    const v=await kv.get("bali:public:v1:"+name,"json");
    if(!Array.isArray(v?.documents))
      throw abort("catalog-unavailable","Не удалось проверить актуальность меню или мероприятия.",503);
    return v.documents.map(decodeDocument);
  }));
  return {events:data[0],menu:data[1]};
}
export function checkEvent(events,id,date,{allowClosed=false}={}){
  if(typeof id!=="string"||id.length>100||!DATE.test(String(date||"")))
    throw abort("invalid-argument","Выберите дату и мероприятие.");
  const event=events.find(e=>e.id===id&&e.date===date);
  if(!event||typeof event.title!=="string"||!event.title.trim())
    throw abort("failed-precondition","Мероприятие не найдено. Обновите календарь.",409);
  if(!allowClosed){
    const cutoff=Date.parse(event.closesAt);
    if(event.preorderEnabled!==true||!Number.isFinite(cutoff)||cutoff<=Date.now())
      throw abort("failed-precondition","Приём предзаказов на мероприятие завершён.",409);
  }
  return event;
}
export function priceLines(menu,items){
  if(!Array.isArray(items)||items.length<1||items.length>12)
    throw abort("invalid-argument","В корзине должно быть от 1 до 12 блюд.");
  const seen=new Set(),lines=items.map(line=>{
    const id=String(line.id),quantity=Number(line.quantity);
    if(!/^\d{1,10}$/.test(id)||seen.has(id)||
       !Number.isInteger(quantity)||quantity<1||quantity>50)
      throw abort("invalid-argument","Проверьте количество и состав блюд.");
    seen.add(id);
    const item=menu.find(x=>String(x.id)===id&&x.available===true);
    if(!item||!item.name||!Number.isFinite(item.price)||item.price<0)
      throw abort("failed-precondition","Блюдо недоступно. Обновите меню.",409);
    const minor=Math.round(item.price*100);
    if(!Number.isSafeInteger(minor)||minor<0)
      throw abort("invalid-argument","Некорректная цена в меню.");
    return {id,name:String(item.name).slice(0,200),quantity,minor};
  });
  return {lines,totalMinor:lines.reduce((a,x)=>a+x.quantity*x.minor,0)};
}
export function validatedCustomer(input){
  const name=String(input.customerName||"").trim();
  const phone=String(input.customerPhone||"").trim();
  const table=String(input.tableNumber||"").trim();
  const booking=String(input.bookingId||"").trim();
  const notes=String(input.notes||"").trim();
  if(name.length<2||name.length>100||!/^(?:\+[1-9]\d{7,14})$/.test(phone)||
     (!table&&!booking)||table.length>20||booking.length>60||notes.length>500)
    throw abort("invalid-argument","Укажите имя, телефон и столик или номер брони.");
  return {name,phone,table,booking,notes};
}
export const rowOrder=(row,items=[])=>({
  id:row.id,eventId:row.event_id,eventDate:row.event_date,
  eventTitle:row.event_title,orderNumber:Number(row.order_number),
  ownerUid:row.owner_uid,createdByUid:row.created_by_uid,
  customerName:row.customer_name,customerPhone:row.customer_phone,
  tableNumber:row.table_number,bookingId:row.booking_id,notes:row.notes,
  status:row.status,source:row.source,archived:row.archived_at_ms!==null,
  createdAt:new Date(row.created_at_ms).toISOString(),
  updatedAt:new Date(row.updated_at_ms).toISOString(),
  total:items.reduce((a,x)=>a+Number(x.unitPrice||0)*Number(x.quantity||0),0),
  items
});
export async function getOrders(db,{date="",eventId="",limit=100,uid=""}={}){
  if(date&&!DATE.test(date))throw abort("invalid-argument","Неверная дата.");
  if(eventId&&(eventId.length>100||!/^[A-Za-z0-9_:-]+$/.test(eventId)))
    throw abort("invalid-argument","Неверное мероприятие.");
  const where=["1=1"],bind=[];
  if(date){where.push("event_date=?");bind.push(date)}
  if(eventId){where.push("event_id=?");bind.push(eventId)}
  if(uid){where.push("owner_uid=?");bind.push(uid)}
  const n=Math.min(500,Math.max(1,Number(limit)||100));
  const rows=await db.prepare("SELECT * FROM preorder_orders WHERE "+
    where.join(" AND ")+" ORDER BY created_at_ms DESC LIMIT ?")
    .bind(...bind,n).all();
  const found=rows.results||[];
  if(!found.length)return [];
  const ids=found.map(x=>x.id);
  const lines=await db.prepare("SELECT * FROM preorder_items WHERE order_id IN ("+
    ids.map(()=>"?").join(",")+")").bind(...ids).all();
  const byId=new Map();
  for(const entry of lines.results||[]){
    if(!byId.has(entry.order_id))byId.set(entry.order_id,[]);
    byId.get(entry.order_id).push({id:entry.menu_id,
      name:entry.item_name,quantity:Number(entry.quantity),
      unitPrice:Number(entry.unit_price_minor)/100});
  }
  return found.map(row=>rowOrder(row,byId.get(row.id)||[]));
}
export async function lookup(db,id){
  const found=await db.prepare("SELECT * FROM preorder_orders WHERE id=?").bind(id).first();
  if(!found)return null;
  const lines=await db.prepare("SELECT * FROM preorder_items WHERE order_id=?").bind(id).all();
  return rowOrder(found,(lines.results||[]).map(x=>({
    id:x.menu_id,name:x.item_name,quantity:x.quantity,unitPrice:x.unit_price_minor/100
  })));
}
export async function createOrder(db,{id,eventId,eventDate,customer,lines,status="pending",
  ownerUid="",staffUid="",eventTitle}){
  if(!ID.test(id)||!STATES.has(status))throw abort("invalid-argument","Неверный заказ.");
  const prior=await lookup(db,id);
  if(prior)return {...prior,alreadyCreated:true};
  const now=Date.now(),counter=[
    db.prepare("INSERT INTO preorder_counters(event_id,event_date,last_number,updated_at_ms) "+
      "VALUES(?,?,1,?) ON CONFLICT(event_id) DO UPDATE SET "+
      "last_number=preorder_counters.last_number+1,updated_at_ms=excluded.updated_at_ms")
      .bind(eventId,eventDate,now),
    db.prepare(
      "INSERT INTO preorder_orders(id,event_id,event_date,event_title,order_number,"+
      "owner_uid,created_by_uid,customer_name,customer_phone,table_number,booking_id,"+
      "notes,status,source,created_at_ms,updated_at_ms) "+
      "SELECT ?,?,?,?,last_number,?,?,?,?,?,?,?,?,?,?,? FROM preorder_counters WHERE event_id=?"
    ).bind(id,eventId,eventDate,eventTitle,ownerUid,staffUid,
      customer.name,customer.phone,customer.table,customer.booking,customer.notes,
      status,staffUid?"staff":"guest",now,now,eventId)
  ];
  const writes=[...counter,...lines.map(x=>db.prepare(
    "INSERT INTO preorder_items(order_id,menu_id,item_name,unit_price_minor,quantity) "+
    "VALUES(?,?,?,?,?)").bind(id,x.id,x.name,x.minor,x.quantity)),
    db.prepare("INSERT INTO preorder_audit(order_id,actor_uid,action,created_at_ms,details) "+
      "VALUES(?,?,?,?,?)").bind(id,staffUid||ownerUid||"guest","create",now,"{}")];
  try{await db.batch(writes)}
  catch(error){
    const committed=await lookup(db,id);
    if(committed)return {...committed,alreadyCreated:true};
    throw error;
  }
  const saved=await lookup(db,id);
  if(!saved)throw abort("unavailable","Сервер не подтвердил запись заказа.",503);
  return saved;
}
export function toError(error){
  return output({ok:false,error:{
    code:error?.code||"upstream",
    message:error?.status?error.message:"Сервис предзаказов временно недоступен."
  }},error?.status||503);
}
