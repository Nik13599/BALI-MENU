/* Public shell stays available while data arrives. Catalogs prefer a single
 * SDK read with a fast fallback for stalled downloads. This adapter is read-only. */
const collections=new Set(['promotions','events','menu','bar_menu','hookah_menu','tea_menu','mobileAboutBackgrounds']);
const documents=new Set(['settings/homeDesign','settings/homeInterface','settings/homeEventPlaceholder','settings/siteBuilderPublished']);
const cachedCollections=new Set(['menu','bar_menu','hookah_menu','tea_menu']);
const requests=new Map();
const config=()=>window.BALI_FIREBASE_CONFIG;
let sdkPromise;
const sdk=()=>sdkPromise??=Promise.all([
  import('https://www.gstatic.com/firebasejs/10.14.1/firebase-app.js'),
  import('https://www.gstatic.com/firebasejs/10.14.1/firebase-firestore.js')
]);

export const getApps=()=>config()?[{config:config()}]:[];
export const getApp=()=>({config:config()});
export const initializeApp=value=>({config:value});
export const getFirestore=app=>app;
export const collection=(_,path)=>({kind:'collection',path,filters:[]});
export const doc=(_, ...parts)=>({kind:'document',path:parts.join('/')});
export const where=(field,op,value)=>({field,op,value});
export const query=(ref,...filters)=>({...ref,filters});

function value(field){
  if('stringValue' in field)return field.stringValue;
  if('integerValue' in field)return Number(field.integerValue);
  if('doubleValue' in field)return Number(field.doubleValue);
  if('booleanValue' in field)return field.booleanValue;
  if('timestampValue' in field){
    const ms=Date.parse(field.timestampValue);
    return {seconds:Math.floor(ms/1000),nanoseconds:(ms%1000)*1e6,toDate:()=>new Date(ms),toMillis:()=>ms};
  }
  if('arrayValue' in field)return (field.arrayValue.values||[]).map(value);
  if('mapValue' in field)return fields(field.mapValue.fields);
  return null;
}
const fields=data=>Object.fromEntries(Object.entries(data||{}).map(([key,item])=>[key,value(item)]));
function snapshot(ref,rows){
  const docs=rows.map(row=>({id:row.name.split('/').at(-1),data:()=>fields(row.fields)}));
  const metadata={fromCache:false,hasPendingWrites:false};
  return ref.kind==='collection'?{docs,metadata}:{id:ref.path.split('/').at(-1),exists:()=>docs.length>0,data:()=>docs[0]?.data(),metadata};
}
function checked(ref){
  if(ref.kind==='document')return documents.has(ref.path);
  if(!collections.has(ref.path))return false;
  if(ref.filters?.some(f=>f.field!=='published'||f.op!=='=='||f.value!==true))return false;
  const restricted=['promotions','mobileAboutBackgrounds'].includes(ref.path);
  return !restricted||ref.filters?.some(f=>f.field==='published'&&f.op==='=='&&f.value===true);
}
const cacheKey=ref=>'bali-public-v1:'+config()?.projectId+':'+ref.path;
function cached(ref){
  if(!cachedCollections.has(ref.path))return null;
  try{
    const entry=JSON.parse(localStorage.getItem(cacheKey(ref))||'null');
    if(!entry||Date.now()-entry.at>300000||Date.now()<entry.at||!Array.isArray(entry.rows))return null;
    if(entry.sdkRows){
      const docs=entry.rows.map(row=>({id:row.id,data:()=>row.record}));
      return {docs,metadata:{fromCache:true,hasPendingWrites:false}};
    }
    return {...snapshot(ref,entry.rows),metadata:{fromCache:true,hasPendingWrites:false}};
  }catch{return null;}
}
function remember(ref,rows){
  if(!cachedCollections.has(ref.path))return;
  try{
    const text=JSON.stringify({at:Date.now(),rows});
    if(text.length<=500000)localStorage.setItem(cacheKey(ref),text);
  }catch{} // Storage restrictions must never prevent opening the menu.
}
function rememberLive(ref,result){
  if(!cachedCollections.has(ref.path)||result.metadata?.fromCache)return;
  try{
    const rows=result.docs.map(d=>({id:d.id,record:d.data()}));
    const text=JSON.stringify({at:Date.now(),sdkRows:true,rows});
    if(text.length<=500000)localStorage.setItem(cacheKey(ref),text);
  }catch{} // No storage privilege is needed for a guest to browse.
}

function read(ref){
  const key=JSON.stringify(ref);
  if(requests.has(key))return requests.get(key);
  const promise=(async()=>{
    if(!checked(ref)||!config()?.projectId||!config()?.apiKey)throw Error('Public source unavailable');
    const base='https://firestore.googleapis.com/v1/projects/'+encodeURIComponent(config().projectId)+'/databases/(default)/documents';
    const controller=new AbortController();
    const timer=setTimeout(()=>controller.abort(),10000);
    try{
      const query=ref.kind==='collection';
      const body=query?{structuredQuery:{from:[{collectionId:ref.path}],...(ref.filters?.length?{
        where:{fieldFilter:{field:{fieldPath:'published'},op:'EQUAL',value:{booleanValue:true}}}
      }:{})}}:undefined;
      const response=await fetch(base+(query?':runQuery':'/'+ref.path)+'?key='+encodeURIComponent(config().apiKey),{
        method:query?'POST':'GET',credentials:'omit',signal:controller.signal,
        priority:['promotions','events'].includes(ref.path)?'high':'low',
        ...(query?{headers:{'Content-Type':'application/json'},body:JSON.stringify(body)}:{})
      });
      if(!query&&response.status===404)return snapshot(ref,[]);
      if(!response.ok)throw Object.assign(Error('Public read failed'),{code:response.status===403?'permission-denied':'unavailable'});
      const result=await response.json();
      const rows=query?result.filter(item=>item.document).map(item=>item.document):[result];
      remember(ref,rows);
      return snapshot(ref,rows);
    }finally{clearTimeout(timer);}
  })();
  requests.set(key,promise);
  // Prefetch failures remain handled until a view subscribes.
  promise.catch(()=>{});
  return promise;
}

export function onSnapshot(ref,...args){
  const options=typeof args[0]==='function'?null:args.shift();
  const [notify,onError]=args;
  const catalog=cachedCollections.has(ref.path);
  const deliver=result=>{
    notify(result);
    if(result.metadata?.fromCache!==true)
      queueMicrotask(()=>window.dispatchEvent(new CustomEvent("bali:public-snapshot",{detail:{path:ref.path}})));
  };
  let active=true,serverLive=false,hasData=false,restFailed=catalog,sdkFailed=false,stop;
  let restStarted=false,sdkStarted=false,fallbackTimer;
  const fail=error=>{if(active&&!hasData&&restFailed&&sdkFailed)onError?.(error);};
  const initial=cached(ref);
  if(initial){hasData=true;queueMicrotask(()=>{if(active&&!serverLive)deliver(initial);});}
  const startRest=()=>{
    if(!active||restStarted)return;
    restStarted=true;restFailed=false;
    read(ref).then(result=>{
      if(active&&!serverLive){hasData=true;deliver(result);}
    }).catch(error=>{restFailed=true;fail(error);});
  };
  const sdkError=error=>{
    sdkFailed=true;
    if(catalog)startRest();
    fail(error);
  };
  const startLive=()=>{
    if(!active||sdkStarted)return;
    sdkStarted=true;
    // Normally each large catalog is read once by the SDK. Only a stalled SDK
    // download uses REST, so a slow CDN cannot leave the menu unavailable.
    if(catalog)fallbackTimer=setTimeout(startRest,750);
    sdk().then(([apps,store])=>{
      clearTimeout(fallbackTimer);
      if(!active)return;
      const app=apps.getApps().length?apps.getApp():apps.initializeApp(config());
      const db=store.getFirestore(app);
      let target=ref.kind==='document'?store.doc(db,...ref.path.split('/')):store.collection(db,ref.path);
      if(ref.filters?.length)target=store.query(target,...ref.filters.map(f=>store.where(f.field,f.op,f.value)));
      const next=result=>{
        if(!active)return;
        if(result.metadata?.fromCache!==true||result.metadata?.hasPendingWrites)serverLive=true;
        else if(hasData)return;
        hasData=true;rememberLive(ref,result);deliver(result);
      };
      stop=options?store.onSnapshot(target,options,next,sdkError):store.onSnapshot(target,next,sdkError);
    }).catch(sdkError);
  };
  if(!catalog)startRest();
  startLive();
  return ()=>{active=false;clearTimeout(fallbackTimer);stop?.();};
}

// These requests overlap HTML/CSS parsing and SDK downloads. No cached or
// shipped campaign is shown: deleted/unpublished offers stay deleted.
if(config()){
  read(query(collection(null,'promotions'),where('published','==',true)));
  read(collection(null,'events'));

}
