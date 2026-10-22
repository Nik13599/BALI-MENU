/* BALI PUBLIC CONTENT: Cloudflare-backed, read-only snapshots.
 * Static banners, event posters, menu prices and visual settings are read
 * through a short-lived CDN cache rather than from a Firebase live listener
 * for every visitor. Guest profiles, BALI ID and orders still use the
 * authenticated Firebase SDK in their separate modules.
 */
const collections=new Set(["promotions","events","menu","bar_menu","hookah_menu","tea_menu","mobileAboutBackgrounds"]);
const documents=new Set(["settings/homeDesign","settings/homeInterface","settings/homeEventPlaceholder","settings/siteBuilderPublished"]);
const cachedCollections=new Set(["menu","bar_menu","hookah_menu","tea_menu"]);
const inFlight=new Map();
const config=()=>window.BALI_FIREBASE_CONFIG;
let sdkPromise;
const sdk=()=>sdkPromise??=Promise.all([
  import("https://www.gstatic.com/firebasejs/10.14.1/firebase-app.js"),
  import("https://www.gstatic.com/firebasejs/10.14.1/firebase-firestore.js")
]);

export const getApps=()=>config()?[{config:config()}]:[];
export const getApp=()=>({config:config()});
export const initializeApp=value=>({config:value});
export const getFirestore=app=>app;
export const collection=(_,path)=>({kind:"collection",path,filters:[]});
export const doc=(_, ...parts)=>({kind:"document",path:parts.join("/")});
export const where=(field,op,value)=>({field,op,value});
export const query=(ref,...filters)=>({...ref,filters});

function value(field){
  if("stringValue" in field)return field.stringValue;
  if("integerValue" in field)return Number(field.integerValue);
  if("doubleValue" in field)return Number(field.doubleValue);
  if("booleanValue" in field)return field.booleanValue;
  if("timestampValue" in field){
    const ms=Date.parse(field.timestampValue);
    return {seconds:Math.floor(ms/1000),nanoseconds:(ms%1000)*1e6,toDate:()=>new Date(ms),toMillis:()=>ms};
  }
  if("arrayValue" in field)return (field.arrayValue.values||[]).map(value);
  if("mapValue" in field)return fields(field.mapValue.fields);
  return null;
}
const fields=data=>Object.fromEntries(Object.entries(data||{}).map(([key,item])=>[key,value(item)]));
function snapshot(ref,rows,fromCache=false){
  const docs=rows.map(row=>({
    id:row.name.split("/").at(-1),data:()=>fields(row.fields)
  }));
  const metadata={fromCache,hasPendingWrites:false};
  return ref.kind==="collection"?{docs,metadata}:{
    id:ref.path.split("/").at(-1),
    exists:()=>docs.length>0,
    data:()=>docs[0]?.data(),metadata
  };
}
function checked(ref){
  if(ref.kind==="document")return documents.has(ref.path);
  if(!collections.has(ref.path))return false;
  if(ref.filters?.some(f=>f.field!=="published"||f.op!=="=="||f.value!==true))return false;
  const restricted=["promotions","mobileAboutBackgrounds"].includes(ref.path);
  return !restricted||ref.filters?.some(f=>f.field==="published"&&f.op==="=="&&f.value===true);
}
const cacheKey=ref=>"bali-public-v2:"+config()?.projectId+":"+ref.path;
function cached(ref,{allowStale=false}={}){
  if(!cachedCollections.has(ref.path))return null;
  try{
    const entry=JSON.parse(localStorage.getItem(cacheKey(ref))||"null");
    const maxAge=allowStale?7*24*60*60*1000:120000;
    if(!entry||Date.now()-entry.at>maxAge||Date.now()<entry.at||
      !Array.isArray(entry.rows))return null;
    const docs=entry.rows.map(row=>({id:row.id,data:()=>row.record}));
    return {docs,metadata:{fromCache:true,hasPendingWrites:false}};
  }catch{return null;}
}
function remember(ref,result){
  if(!cachedCollections.has(ref.path)||result.metadata.fromCache)return;
  try{
    const rows=result.docs.map(d=>({id:d.id,record:d.data()}));
    const json=JSON.stringify({at:Date.now(),rows});
    if(json.length<500000)localStorage.setItem(cacheKey(ref),json);
  }catch{} // Local storage is optional and never affects ordering.
}
// Do not cache failed/denied responses. Share concurrent startup fetches
// and briefly reuse successful ones when multiple components request events.
async function read(ref,{fresh=false}={}){
  if(!checked(ref))throw Object.assign(Error("Public source unavailable"),{code:"permission-denied"});
  const key=JSON.stringify(ref);
  const existing=inFlight.get(key);
  if(existing&&Date.now()-existing.started<(fresh?500:12000))return existing.promise;
  const promise=(async()=>{
    const controller=new AbortController();
    const timeout=setTimeout(()=>controller.abort(),11000);
    try{
      const response=await fetch("/api/public-data?path="+encodeURIComponent(ref.path),{
        method:"GET",credentials:"omit",signal:controller.signal,
        headers:{Accept:"application/json"}
      });
      if(response.status===404||!response.headers.get("content-type")?.includes("application/json"))
        throw Object.assign(Error("Public cache endpoint unavailable"),{code:"edge-missing"});
      if(!response.ok){
        const data=await response.json().catch(()=>({}));
        throw Object.assign(Error("Public content temporarily unavailable"),{
          code:data.code==="resource-exhausted"?"resource-exhausted":"unavailable"
        });
      }
      const body=await response.json();
      if(!Array.isArray(body.documents))throw Error("Invalid public data response");
      return snapshot(ref,body.documents);
    }finally{clearTimeout(timeout);}
  })();
  inFlight.set(key,{started:Date.now(),promise});
  promise.catch(()=>inFlight.delete(key));
  return promise;
}

export function onSnapshot(ref,...args){
  const options=typeof args[0]==="function"?null:args.shift();
  const [notify,onError]=args;
  const send=result=>{
    notify(result);
    if(result.metadata?.fromCache!==true)
      queueMicrotask(()=>window.dispatchEvent(new CustomEvent("bali:public-snapshot",{
        detail:{path:ref.path}
      })));
  };
  let active=true,busy=false,unsubSdk=null,usingSdk=false,lastVersion="";
  const original=cached(ref);
  if(original)queueMicrotask(()=>{if(active&&!usingSdk)send(original);});
  const interval=ref.path==="events"||ref.path==="promotions"?45000:
    ref.path==="menu"?90000:120000;
  async function fallbackSdk(){
    if(!active||usingSdk)return;
    usingSdk=true;
    try{
      const [apps,store]=await sdk();
      if(!active)return;
      const app=apps.getApps().length?apps.getApp():apps.initializeApp(config());
      const db=store.getFirestore(app);
      let target=ref.kind==="document"
        ?store.doc(db,...ref.path.split("/")):store.collection(db,ref.path);
      if(ref.filters?.length)target=store.query(target,...ref.filters.map(f=>store.where(f.field,f.op,f.value)));
      // Fallback only for Pages deployments that lack the public function.
      unsubSdk=options?store.onSnapshot(target,options,send,onError):
        store.onSnapshot(target,send,onError);
    }catch(error){if(active)onError?.(error);}
  }
  async function poll(force=false){
    if(!active||busy||usingSdk||(document.hidden&&!force))return;
    busy=true;
    try{
      const result=await read(ref,{fresh:force});
      if(!active)return;
      // Prevent unnecessary repeated DOM changes, but always unlock startup.
      const version=JSON.stringify(result.docs?.map(d=>[d.id,d.data()])||
        [result.exists?.(),result.data?.()]);
      const changed=version!==lastVersion;
      lastVersion=version;
      if(changed||force){remember(ref,result);send(result);}
    }catch(error){
      if(!active)return;
      if(error.code==="edge-missing")await fallbackSdk();
      else {
        // During a public-data quota outage preserve the guest's last real
        // kitchen/bar catalog; never replace it with fake default content.
        const backup=cached(ref,{allowStale:true});
        if(backup&&!lastVersion){send(backup);lastVersion="saved-public-catalog";}
        else if(!backup&&!lastVersion)onError?.(error);
        // A temporary polling failure must never erase a successfully
        // displayed real poster, banner or menu catalog.
      }
    }finally{busy=false;}
  }
  void poll(true);
  const timer=setInterval(()=>{if(!document.hidden)void poll();},interval);
  const resumed=()=>{if(!document.hidden)void poll(true);};
  window.addEventListener("pageshow",resumed);
  window.addEventListener("focus",resumed);
  document.addEventListener("visibilitychange",resumed);
  return ()=>{
    active=false;clearInterval(timer);
    window.removeEventListener("pageshow",resumed);
    window.removeEventListener("focus",resumed);
    document.removeEventListener("visibilitychange",resumed);
    unsubSdk?.();
  };
}
// Prefetch authoritative event posters without showing shipped fake content.
if(config()){
  read(query(collection(null,"promotions"),where("published","==",true))).catch(()=>{});
  read(collection(null,"events")).catch(()=>{});
}
