/* BALI: publish ONLY approved public content from Firestore into Cloudflare KV.
 * Called by the verified site administrator after editing. No private data,
 * client-provided documents or API secrets can be written to the public store.
 */
const PROJECT="bali-menu-5a48b",API_KEY="AIzaSyAiGyt5O6x2V0pBNIJ2pOlXxXBgaYqzzUA";
const COLLECTIONS=new Set(["events","promotions","menu","bar_menu","hookah_menu","tea_menu","mobileAboutBackgrounds"]);
const DOCUMENTS=new Set(["settings/homeDesign","settings/homeInterface","settings/homeEventPlaceholder","settings/siteBuilderPublished","settings/menuVisibility","settings/appearance"]);
const FILTERED=new Set(["promotions","mobileAboutBackgrounds"]);
const reply=(body,status)=>new Response(JSON.stringify(body),{status,headers:{
  "Content-Type":"application/json; charset=utf-8","Cache-Control":"no-store",
  "X-Content-Type-Options":"nosniff"}});
async function loadSource(path){
  const collection=COLLECTIONS.has(path);
  const base="https://firestore.googleapis.com/v1/projects/"+PROJECT+"/databases/(default)/documents";
  const endpoint=base+(collection?":runQuery":"/"+path)+"?key="+API_KEY;
  const body=collection?JSON.stringify({structuredQuery:{
    from:[{collectionId:path}],
    ...(FILTERED.has(path)?{where:{fieldFilter:{field:{fieldPath:"published"},op:"EQUAL",value:{booleanValue:true}}}}:{})
  }}):null;
  const r=await fetch(endpoint,{
    method:collection?"POST":"GET",
    ...(collection?{headers:{"Content-Type":"application/json"},body}:{}),
    signal:AbortSignal.timeout(9000)
  });
  if(!collection&&r.status===404)return {documents:[]};
  if(!r.ok)throw Error("Public source unavailable: HTTP "+r.status);
  const raw=await r.json();
  return {documents:collection
    ?(Array.isArray(raw)?raw.filter(x=>x.document).map(x=>x.document):[])
    :[raw]};
}
export async function onRequestPost({request,env}){
  if(!env?.BALI_PUBLIC_CONTENT)return reply({error:"Cloudflare public store not ready"},503);
  const origin=request.headers.get("Origin");
  if(origin&&origin!==new URL(request.url).origin)return reply({error:"Invalid origin"},403);
  const contentLength=Number(request.headers.get("Content-Length")||0);
  if(!Number.isFinite(contentLength)||contentLength>1024)return reply({error:"Invalid request"},413);
  const auth=request.headers.get("Authorization")||"";
  if(!/^Bearer [A-Za-z0-9_.-]{100,5000}$/.test(auth))return reply({error:"Unauthorized"},401);
  const token=auth.slice(7);
  let path;
  try{({path}=await request.json());}catch{return reply({error:"Invalid request"},400);}
  if(typeof path!=="string"||!(COLLECTIONS.has(path)||DOCUMENTS.has(path)))
    return reply({error:"Invalid public source"},400);
  try{
    // 1. Firebase Authentication validates the signature and account status.
    const lookup=await fetch("https://identitytoolkit.googleapis.com/v1/accounts:lookup?key="+API_KEY,{
      method:"POST",headers:{"Content-Type":"application/json"},
      body:JSON.stringify({idToken:token}),signal:AbortSignal.timeout(7500)
    });
    if(!lookup.ok)return reply({error:"Unauthorized"},401);
    const identity=await lookup.json();
    const person=identity.users?.[0];
    if(!person||person.emailVerified!==true||person.disabled===true||
       typeof person.localId!=="string"||!/^[a-zA-Z0-9_-]{8,128}$/.test(person.localId))
       return reply({error:"Unauthorized"},401);
    // 2. Firestore evaluates Firestore Rules using the user token, not a service key.
    // Staff-only roles cannot access /admins/{uid}, so they cannot publish.
    const pathRef="https://firestore.googleapis.com/v1/projects/"+PROJECT+
      "/databases/(default)/documents/admins/"+encodeURIComponent(person.localId);
    const role=await fetch(pathRef,{
      headers:{Authorization:"Bearer "+token},signal:AbortSignal.timeout(7500)
    });
    if(!role.ok)return reply({error:"Administrator role required"},403);
    const roleData=await role.json();
    if(roleData.fields?.active?.booleanValue!==true)
      return reply({error:"Administrator role required"},403);
    // 3. Fetch from trusted Firestore only; the request contains path, NEVER data.
    const snapshot=await loadSource(path);
    // KV readers check freshness on every cache miss. Publishing must include
    // the same timestamp as the automatic Firestore cold-cache migration.
    const encoded=JSON.stringify({...snapshot,cachedAt:Date.now()});
    if(encoded.length>16000000)return reply({error:"Content too large for public KV snapshot"},413);
    await env.BALI_PUBLIC_CONTENT.put("bali:public:v1:"+path,encoded);
    // Do not expose stored content to the admin caller (may contain base64 images).
    // KV is eventually consistent, but browser CDN copies expire within 60sec.
    return reply({ok:true,path,count:snapshot.documents.length},200);
  }catch(_error){
    return reply({error:"Public publishing unavailable; previous content is preserved"},503);
  }
}
export async function onRequestGet(){
  return reply({error:"Method not allowed"},405);
}
