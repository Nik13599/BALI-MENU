import assert from "node:assert/strict";
import {readFile} from "node:fs/promises";
const edgeSource=await readFile("cloudflare-pages/functions/api/public-data.js","utf8");
const source="data:text/javascript;base64,"+Buffer.from(edgeSource).toString("base64");
const {onRequestGet,onRequest}=await import(source);
const stored=new Map();
globalThis.caches={default:{
  async match(key){return stored.get(key.url)?.clone()},
  async put(key,value){stored.set(key.url,value.clone())}
}};
const pending=[],waitUntil=promise=>pending.push(promise);
let upstreamCalls=0;
globalThis.fetch=async(url,opts)=>{
  upstreamCalls++;
  if(url.includes(":runQuery")){
    assert.equal(opts.method,"POST");
    const query=JSON.parse(opts.body).structuredQuery;
    if(["promotions","mobileAboutBackgrounds"].includes(query.from[0].collectionId))
      assert.equal(query.where.fieldFilter.field.fieldPath,"published");
    return new Response(JSON.stringify([{document:{
      name:"projects/bali-menu-5a48b/databases/(default)/documents/events/2026-10-23",
      fields:{title:{stringValue:"FRIDAY SESSION"},date:{stringValue:"2026-10-23"}}
    }}]),{status:200,headers:{"Content-Type":"application/json"}});
  }
  return new Response(JSON.stringify({name:"settings/homeDesign",fields:{aboutTitle:{stringValue:"BALI"}}}),{
    status:200,headers:{"Content-Type":"application/json"}});
};
const make=(path,extra="")=>({
  request:new Request("https://baliminsk.by/api/public-data?path="+encodeURIComponent(path)+extra),
  waitUntil
});
const a=await onRequestGet(make("events"));
assert.equal(a.status,200);
assert.equal(a.headers.get("X-BALI-Cache"),"MISS");
const data=await a.json();
assert.equal(data.documents.length,1);
await Promise.all(pending.splice(0));
const b=await onRequestGet(make("events"));
assert.equal(b.headers.get("X-BALI-Cache"),"HIT");
assert.equal(upstreamCalls,1);
const sensitive=["users","orders","guestPrivileges","admins","preorderStaff",
  "settings/admin","events/x/y"];
for(const name of sensitive){
  const response=await onRequestGet(make(name));
  assert.equal(response.status,400,name);
}
assert.equal((await onRequestGet(make("events","&another=evil"))).status,400);
assert.equal((await onRequest()).status,405);
const promo=await onRequestGet(make("promotions"));
assert.equal(promo.status,200);
await Promise.all(pending.splice(0));
const setting=await onRequestGet(make("settings/homeDesign"));
assert.equal(setting.status,200);
await Promise.all(pending.splice(0));
assert.equal(upstreamCalls,3);
// A billing or permission error must not be cached and must not spill data.
globalThis.fetch=async()=>{upstreamCalls++;return new Response("quota",{status:429});};
const q=await onRequestGet(make("menu"));
assert.equal(q.status,503);
assert.equal((await q.json()).code,"resource-exhausted");
assert.equal(stored.has("https://baliminsk.by/api/public-data?path=menu"),false);
const publicReader=await readFile("bali-public-reader.js","utf8");
assert(publicReader.includes('/api/public-data?path='));
assert(publicReader.includes('if(error.code==="edge-missing")await fallbackSdk()'));
assert(publicReader.includes('["settings/homeDesign"'));
console.log("BALI public edge cache: approved reads, CDN hit, filtered promotions, 403/429 safety, private data isolation PASS.");
