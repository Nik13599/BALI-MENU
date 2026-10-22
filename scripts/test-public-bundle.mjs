/* Regression tests for the single-request guest public bundle.
 * No network, billing, account credentials or live writes are involved.
 */
import assert from "node:assert/strict";
import {readFile} from "node:fs/promises";
const moduleAt=async file=>import("data:text/javascript;base64,"+
  Buffer.from(await readFile(file,"utf8")).toString("base64"));
const {onRequestGet}=await moduleAt("cloudflare-pages/functions/api/public-bundle.js");
const {onRequestPost:publish}=await moduleAt("cloudflare-pages/functions/api/publish-public.js");
const paths=[
  "events","promotions","menu","bar_menu","hookah_menu","tea_menu",
  "mobileAboutBackgrounds","settings/homeDesign","settings/homeInterface",
  "settings/homeEventPlaceholder","settings/siteBuilderPublished",
  "settings/menuVisibility","settings/appearance"
];
const rows=new Map(paths.map(p=>[p,{documents:[{
  name:"projects/demo/databases/(default)/documents/"+p+"/sample",
  fields:{title:{stringValue:p}}
}],cachedAt:Date.now()}]));
const store=new Map(paths.map(p=>["bali:public:v1:"+p,rows.get(p)]));
let kvGets=0,kvWrites=0,fetchCount=0,cacheMatches=0;
const kv={
  async get(key){kvGets++;return store.get(key)||null},
  async put(key,value){kvWrites++;store.set(key,JSON.parse(value))}
};
const edge=new Map();
globalThis.caches={default:{
  async match(key){cacheMatches++;return edge.get(key.url)?.clone()||null},
  async put(key,value){edge.set(key.url,value.clone())}
}};
globalThis.fetch=async()=>{fetchCount++;throw Error("Firestore must not be fetched for published public content")};
const waitUntil=p=>p;
const ctx=link=>({request:new Request(link),env:{BALI_PUBLIC_CONTENT:kv},waitUntil});
const url="https://baliminsk.by/api/public-bundle";
const first=await onRequestGet(ctx(url));
assert.equal(first.status,200);
const a=(await first.json()).sources;
assert.deepEqual(Object.keys(a).sort(),paths.slice().sort());
assert.equal(a.menu[0].fields.title.stringValue,"menu");
assert.equal(store.has("bali:public:bundle:v1"),true);
assert.equal(fetchCount,0);
assert.equal(kvGets,14); // 1 aggregate + 13 per-path on first cold bundle
const beforeGets=kvGets;
const hit=await onRequestGet(ctx(url));
assert.equal(hit.status,200);
assert.equal(kvGets,beforeGets,"Cloudflare Cache API must avoid KV reads");
edge.clear();
const aggregate=await onRequestGet(ctx(url));
assert.equal(aggregate.status,200);
assert.equal(kvGets,beforeGets+1,"Warm bundle uses exactly one KV read");
assert.equal(fetchCount,0);
assert.equal((await onRequestGet(ctx(url+"?orders=1"))).status,400);
assert.equal((await onRequestGet(ctx(url+"?path=admins"))).status,400);

// Authorized admin publication must also refresh the combined bundle.
const promoToken="A".repeat(180);
globalThis.fetch=async(target,options={})=>{
  fetchCount++;
  const loc=String(target);
  if(loc.includes("accounts:lookup"))
    return new Response(JSON.stringify({users:[{
      localId:"admin_UID_001",emailVerified:true,disabled:false
    }]}),{status:200});
  if(loc.includes("/admins/"))
    return new Response(JSON.stringify({fields:{active:{booleanValue:true}}}),{status:200});
  if(loc.includes(":runQuery"))
    return new Response(JSON.stringify([{document:{
      name:"projects/demo/databases/(default)/documents/menu/new",
      fields:{title:{stringValue:"Обновлённое меню"}}
    }}]),{status:200});
  throw Error("Unexpected upstream "+loc);
};
const publishRequest=new Request("https://baliminsk.by/api/publish-public",{
  method:"POST",headers:{"Origin":"https://baliminsk.by",
    "Authorization":"Bearer "+promoToken,
    "Content-Type":"application/json"},body:JSON.stringify({path:"menu"})
});
const published=await publish({request:publishRequest,env:{BALI_PUBLIC_CONTENT:kv}});
assert.equal(published.status,200);
assert.equal(store.get("bali:public:bundle:v1").sources.menu[0].fields.title.stringValue,
  "Обновлённое меню");
edge.clear();
const refreshed=await onRequestGet(ctx(url));
assert.equal((await refreshed.json()).sources.menu[0].fields.title.stringValue,"Обновлённое меню");
assert(kvWrites>=2,"Bundle and published content must persist in KV");
console.log("BALI bundle: one edge request, one warm KV read, complete public allowlist, admin publish refresh PASS");
