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
  "settings/homeEventPlaceholder","settings/siteBuilderPublished"
]);
const PUBLISHED_ONLY=new Set(["promotions","mobileAboutBackgrounds"]);
const TTL=path=>path==="events"||path==="promotions"?20:
  path==="menu"?30:path.startsWith("settings/")?30:60;
const json=(body,status,headers={})=>new Response(JSON.stringify(body),{
  status,headers:{"Content-Type":"application/json; charset=utf-8",
    "X-Content-Type-Options":"nosniff",...headers}
});

export async function onRequestGet({request,waitUntil}){
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
  if(cached)return new Response(cached.body,{
    status:cached.status,headers:{...Object.fromEntries(cached.headers),"X-BALI-Cache":"HIT"}
  });
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
    return response;
  }catch(_error){
    return json({error:"Public content is temporarily unavailable",code:"unavailable"},503,
      {"Cache-Control":"no-store","Retry-After":"30"});
  }finally{clearTimeout(timeout);}
}
export async function onRequest(){
  return json({error:"Method not allowed"},405,{"Allow":"GET","Cache-Control":"no-store"});
}
