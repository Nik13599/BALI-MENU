import {authorizeStaff,handlerError,errorJson} from "../../_lib/staff-auth.js";
/* Protected Sheets -> D1 staging. Does NOT change guest checkout, Staff UI
 * or cutover state. Only trusted Apps Script responses, never browser rows.
 * Owner chooses an event DATE; source rows are checked against the D1 schema
 * and each saved order is committed in the same transaction as its items.
 */
const idRx=/^[A-Za-z0-9_-]{8,128}$/;
const dateRx=/^\d{4}-\d{2}-\d{2}$/;
const statuses=new Set(["pending","confirmed","cancelled"]);
const json=(value,status=200)=>new Response(JSON.stringify(value),{
 status,headers:{"Content-Type":"application/json;charset=utf-8",
 "Cache-Control":"no-store","X-Content-Type-Options":"nosniff","Vary":"Authorization"}
});
const bad=message=>{throw Object.assign(Error(message),{status:422});};
const text=(value,max)=>String(value??"").slice(0,max);
const cents=value=>{const n=Number(value);if(!Number.isFinite(n)||n<0||n>1000000)bad("invalid-price");return Math.round(n*100);};
const timestamp=value=>{const ms=Date.parse(String(value||""));if(!Number.isFinite(ms)||ms<=0)bad("invalid-timestamp");return ms;};
const hash=async value=>{
 const b=new TextEncoder().encode(JSON.stringify(value));
 const d=await crypto.subtle.digest("SHA-256",b);
 return [...new Uint8Array(d)].map(x=>x.toString(16).padStart(2,"0")).join("");
};
function validate(row,date,eventId){
 const id=String(row?.id||""),ev=String(row?.eventId||"");
 const day=String(row?.eventDate||"");
 if(!idRx.test(id)||!ev||ev.length>100||day!==date||
   (eventId&&ev!==eventId))bad("invalid-source-order");
 const no=Number(row.orderNumber);
 if(!Number.isSafeInteger(no)||no<1||no>9999999)bad("invalid-order-number");
 const status=row.status==="completed"?"confirmed":row.status;
 if(!statuses.has(status))bad("invalid-order-status");
 const sourceItems=Array.isArray(row.items)?row.items:[];
 if(sourceItems.length<1||sourceItems.length>50)bad("invalid-order-items");
 const found=new Set(),items=sourceItems.map(item=>{
   const menuId=String(item.id||"");
   const quantity=Number(item.quantity),minor=cents(item.unitPrice);
   if(!menuId||menuId.length>100||found.has(menuId)||
     !Number.isInteger(quantity)||quantity<1||quantity>50||
     !String(item.name||"").trim())bad("invalid-order-line");
   found.add(menuId);
   if(item.total!==undefined&&Math.abs(cents(item.total)-minor*quantity)>1)
     bad("line-sum-mismatch");
   return {menuId,quantity,minor,name:text(item.name,200)};
 });
 const total=items.reduce((n,x)=>n+x.minor*x.quantity,0);
 if(total!==cents(row.total))bad("order-total-mismatch");
 const created=timestamp(row.createdAt),updated=timestamp(row.updatedAt);
 if(updated<created)bad("source-time-reversal");
 const owner=text(row.ownerUid,128);
 const phone=text(row.customerPhone,50);
 if(!String(row.customerName||"").trim()||!phone)bad("invalid-customer-fields");
 return {id,ev,date,no,status,items,total,created,updated,owner,
  eventTitle:text(row.eventTitle,300),
  name:text(row.customerName,200),phone,
  table:text(row.tableNumber,80),booking:text(row.bookingId,100),
  notes:text(row.notes,2000),archived:row.archived===true};
}
export async function onRequestPost({request,env}){
 try{
  const actor=await authorizeStaff(request,{adminOnly:true});
  if(request.headers.get("Origin")&&request.headers.get("Origin")!==new URL(request.url).origin)
    return errorJson(403,"invalid-origin");
  const raw=await request.text();
  if(raw.length>256)return errorJson(413,"request-too-large");
  let input;try{input=JSON.parse(raw)}catch{return errorJson(400,"invalid-json")}
  const date=String(input?.date||""),eventId=String(input?.eventId||"");
  if(!dateRx.test(date)||eventId.length>100||
    (eventId&&!/^[A-Za-z0-9_:-]+$/.test(eventId)))
    return errorJson(400,"invalid-date-or-event");
  const db=env?.BALI_OPERATIONS_DB;
  if(!db||!env?.SHEETS_SCRIPT_URL||!env?.BALI_BRIDGE_KEY)
    return errorJson(503,"migration-dependencies-unavailable");
  const state=await db.prepare("SELECT status FROM migration_state WHERE id=?")
    .bind("preorders").first();
  if(state?.status==="complete")return errorJson(409,"preorder-migration-already-live");
  const token=(request.headers.get("Authorization")||"").slice(7);
  const response=await fetch(env.SHEETS_SCRIPT_URL,{
    method:"POST",redirect:"follow",
    headers:{"Content-Type":"text/plain;charset=UTF-8"},
    body:JSON.stringify({action:"staffOrders",token,bridgeKey:env.BALI_BRIDGE_KEY,
      payload:{date,eventId}}),
    signal:AbortSignal.timeout(15000)
  });
  if(!response.ok)return errorJson(503,"sheets-source-unavailable");
  const body=await response.json();
  if(body?.ok!==true||!Array.isArray(body?.data?.orders))
    return errorJson(503,"sheets-source-unverified");
  if(body.data.orders.length>150)return errorJson(413,"source-batch-too-large");
  const orders=body.data.orders.map(x=>validate(x,date,eventId));
  const unique=new Set();
  for(const o of orders){
    if(unique.has(o.id))bad("source-duplicate-id");
    unique.add(o.id);
  }
  const now=Date.now(),stmts=[];
  // Each source must be no older than an existing staged order. Never lose a
  // newer Firestore edit by re-importing an old Google Sheets snapshot.
  for(const o of orders){
    const old=await db.prepare("SELECT updated_at_ms FROM preorder_orders WHERE id=?")
      .bind(o.id).first();
    if(old&&Number(old.updated_at_ms)>o.updated)return errorJson(409,"staged-order-is-newer");
    const proof=await db.prepare("SELECT source_backend FROM preorder_import_proofs WHERE order_id=?")
      .bind(o.id).first();
    if(proof&&proof.source_backend!=="sheets")
      return errorJson(409,"cross-source-order-id-conflict");
    const digest=await hash({id:o.id,date:o.date,ev:o.ev,no:o.no,total:o.total,
      updated:o.updated,items:o.items});
    stmts.push(db.prepare(
      "INSERT INTO preorder_orders (id,firestore_id,event_id,event_date,event_title,"+
      "order_number,owner_uid,created_by_uid,customer_name,customer_phone,"+
      "table_number,booking_id,notes,status,source,created_at_ms,updated_at_ms,archived_at_ms) "+
      "VALUES (?,NULL,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?) "+
      "ON CONFLICT(id) DO UPDATE SET event_id=excluded.event_id,"+
      "event_date=excluded.event_date,event_title=excluded.event_title,"+
      "order_number=excluded.order_number,owner_uid=excluded.owner_uid,"+
      "customer_name=excluded.customer_name,customer_phone=excluded.customer_phone,"+
      "table_number=excluded.table_number,booking_id=excluded.booking_id,"+
      "notes=excluded.notes,status=excluded.status,updated_at_ms=excluded.updated_at_ms,"+
      "archived_at_ms=excluded.archived_at_ms"
    ).bind(o.id,o.ev,o.date,o.eventTitle,o.no,o.owner,"",
      o.name,o.phone,o.table,o.booking,o.notes,o.status,o.owner?"guest":"staff",
      o.created,o.updated,o.archived?o.updated:null));
    stmts.push(db.prepare("DELETE FROM preorder_items WHERE order_id=?").bind(o.id));
    for(const item of o.items)stmts.push(db.prepare(
      "INSERT INTO preorder_items (order_id,menu_id,item_name,unit_price_minor,quantity) "+
      "VALUES (?,?,?,?,?)"
    ).bind(o.id,item.menuId,item.name,item.minor,item.quantity));
    stmts.push(db.prepare(
      "INSERT INTO preorder_import_proofs (source_backend,source_order_id,order_id,"+
      "source_updated_at_ms,expected_total_minor,expected_item_count,source_digest,checked_at_ms)"+
      " VALUES ('sheets',?,?,?,?,?,?,?) ON CONFLICT(source_backend,source_order_id) "+
      "DO UPDATE SET source_updated_at_ms=excluded.source_updated_at_ms,"+
      "expected_total_minor=excluded.expected_total_minor,"+
      "expected_item_count=excluded.expected_item_count,"+
      "source_digest=excluded.source_digest,checked_at_ms=excluded.checked_at_ms"
    ).bind(o.id,o.id,o.updated,o.total,o.items.length,digest,now));
    stmts.push(db.prepare(
      "INSERT INTO preorder_counters (event_id,event_date,last_number,updated_at_ms)"+
      " VALUES (?,?,?,?) ON CONFLICT(event_id) DO UPDATE SET "+
      "last_number=MAX(last_number,excluded.last_number),updated_at_ms=excluded.updated_at_ms"
    ).bind(o.ev,o.date,o.no,now));
  }
  // Single D1 transaction, collision of event/serial automatically aborts.
  if(stmts.length)await db.batch(stmts);
  const counted=await db.prepare("SELECT COUNT(*) AS n FROM preorder_orders").first();
  await db.prepare(
    "INSERT INTO migration_state (id,source,status,record_count,updated_at_ms,notes) "+
    "VALUES ('preorders','mixed-source','pending',?,?,?) "+
    "ON CONFLICT(id) DO UPDATE SET source=excluded.source,status='pending',"+
    "record_count=excluded.record_count,updated_at_ms=excluded.updated_at_ms,"+
    "notes=excluded.notes"
  ).bind(Number(counted?.n||0),now,"Sheets date-scope staging; no cutover").run();
  return json({ok:true,source:"sheets",staged:orders.length,
    total:Number(counted?.n||0),date,cutover:false});
 }catch(error){
  if(error?.status===422)return errorJson(422,error.message);
  return handlerError(error);
 }
}
export async function onRequestGet(){return errorJson(405,"method-not-allowed");}
