/* BALI public bundle: one edge request for every allowlisted guest snapshot.
 * Only menu, events, promotions and presentation settings. NEVER user/order data.
 * Administrator publication remains the sole way to refresh an existing KV snapshot.
 */
const PROJECT="bali-menu-5a48b";
const API_KEY="AIzaSyAiGyt5O6x2V0pBNIJ2pOlXxXBgaYqzzUA";
const COLLECTIONS=new Set(["events","promotions","menu","bar_menu","hookah_menu","tea_menu","mobileAboutBackgrounds"]);
const DOCUMENTS=new Set(["settings/homeDesign","settings/homeInterface",
  "settings/homeEventPlaceholder","settings/siteBuilderPublished",
  "settings/menuVisibility","settings/appearance"]);
const PATHS=[...COLLECTIONS,...DOCUMENTS];
const FILTERED=new Set(["promotions","mobileAboutBackgrounds"]);
const CACHE_SECONDS=120;
const BUNDLE_KEY="bali:public:bundle:v1";
const MAX_BUNDLE_BYTES=18000000;
const validBundle=record=>record&&typeof record==="object"&&
  record.sources&&typeof record.sources==="object"&&
  PATHS.every(path=>Array.isArray(record.sources[path]));
function json(value,status=200,extra={}){
  return new Response(JSON.stringify(value),{status,headers:{
    "Content-Type":"application/json; charset=utf-8",
    "X-Content-Type-Options":"nosniff",...extra
  }});
}
async function fromFirestore(path){
  const isCollection=COLLECTIONS.has(path);
  const base="https://firestore.googleapis.com/v1/projects/"+PROJECT+"/databases/(default)/documents";
  const url=base+(isCollection?":runQuery":"/"+path)+"?key="+API_KEY;
  const body=isCollection?JSON.stringify({structuredQuery:{
    from:[{collectionId:path}],
    ...(FILTERED.has(path)?{where:{fieldFilter:{
      field:{fieldPath:"published"},op:"EQUAL",value:{booleanValue:true}
    }}}:{})
  }}):undefined;
  const response=await fetch(url,{
    method:isCollection?"POST":"GET",
    ...(body?{headers:{"Content-Type":"application/json"},body}:{}),
    signal:AbortSignal.timeout(8500)
  });
  if(!isCollection&&response.status===404)return [];
  if(!response.ok)throw Error("public-source-unavailable");
  const raw=await response.json();
  if(isCollection){
    if(!Array.isArray(raw))throw Error("invalid-public-source");
    return raw.filter(row=>row?.document).map(row=>row.document);
  }
  if(!raw||typeof raw!=="object"||!raw.fields)throw Error("invalid-public-document");
  return [raw];
}
export async function onRequestGet({request,env,waitUntil}){
  const url=new URL(request.url);
  if(url.search||request.method!=="GET")
    return json({error:"invalid-request"},400,{"Cache-Control":"no-store"});
  const kv=env?.BALI_PUBLIC_CONTENT;
  if(!kv)return json({error:"public-snapshot-unavailable"},503,{"Cache-Control":"no-store"});
  const key=new Request(url.origin+"/api/public-bundle",{method:"GET"});
  const cache=caches.default;
  try{
    const saved=await cache.match(key);
    if(saved)return saved;
  }catch(_){/* Read-through KV is still safe if a cache colo is unavailable. */}
  try{
    // The aggregated KV object avoids thirteen KV reads on every cold colo.
    // Only trusted server-side publication may update the bundle.
    let aggregate=null;
    try{aggregate=await kv.get(BUNDLE_KEY,"json");}catch(_){}
    let sources;
    if(validBundle(aggregate))sources=aggregate.sources;
    else{
      const loaded=await Promise.allSettled(PATHS.map(async path=>{
        const storageKey="bali:public:v1:"+path;
        let record=null;
        try{record=await kv.get(storageKey,"json");}catch(_){/* Recover below. */}
        if(record&&Array.isArray(record.documents)&&Number.isFinite(record.cachedAt)
           &&record.cachedAt<=Date.now())return [path,record.documents];
        const documents=await fromFirestore(path);
        const encoded=JSON.stringify({documents,cachedAt:Date.now()});
        if(encoded.length<16000000)await kv.put(storageKey,encoded).catch(()=>{});
        return [path,documents];
      }));
      sources=Object.fromEntries(loaded.filter(row=>row.status==="fulfilled")
        .map(row=>row.value));
      // A partial bundle is safe; the browser falls back for missing paths.
      // Only complete, verified snapshots may be persisted as a shared bundle.
      if(PATHS.every(path=>Array.isArray(sources[path]))){
        const encoded=JSON.stringify({sources,cachedAt:Date.now()});
        if(encoded.length<MAX_BUNDLE_BYTES)await kv.put(BUNDLE_KEY,encoded).catch(()=>{});
      }
      if(!Object.keys(sources).length)throw Error("no-public-sources");
    }
    const response=json({sources},200,{
      "Cache-Control":"public, max-age=0, s-maxage="+CACHE_SECONDS,
      "X-BALI-Public":"bundle-v1"
    });
    try{
      const write=cache.put(key,response.clone());
      if(waitUntil)waitUntil(write.catch(()=>{}));
      else await write.catch(()=>{});
    }catch(_){/* Cache failure does not block the response. */}
    return response;
  }catch(_){
    // Do not cache incomplete content or substitute fabricated events/prices.
    return json({error:"public-snapshot-unavailable"},503,{
      "Cache-Control":"no-store","Retry-After":"30"
    });
  }
}
export async function onRequestPost(){
  return json({error:"method-not-allowed"},405,{"Allow":"GET","Cache-Control":"no-store"});
}
