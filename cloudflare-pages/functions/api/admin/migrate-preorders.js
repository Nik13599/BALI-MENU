import {authorizeStaff,handlerError,errorJson} from "../../_lib/staff-auth.js";
/* Admin-only, source-verified Firestore -> D1 staging. Caller supplies only
 * document IDs. Data is retrieved from Firebase by authenticated Firestore
 * REST calls, never trusted from the browser. No cutover is performed here.
 */
const PROJECT="bali-menu-5a48b";
const base="https://firestore.googleapis.com/v1/projects/"+PROJECT+"/databases/(default)/documents/";
const readField=(fields,key)=>fields?.[key]?.stringValue??"";
const numberField=(fields,key)=>Number(fields?.[key]?.integerValue??fields?.[key]?.doubleValue);
const moment=(fields,key)=>Date.parse(fields?.[key]?.timestampValue||"");
async function firestore(path,token){
  const response=await fetch(base+path,{headers:{Authorization:"Bearer "+token},
    signal:AbortSignal.timeout(9000)});
  if(!response.ok)throw Object.assign(Error("firestore-source-unavailable"),{status:503});
  return response.json();
}
const validId=x=>typeof x==="string"&&/^[a-zA-Z0-9_-]{8,128}$/.test(x);
function decode(order,items){
  const f=order.fields||{};
  const eventId=readField(f,"eventId"),date=readField(f,"eventDate");
  const number=numberField(f,"orderNumber");
  const statusRaw=readField(f,"status");
  const status=statusRaw==="completed"?"confirmed":statusRaw;
  const id=order.name?.split("/").at(-1);
  if(!validId(id)||!eventId||eventId.length>100||
     !/^\d{4}-\d{2}-\d{2}$/.test(date)||
     !Number.isSafeInteger(number)||number<1||
     !["pending","confirmed","cancelled"].includes(status))
    throw Object.assign(Error("invalid-source-order"),{status:422});
  const created=moment(f,"createdAt"),updated=moment(f,"updatedAt");
  if(!Number.isFinite(created)||!Number.isFinite(updated))
    throw Object.assign(Error("incomplete-source-order"),{status:422});
  const normalized=items.map(doc=>{
    const fields=doc.fields||{},menuId=String(fields.id?.integerValue??fields.id?.stringValue??"");
    const name=readField(fields,"name"),quantity=numberField(fields,"quantity");
    const price=numberField(fields,"unitPrice");
    if(!menuId||!name||name.length>200||!Number.isInteger(quantity)||quantity<1||quantity>50||
       !Number.isFinite(price)||price<0||price>999999)
      throw Object.assign(Error("invalid-source-item"),{status:422});
    return {menuId,name,quantity,minor:Math.round(price*100)};
  });
  if(normalized.length<1||normalized.length>50)
    throw Object.assign(Error("missing-source-items"),{status:422});
  return {id,eventId,date,number,status,created,updated,items:normalized,
    eventTitle:readField(f,"eventTitle").slice(0,300),
    ownerUid:readField(f,"ownerUid").slice(0,128),
    createdByUid:readField(f,"createdByUid").slice(0,128),
    customerName:readField(f,"customerName").slice(0,200),
    customerPhone:readField(f,"customerPhone").slice(0,50),
    tableNumber:readField(f,"tableNumber").slice(0,80),
    bookingId:readField(f,"bookingId").slice(0,100),
    notes:readField(f,"notes").slice(0,2000),
    source:["guest","staff"].includes(readField(f,"source"))?readField(f,"source"):"legacy",
    archived:fieldsBool(f,"archived")
  };
}
const fieldsBool=(fields,key)=>fields?.[key]?.booleanValue===true;

export async function onRequestPost({request,env}){
  try{
    const admin=await authorizeStaff(request,{adminOnly:true,env});
    const db=env?.BALI_OPERATIONS_DB;
    if(!db)return errorJson(503,"database-unavailable");
    const original=request.headers.get("Origin");
    if(original&&original!==new URL(request.url).origin)return errorJson(403,"invalid-origin");
    const raw=await request.text();
    if(raw.length>2500)return errorJson(413,"request-too-large");
    let payload;
    try{payload=JSON.parse(raw);}catch{return errorJson(400,"invalid-json");}
    if(!Array.isArray(payload?.ids)||payload.ids.length<1||payload.ids.length>10||
       payload.ids.some(x=>!validId(x))||
       new Set(payload.ids).size!==payload.ids.length)
      return errorJson(400,"invalid-source-ids");
    const bearer=request.headers.get("Authorization").slice(7);
    const orders=[];
    for(const id of payload.ids){
      const doc=await firestore("orders/"+encodeURIComponent(id),bearer);
      const items=await firestore("orders/"+encodeURIComponent(id)+"/items?pageSize=50",bearer);
      orders.push(decode(doc,items.documents||[]));
    }
    // A source replay is allowed during staging, never after D1 cutover.
    const state=await db.prepare("SELECT status FROM migration_state WHERE id=?")
      .bind("preorders").first();
    if(state?.status==="complete")return errorJson(409,"migration-already-complete");
    const now=Date.now(),statements=[];
    for(const o of orders){
      statements.push(db.prepare(
        "INSERT INTO preorder_orders (id,firestore_id,event_id,event_date,"+
        "event_title,order_number,owner_uid,created_by_uid,customer_name,customer_phone,"+
        "table_number,booking_id,notes,status,source,created_at_ms,updated_at_ms,archived_at_ms)"+
        " VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)"+
        " ON CONFLICT(id) DO UPDATE SET firestore_id=excluded.firestore_id,"+
        "event_id=excluded.event_id,event_date=excluded.event_date,"+
        "event_title=excluded.event_title,order_number=excluded.order_number,"+
        "owner_uid=excluded.owner_uid,created_by_uid=excluded.created_by_uid,"+
        "customer_name=excluded.customer_name,customer_phone=excluded.customer_phone,"+
        "table_number=excluded.table_number,booking_id=excluded.booking_id,"+
        "notes=excluded.notes,status=excluded.status,source=excluded.source,"+
        "updated_at_ms=excluded.updated_at_ms,archived_at_ms=excluded.archived_at_ms"
      ).bind(o.id,o.id,o.eventId,o.date,o.eventTitle,o.number,o.ownerUid,o.createdByUid,
        o.customerName,o.customerPhone,o.tableNumber,o.bookingId,o.notes,o.status,o.source,
        o.created,o.updated,o.archived?now:null));
      // A source order can be edited after its first staging pass. Refresh
      // every line item in the same D1 transaction, including removals.
      statements.push(db.prepare("DELETE FROM preorder_items WHERE order_id=?").bind(o.id));
      for(const item of o.items)statements.push(db.prepare(
        "INSERT INTO preorder_items (order_id,menu_id,item_name,unit_price_minor,quantity)"+
        " VALUES (?,?,?,?,?)").bind(o.id,item.menuId,item.name,item.minor,item.quantity));
      statements.push(db.prepare(
        "INSERT INTO preorder_counters (event_id,event_date,last_number,updated_at_ms)"+
        " VALUES (?,?,?,?) ON CONFLICT(event_id) DO UPDATE SET "+
        "last_number=MAX(last_number,excluded.last_number),updated_at_ms=excluded.updated_at_ms"
      ).bind(o.eventId,o.date,o.number,now));
      statements.push(db.prepare(
        "INSERT INTO preorder_audit (order_id,actor_uid,action,created_at_ms,details)"+
        " SELECT ?,?,?,?,? WHERE NOT EXISTS (SELECT 1 FROM preorder_audit"+
        " WHERE order_id=? AND action='source-import')"
      ).bind(o.id,admin.uid,"source-import",now,"{}",o.id));
    }
    await db.batch(statements); // D1 batch is transactional.
    const counts=await db.prepare("SELECT COUNT(*) AS n FROM preorder_orders").first();
    const rows=counts?.n||0;
    await db.prepare("INSERT INTO migration_state "+
      "(id,source,status,record_count,updated_at_ms,notes) VALUES (?,?,?,?,?,?) "+
      "ON CONFLICT(id) DO UPDATE SET status='pending',record_count=excluded.record_count,"+
      "updated_at_ms=excluded.updated_at_ms,notes=excluded.notes"
    ).bind("preorders","firebase-firestore","pending",rows,now,
      "Await source count reconciliation and cutover approval").run();
    return new Response(JSON.stringify({ok:true,staged:orders.length,total:rows,cutover:false}),{
      headers:{"Content-Type":"application/json","Cache-Control":"no-store"}
    });
  }catch(e){return e.status===422?errorJson(422,e.message):handlerError(e);}
}
export async function onRequestGet(){return errorJson(405,"method-not-allowed");}
