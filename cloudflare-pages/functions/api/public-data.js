/* BALI public-only Firestore snapshot cache.
 * Cloudflare Pages Functions route: GET /api/public-data?path=...
 *
 * Whitelist prevents this edge endpoint from exposing any customer, order,
 * privilege, token, admin or other private Firestore document.
 * Writes remain exclusively authenticated via the Firebase SDK.
 */
const PROJECT="bali-menu-5a48b";
const PUBLIC_API_KEY="AIzaSyAiGyt5O6x2V0pBNIJ2pOlXxXBgaYqzzUA";
const COLLECTIONS=new Set([
  "events","promotions","menu","bar_menu","hookah_menu","tea_menu",
  "mobileAboutBackgrounds"
]);
const DOCUMENTS=new Set([
  "settings/homeDesign","settings/homeInterface",
  "settings/homeEventPlaceholder","settings/siteBuilderPublished","settings/menuVisibility"
]);
const PUBLISHED_ONLY=new Set(["promotions","mobileAboutBackgrounds"]);
const TTL=path=>path==="events"||path==="promotions"?20:
  path==="menu"?30:path.startsWith("settings/")?30:60;
// Bounded KV age prevents permanent staleness if an administrator updates
// Firestore from an old browser that does not publish to Cloudflare.
// Historical images and events are retained; only public reads are cached.
// Refresh hot events less frequently to stay well inside the free KV
// write quota. Administrator publishing still refreshes immediately via KV;
// the edge cache TTL above bounds when new content becomes visible.
const MAX_KV_AGE_MS=path=>path==="events"||path==="promotions"?20*60*1000:
  path==="menu"?60*60*1000:6*60*60*1000;
const json=(body,status,headers={})=>new Response(JSON.stringify(body),{
  status,headers:{"Content-Type":"application/json; charset=utf-8",
    "X-Content-Type-Options":"nosniff",...headers}
});

export async function onRequestGet({request,waitUntil,env}){
  const input=new URL(request.url);
  const path=input.searchParams.get("path");
  if(typeof path!=="string"||path.length>100||
     !(COLLECTIONS.has(path)||DOCUMENTS.has(path))||
     [...input.searchParams.keys()].some(key=>key!=="path"))
    return json({error:"Invalid public content path"},400,{"Cache-Control":"no-store"});
  const ttl=TTL(path);
  const key=new Request(input.origin+"/api/public-data?path="+encodeURIComponent(path));
  const cache=caches.default;
  const cached=await cache.match(key);
  if(cached){
    const headers=new Headers(cached.headers);
    headers.set("X-BALI-Cache","HIT");
    return new Response(cached.body,{status:cached.status,headers});
  }
  // Strong separation: guests read published snapshots from Cloudflare KV.
  // Only a cold cache/migration miss may read Firestore; no private path exists
  // in this allowlist. Admin updates explicitly publish new snapshots.
  const kvKey="bali:public:v1:"+path;
  if(env?.BALI_PUBLIC_CONTENT){
    try{
      const mirror=await env.BALI_PUBLIC_CONTENT.get(kvKey,"json");
      if(mirror&&Array.isArray(mirror.documents)&&
         Number.isFinite(mirror.cachedAt)&&mirror.cachedAt<=Date.now()&&
         Date.now()-mirror.cachedAt<MAX_KV_AGE_MS(path)){
        const answer=json({documents:mirror.documents},200,{
          "Cache-Control":"public, max-age=0, s-maxage="+ttl,
          "X-BALI-Cache":"KV"
        });
        waitUntil(cache.put(key,answer.clone()));
        return answer;
      }
    }catch(_error){ /* Fall through safely when KV is unavailable. */ }
  }
  const base="https://firestore.googleapis.com/v1/projects/"+PROJECT+
    "/databases/(default)/documents";
  const coll=COLLECTIONS.has(path);
  const endpoint=base+(coll?":runQuery":"/"+path)+"?key="+PUBLIC_API_KEY;
  const params=coll?{structuredQuery:{
    from:[{collectionId:path}],
    ...(PUBLISHED_ONLY.has(path)?{where:{fieldFilter:{
      field:{fieldPath:"published"},op:"EQUAL",value:{booleanValue:true}
    }}}:{})
  }}:null;
  const controller=new AbortController();
  const timeout=setTimeout(()=>controller.abort(),8500);
  try{
    const upstream=await fetch(endpoint,{
      method:coll?"POST":"GET",signal:controller.signal,
      ...(coll?{headers:{"Content-Type":"application/json"},body:JSON.stringify(params)}:{})
    });
    // Missing settings docs are legitimate, but missing collections are not.
    let payload;
    if(!coll&&upstream.status===404){
      payload={documents:[]};
    }else if(!upstream.ok){
      const status=upstream.status===429?503:upstream.status===403?503:502;
      return json({error:"Public content is temporarily unavailable",code:upstream.status===429?"resource-exhausted":"unavailable"},
        status,{"Cache-Control":"no-store","Retry-After":"30"});
    }else{
      const upstreamData=await upstream.json();
      payload={documents:coll
        ?(Array.isArray(upstreamData)?upstreamData.filter(row=>row.document).map(row=>row.document):[])
        :[upstreamData]};
    }
    const response=json(payload,200,{
      "Cache-Control":"public, max-age=0, s-maxage="+ttl,
      "X-BALI-Cache":"MISS"
    });
    waitUntil(cache.put(key,response.clone()));
    if(env?.BALI_PUBLIC_CONTENT)waitUntil(
      env.BALI_PUBLIC_CONTENT.put(kvKey,JSON.stringify({...payload,cachedAt:Date.now()}))
        .catch(()=>{}) // A cache-write failure must not hide approved content.
    );
    return response;
  }catch(_error){
    return json({error:"Public content is temporarily unavailable",code:"unavailable"},503,
      {"Cache-Control":"no-store","Retry-After":"30"});
  }finally{clearTimeout(timeout);}
}
export async function onRequestPost(){
  return json({error:"Method not allowed"},405,{"Allow":"GET","Cache-Control":"no-store"});
}
