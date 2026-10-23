import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
import {DatabaseSync} from "node:sqlite";
const db=new DatabaseSync(":memory:");
db.exec(readFileSync("cloudflare-pages/d1/migrations/0001_preorders.sql","utf8"));
const statements={
 order:db.prepare("INSERT INTO preorder_orders (id,event_id,event_date,event_title,order_number,customer_name,customer_phone,status,source,created_at_ms,updated_at_ms) VALUES (?,?,?,?,?,?,?,?,?,?,?)"),
 item:db.prepare("INSERT INTO preorder_items (order_id,menu_id,item_name,unit_price_minor,quantity) VALUES (?,?,?,?,?)")
};
db.exec("BEGIN");
for(let i=0;i<220;i++){
 const id="stress_order_"+String(i).padStart(4,"0");
 statements.order.run(id,"evt_stress","2099-12-20","NIGHT PARTY",i+1,"Test","+375291234567","pending","guest",1000+i,1000+i);
 for(let j=0;j<12;j++)
  statements.item.run(id,String(100+j),"Блюдо "+j,1250,1);
}
db.exec("COMMIT");
let largestBindCount=0,queries=0;
const adapter={
 prepare(sql){
  const stmt=db.prepare(sql);
  return {bind(...args){
   largestBindCount=Math.max(largestBindCount,args.length);
   assert(args.length<=100,"D1 parameter cap: oversized query");
   return {
    all:async()=>{queries++;return {results:stmt.all(...args)};},
    first:async()=>stmt.get(...args)||null
   };
  }};
 }
};
const file=readFileSync("cloudflare-pages/functions/_lib/d1-orders.js","utf8");
assert.match(file,/async function list\(db,/);
const exposed=file.replace(/^import \{authorizeStaff,authorizeUser\} from "\.\/staff-auth\.js";/m,
  "const authorizeStaff=async()=>({uid:'test_staff'}); const authorizeUser=async()=>({uid:'test_user'});")
 +"\nexport {list};\n";
const {list}=await import("data:text/javascript;base64,"+Buffer.from(exposed).toString("base64"));
try{
 const orders=await list(adapter,{date:"2099-12-20",eventId:"evt_stress",limit:500});
 assert.equal(orders.length,220,"Every order must be present");
 assert(orders.every(x=>x.items.length===12),"Every order must include all 12 items");
 assert(orders.every(x=>x.total===150),"Every total remains exact");
 assert(queries>=4,"Lines must load in multiple SQL batches");
 assert(largestBindCount<=100);
 const recent=await list(adapter,{limit:100});
 assert.equal(recent.length,100);
 assert(recent.every(x=>x.items.length===12));
 console.log("BALI D1 bulk Staff reading: 220 orders, 2640 line items, 100 recent, parameter cap PASS");
}finally{db.close();}
