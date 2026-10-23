import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {DatabaseSync} from 'node:sqlite';
const sql=new DatabaseSync(':memory:');
for(const migration of ['0001_preorders.sql','0002_staff_status.sql',
  '0004_live_preorder_receipts.sql','0009_preorder_staff_access.sql'])
  sql.exec(readFileSync('cloudflare-pages/d1/migrations/'+migration,'utf8'));
const uid='staff_fixture_01',email='staff+fixture01@staff.baliminsk.by';
sql.prepare('INSERT INTO preorder_staff_access VALUES (?,?,?,?,?,?)')
  .run(uid,email,'preorders',1,1,1);
sql.exec(readFileSync('cloudflare-pages/d1/migrations/0011_staff_role_authority.sql','utf8'));
assert.equal(sql.prepare('SELECT authority FROM preorder_staff_access').get().authority,'firestore');
sql.exec("UPDATE preorder_staff_access SET authority='d1'");
sql.exec("INSERT INTO migration_state(id,source,status,record_count,updated_at_ms) VALUES ('preorders','test','complete',0,1)");
sql.prepare(`INSERT INTO preorder_orders(id,event_id,event_date,event_title,order_number,
  customer_name,customer_phone,status,source,created_at_ms,updated_at_ms)
  VALUES (?,?,?,?,?,?,?,?,?,?,?)`)
  .run('order_fixture_01','event_fixture','2099-12-20','Test event',1,
    'Test guest','+375291234567','pending','guest',1,1);
const env={BALI_OPERATIONS_DB:{prepare(query){
  const stmt=sql.prepare(query);
  const bind=(args=[])=>({first:async()=>stmt.get(...args)||null,
    all:async()=>({results:stmt.all(...args)}),
    run:async()=>({meta:{changes:stmt.run(...args).changes}})});
  return {...bind(),bind:(...args)=>bind(args)};
}}};
let disabled=false,roleReads=0;
globalThis.fetch=async url=>{
  if(String(url).includes('identitytoolkit.googleapis.com'))
    return new Response(JSON.stringify({users:[{localId:uid,email,emailVerified:true,disabled}]}));
  roleReads++;
  return new Response(JSON.stringify({error:{status:'RESOURCE_EXHAUSTED'}}),{status:429});
};
const moduleUrl=source=>'data:text/javascript;base64,'+Buffer.from(source).toString('base64');
const authUrl=moduleUrl(readFileSync('cloudflare-pages/functions/_lib/staff-auth.js','utf8'));
const orderSource=readFileSync('cloudflare-pages/functions/_lib/d1-orders.js','utf8')
  .replace('from "./staff-auth.js"',`from "${authUrl}"`);
const {handleD1OrderAction}=await import(moduleUrl(orderSource));
const request=new Request('https://baliminsk.by/api/bali-v3');
const call=(action='staffRecentOrders',token='T'.repeat(128))=>
  handleD1OrderAction({action,token,payload:{}},request,env);
let result=await call();
assert.equal(result.status,200,JSON.stringify(result));
assert.equal(result.data.orders.length,1);
assert.equal(result.data.orders[0].id,'order_fixture_01');
assert.equal(roleReads,0,'Actual Staff queue must not depend on exhausted Firestore');
assert.equal((await call('staffClearExpiredOrders')).status,403);
assert.equal((await call('staffRecentOrders','invalid')).status,401);
sql.exec('UPDATE preorder_staff_access SET active=0');
assert.equal((await call()).status,403,'D1 revocation applies on the next request');
sql.exec('UPDATE preorder_staff_access SET active=1');
disabled=true;assert.equal((await call()).status,401,'Disabled Auth identity cannot use a D1 grant');
disabled=false;
sql.exec("UPDATE preorder_staff_access SET authority='firestore'");
assert.equal((await call()).status,503,'Legacy authority must fail closed under quota');
assert.equal(roleReads,1);
console.log('Staff login → live identity → explicit D1 role → real SQLite orders; quota, revocation, admin isolation PASS');
