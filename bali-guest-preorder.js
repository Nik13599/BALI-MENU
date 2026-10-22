/**
 * Guest BALI preorder client. No Google login and no Firebase/Firestore reads.
 * Loads free Cloudflare Turnstile ONLY on the checkout modal.
 */
let token="",widgetId=null,loading=null;
const ID="baliCheckoutTurnstile";
const storageKey="bali-guest-preorder-pending-v1";
const hex=bytes=>Array.from(bytes,x=>x.toString(16).padStart(2,"0")).join("");
function script(){
  if(window.turnstile?.render)return Promise.resolve(window.turnstile);
  if(loading)return loading;
  loading=new Promise((resolve,reject)=>{
    const element=document.createElement("script");
    element.src="https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit";
    element.async=true;element.defer=true;
    element.onload=()=>window.turnstile?.render?resolve(window.turnstile):reject(Error("Защита Cloudflare не запустилась."));
    element.onerror=()=>reject(Error("Не удалось загрузить проверку безопасности Cloudflare."));
    document.head.appendChild(element);
  }).catch(error=>{loading=null;throw error});
  return loading;
}
export async function prepare(){
  if(!window.BALI_GUEST_PREORDER_ENABLED)return;
  const sitekey=window.BALI_GUEST_TURNSTILE_SITEKEY;
  const root=document.getElementById(ID);
  if(!root||!/^0x[A-Za-z0-9_-]{15,}$/.test(String(sitekey||"")))
    throw Error("Защита гостевых предзаказов ещё не настроена.");
  root.hidden=false;
  const ts=await script();
  if(widgetId!==null)return;
  widgetId=ts.render(root,{sitekey,action:"guest_preorder",theme:"dark",
    callback:value=>{token=value||"";},
    "expired-callback":()=>{token="";},
    "error-callback":()=>{token="";}
  });
}
export function resetChallenge(){
  token="";
  if(widgetId!==null)try{window.turnstile?.reset(widgetId)}catch(_){}
}
export async function submit(payload){
  if(!window.BALI_GUEST_PREORDER_ENABLED)
    throw Object.assign(new Error("Гостевые предзаказы ещё не подключены."),{code:"not-configured"});
  if(!token)throw Object.assign(new Error("Дождитесь проверки безопасности Cloudflare."),{code:"turnstile-required"});
  const name=String(payload.customer_name||"").trim(),phone=String(payload.customer_phone||"").replace(/[\s()\-]/g,"");
  const tableNumber=String(payload.table_number||"").trim(),bookingId=String(payload.booking_id||"").trim();
  if(name.length<2||name.length>100||!/^(?:\+[1-9]\d{7,14})$/.test(phone))
    throw Error("Обязательно укажите имя и номер телефона в формате +375291234567.");
  if(!/^\d{4}-\d{2}-\d{2}$/.test(String(payload.event_date||""))||
    !String(payload.event_id||"").trim())
    throw Error("Выберите дату и название мероприятия.");
  if((!tableNumber&&!bookingId)||tableNumber.length>20||bookingId.length>60)
    throw Error("Введите ID брони / номер стола.");
  if(payload.privacyConsent!==true||payload.internationalConsent!==true)
    throw Error("Подтвердите согласие на обработку персональных данных.");
  if(!Array.isArray(payload.items)||payload.items.length<1||payload.items.length>12)
    throw Error("В корзине должно быть от 1 до 12 разных блюд.");
  const items=payload.items.map(x=>({id:Number(x.id),quantity:Number(x.quantity)}));
  if(items.some(x=>!Number.isSafeInteger(x.id)||x.id<=0||
    !Number.isInteger(x.quantity)||x.quantity<1||x.quantity>50)||
    new Set(items.map(x=>x.id)).size!==items.length)
    throw Error("В корзине указаны неверные количества блюд.");
  const data={eventDate:payload.event_date,eventId:payload.event_id,
    customerName:name,customerPhone:phone,tableNumber,bookingId,
    notes:String(payload.notes||"").slice(0,500),items,
    privacyConsent:true,internationalConsent:true};
  // Retry of the same order retains its ID to avoid duplicate rows if
  // the network fails after the backend committed the first request.
  const signature=JSON.stringify(data);
  let record=null;
  try{record=JSON.parse(sessionStorage.getItem(storageKey)||"null")}catch(_){}
  if(!record||record.signature!==signature||!/^[a-f0-9]{32}$/.test(record.requestId))
    record={signature,requestId:hex(crypto.getRandomValues(new Uint8Array(16)))};
  try{sessionStorage.setItem(storageKey,JSON.stringify(record))}catch(_){}
  const proof=token;token="";
  try{
    const authToken=await window.BaliAuth?.getIdToken?.().catch(()=>null);
    const res=await fetch("/api/bali-v3",{method:"POST",credentials:"same-origin",
      headers:{"Content-Type":"application/json"},body:JSON.stringify({
        action:"guestCreateOrder",token:authToken||"",turnstileToken:proof,
        payload:{...data,requestId:record.requestId}})});
    let body;
    try{body=await res.json()}catch{throw Error("Сервис предзаказов вернул неверный ответ.");}
    if(!res.ok||body?.ok!==true){
      const error=body?.error||{};
      throw Object.assign(new Error(error.message||"Предзаказ не отправлен."),{code:error.code||"upstream"});
    }
    const result=body.data?.order;
    if(!result?.id)throw Error("Сервер не подтвердил получение предзаказа.");
    try{sessionStorage.removeItem(storageKey)}catch(_){}
    return {success:true,order_id:result.id,order_number:result.orderNumber,
      event_title:payload.event_title||"",table_number:tableNumber,
      booking_id:bookingId,total:result.total};
  }finally{resetChallenge()}
}
