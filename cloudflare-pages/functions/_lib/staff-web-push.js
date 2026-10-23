/* BALI STAFF Web Push transport. RFC 8291 + VAPID; no guest personal data. */
const enc=new TextEncoder();
const concat=(...parts)=>{
  const bytes=parts.map(p=>p instanceof Uint8Array?p:new Uint8Array(p));
  const out=new Uint8Array(bytes.reduce((n,a)=>n+a.length,0));
  let offset=0;for(const a of bytes){out.set(a,offset);offset+=a.length;}return out;
};
const encode=bytes=>btoa(Array.from(bytes,x=>String.fromCharCode(x)).join(""))
  .replace(/=/g,"").replace(/\+/g,"-").replace(/\//g,"_");
const decode=value=>{
  if(typeof value!=="string"||!/^[A-Za-z0-9_-]+$/.test(value))throw Error("invalid-key");
  const text=value.replace(/-/g,"+").replace(/_/g,"/");
  const raw=atob(text+"=".repeat((4-text.length%4)%4));
  return Uint8Array.from(raw,x=>x.charCodeAt(0));
};
async function hmac(key,data){
  const imported=await crypto.subtle.importKey("raw",key,{name:"HMAC",hash:"SHA-256"},false,["sign"]);
  return new Uint8Array(await crypto.subtle.sign("HMAC",imported,data));
}
const hkdfExpand=async(key,info,n)=>(await hmac(key,concat(info,new Uint8Array([1])))).slice(0,n);
const toHex=bytes=>Array.from(bytes,x=>x.toString(16).padStart(2,"0")).join("");
export async function subscriptionId(endpoint){
  return toHex(new Uint8Array(await crypto.subtle.digest("SHA-256",enc.encode(endpoint))));
}
export function validPushEndpoint(endpoint){
  if(typeof endpoint!=="string"||endpoint.length<40||endpoint.length>2048)return false;
  try{
    const u=new URL(endpoint);
    const h=u.hostname.toLowerCase();
    return u.protocol==="https:"&&!u.username&&!u.password&&!u.port&&
      (h==="fcm.googleapis.com"||h==="updates.push.services.mozilla.com"||
       h.endsWith(".push.apple.com")||h.endsWith(".notify.windows.com"));
  }catch{return false;}
}
export function validSubscription(sub){
  if(!sub||!validPushEndpoint(sub.endpoint)||!sub.keys)return false;
  try{return decode(sub.keys.p256dh).length===65&&decode(sub.keys.auth).length===16;}catch{return false;}
}
async function encryptedBody(p256dh,authSecret,payload){
  const receiver=decode(p256dh),secret=decode(authSecret);
  const ephemeral=await crypto.subtle.generateKey({name:"ECDH",namedCurve:"P-256"},true,["deriveBits"]);
  const sender=new Uint8Array(await crypto.subtle.exportKey("raw",ephemeral.publicKey));
  const receiverKey=await crypto.subtle.importKey("raw",receiver,{name:"ECDH",namedCurve:"P-256"},false,[]);
  const shared=new Uint8Array(await crypto.subtle.deriveBits({name:"ECDH",public:receiverKey},ephemeral.privateKey,256));
  const ikm=await hkdfExpand(await hmac(secret,shared),
    concat(enc.encode("WebPush: info\0"),receiver,sender),32);
  const salt=crypto.getRandomValues(new Uint8Array(16));
  const prk=await hmac(salt,ikm);
  const cek=await hkdfExpand(prk,enc.encode("Content-Encoding: aes128gcm\0"),16);
  const nonce=await hkdfExpand(prk,enc.encode("Content-Encoding: nonce\0"),12);
  const aes=await crypto.subtle.importKey("raw",cek,{name:"AES-GCM"},false,["encrypt"]);
  const plaintext=concat(enc.encode(JSON.stringify(payload)),new Uint8Array([2]));
  // This message is <256 bytes; use a single record with 4,096-byte maximum.
  if(plaintext.length>3900)throw Error("payload-too-large");
  const cipher=new Uint8Array(await crypto.subtle.encrypt({name:"AES-GCM",iv:nonce},aes,plaintext));
  const rs=new Uint8Array([0,0,16,0]); // 4,096
  return concat(salt,rs,new Uint8Array([sender.length]),sender,cipher);
}
async function vapid(env,endpoint){
  if(!env?.BALI_STAFF_VAPID_PRIVATE_JWK||!env?.BALI_STAFF_VAPID_PUBLIC)
    throw Error("web-push-unconfigured");
  const key=JSON.parse(env.BALI_STAFF_VAPID_PRIVATE_JWK);
  const imported=await crypto.subtle.importKey("jwk",key,{name:"ECDSA",namedCurve:"P-256"},false,["sign"]);
  const header=encode(enc.encode(JSON.stringify({typ:"JWT",alg:"ES256"})));
  const claim=encode(enc.encode(JSON.stringify({
    aud:new URL(endpoint).origin,exp:Math.floor(Date.now()/1000)+3600,
    sub:"https://baliminsk.by"
  })));
  const data=header+"."+claim;
  const signed=new Uint8Array(await crypto.subtle.sign({name:"ECDSA",hash:"SHA-256"},imported,enc.encode(data)));
  return "vapid t="+data+"."+encode(signed)+", k="+env.BALI_STAFF_VAPID_PUBLIC;
}
export async function sendPush(env,sub,orderId){
  if(!validSubscription({endpoint:sub.endpoint,keys:{p256dh:sub.p256dh,auth:sub.auth_secret}}))
    return {ok:false,expired:true};
  const body=await encryptedBody(sub.p256dh,sub.auth_secret,{orderId:String(orderId).slice(0,128)});
  const response=await fetch(sub.endpoint,{
    method:"POST",redirect:"error",signal:AbortSignal.timeout(9000),
    headers:{
      "Authorization":await vapid(env,sub.endpoint),
      "TTL":"3600","Urgency":"high",
      "Content-Encoding":"aes128gcm",
      "Content-Type":"application/octet-stream"
    },
    body
  });
  return {ok:response.ok,expired:response.status===404||response.status===410,status:response.status};
}
// Best-effort immediate delivery. D1 receipts ensure retries cannot duplicate
// notifications across simultaneous browser requests.
export async function notifyNewStaffOrder(env,order){
  const db=env?.BALI_OPERATIONS_DB;
  if(!db||!order?.id||!env.BALI_STAFF_VAPID_PRIVATE_JWK)return;
  const subscriptions=(await db.prepare(
    "SELECT s.id,s.employee_uid,s.endpoint,s.p256dh,s.auth_secret FROM staff_push_subscriptions s "+
    "LEFT JOIN preorder_staff_access a ON a.uid=s.employee_uid "+
    "WHERE a.uid IS NULL OR a.active=1 LIMIT 100"
  ).all()).results||[];
  await Promise.allSettled(subscriptions.map(async sub=>{
    const attempt=await db.prepare(
      "INSERT OR IGNORE INTO staff_push_receipts(order_id,subscription_id,created_at_ms) VALUES (?,?,?)"
    ).bind(order.id,sub.id,Date.now()).run();
    if(Number(attempt?.meta?.changes)!==1)return;
    try{
      const sent=await sendPush(env,sub,order.id);
      if(sent.expired){
        await db.prepare("DELETE FROM staff_push_subscriptions WHERE id=?").bind(sub.id).run();
        return;
      }
      if(!sent.ok)throw Error("push-service-rejected-"+sent.status);
    }catch(error){
      // Permit retry on next dispatch, but never retry within this request.
      await db.prepare("DELETE FROM staff_push_receipts WHERE order_id=? AND subscription_id=?")
        .bind(order.id,sub.id).run();
      console.error("BALI staff web push delivery failed",String(error?.message||"unknown").slice(0,90));
    }
  }));
}
