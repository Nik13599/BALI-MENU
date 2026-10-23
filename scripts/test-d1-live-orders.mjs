import assert from "node:assert/strict";
import {DatabaseSync} from "node:sqlite";
import {readFileSync} from "node:fs";
const sqlite=new DatabaseSync(":memory:");
for(const file of ["0001_preorders.sql","0002_staff_status.sql","0004_live_preorder_receipts.sql"])
 sqlite.exec(readFileSync("cloudflare-pages/d1/migrations/"+file,"utf8"));
sqlite.prepare("INSERT INTO migration_state (id,source,status,record_count,updated_at_ms) VALUES (?,?,?,?,?)")
 .run("preorders","test-fixture","complete",0,Date.now());
const db={
 prepare(s){const q=sqlite.prepare(s);return {bind(...args){return {
  first:async()=>q.get(...args)||null,
  all:async()=>({results:q.all(...args)}),
  run:async()=>({meta:{changes:q.run(...args).changes}})
 }}}},
 async batch(statements){
  sqlite.exec("BEGIN IMMEDIATE");
  try{const results=[];for(const s of statements)results.push(await s.run());
   sqlite.exec("COMMIT");return results;
  }catch(e){sqlite.exec("ROLLBACK");throw e;}
 }
};
const menu={name:"projects/test/documents/menu/101",
 fields:{id:{integerValue:"101"},name:{stringValue:"Тестовое блюдо"},
 price:{integerValue:"19"},available:{booleanValue:true}}};
const ev={name:"projects/test/documents/events/2099-12-20",
 fields:{title:{stringValue:"Тестовое мероприятие"},
 date:{stringValue:"2099-12-20"},preorderEnabled:{booleanValue:true},
 closesAt:{timestampValue:"2099-12-21T03:00:00.000Z"}}};
const env={BALI_OPERATIONS_DB:db,BALI_PUBLIC_CONTENT:{
 async get(key){if(key.endsWith(":menu"))return {documents:[menu]};
  if(key.endsWith(":events"))return {documents:[ev]};
  return null;}
}};
const source=readFileSync("cloudflare-pages/functions/_lib/d1-orders.js","utf8");
const stub=String.raw