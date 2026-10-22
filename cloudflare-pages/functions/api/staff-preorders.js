import {authorizeStaff,handlerError,errorJson} from "../_lib/staff-auth.js";
/* Read-only staff API. Intentionally refuses to serve an empty D1 migration
 * as if it were the canonical Firestore order queue.
 */
export async function onRequestGet({request,env}){
  try{
    const identity=await authorizeStaff(request);
    const db=env?.BALI_OPERATIONS_DB;
    if(!db)return errorJson(503,"database-unavailable");
    const migration=await db.prepare(
      "SELECT status, record_count, updated_at_ms FROM migration_state WHERE id = ?"
    ).bind("preorders").first();
    if(migration?.status!=="complete"){
      return new Response(JSON.stringify({ready:false,activeBackend:"firestore",
        message:"migration-not-complete",recordsMigrated:migration?.record_count||0}),{
        status:200,headers:{"Content-Type":"application/json","Cache-Control":"no-store",
          "X-Content-Type-Options":"nosniff","Vary":"Authorization"}
      });
    }
    const url=new URL(request.url);
    const date=url.searchParams.get("date")||"";
    const eventId=url.searchParams.get("event")||"";
    const max=Math.min(100,Math.max(1,Number(url.searchParams.get("limit")||50)||50));
    if(date&&!/^\d{4}-\d{2}-\d{2}$/.test(date))return errorJson(400,"invalid-date");
    if(eventId&&!/^[a-zA-Z0-9_:-]{1,100}$/.test(eventId))
      return errorJson(400,"invalid-event");
    // Staff can view exactly the requested event, otherwise a bounded queue.
    const sql="SELECT id,event_id,event_date,event_title,order_number,customer_name,"+
      "customer_phone,table_number,booking_id,notes,status,source,created_at_ms,"+
      "updated_at_ms,archived_at_ms FROM preorder_orders WHERE 1=1"+
      (date?" AND event_date = ?":"")+(eventId?" AND event_id = ?":"")+
      " ORDER BY event_date DESC, event_id, order_number LIMIT ?";
    const params=[...(date?[date]:[]),...(eventId?[eventId]:[]),max];
    const {results=[]}=await db.prepare(sql).bind(...params).all();
    const ids=results.map(o=>o.id);
    let items=[];
    if(ids.length){
      const placeholders=ids.map(()=>"?").join(",");
      const lines=await db.prepare("SELECT order_id,menu_id,item_name,unit_price_minor,"+
        "quantity FROM preorder_items WHERE order_id IN ("+placeholders+")"+
        " ORDER BY item_name").bind(...ids).all();
      items=lines.results||[];
    }
    const result=results.map(o=>({...o,items:items.filter(x=>x.order_id===o.id).map(x=>({
      id:x.menu_id,name:x.item_name,quantity:x.quantity,
      unitPrice:x.unit_price_minor/100
    }))}));
    return new Response(JSON.stringify({ready:true,activeBackend:"d1",orders:result}),{
      status:200,headers:{"Content-Type":"application/json","Cache-Control":"no-store",
        "X-Content-Type-Options":"nosniff","Vary":"Authorization"}
    });
  }catch(e){return handlerError(e);}
}
export async function onRequestPost(){return errorJson(405,"method-not-allowed");}
