/* Standalone BALI STAFF push UI: opt-in only, never registers guest accounts. */
const $=id=>document.getElementById(id);
const button=$("staffNotifications");
const message=$("staffNotificationStatus");
let busy=false,registration=null;
const status=msg=>{if(message)message.textContent=msg;};
const supported=()=>Boolean("serviceWorker" in navigator&&"PushManager" in window&&
  "Notification" in window);
function update(enabled=false){
  if(!button)return;
  button.hidden=!window.BaliSheetsToken||!$("adminView")||$("adminView").hidden;
  button.disabled=busy||!supported();
  button.textContent=enabled?"🔕 Отключить уведомления":"🔔 Уведомления";
  button.setAttribute("aria-pressed",String(enabled));
}
async function getRegistration(){
  if(!registration)
    registration=await navigator.serviceWorker.register("/bali-staff-sw.js",{scope:"/preorders.html"});
  return registration;
}
async function activeSubscription(){
  const reg=await getRegistration();
  return reg.pushManager.getSubscription();
}
async function syncStatus(){
  if(!supported()){status("Для push-уведомлений установите BALI STAFF через Safari на экран «Домой» (iOS 16.4+).");update(false);return;}
  try{
    const sub=await activeSubscription();
    update(Boolean(sub));
    if(sub&&Notification.permission==="granted")status("Уведомления включены на этом устройстве.");
    else status("Нажмите «Уведомления», чтобы получать новые предзаказы.");
  }catch{status("Не удалось проверить разрешение на уведомления.");update(false);}
}
async function request(action,subscription){
  const token=await window.BaliSheetsToken?.();
  if(!token)throw Error("Сначала войдите в BALI STAFF.");
  const response=await fetch("/api/staff-push",{
    method:"POST",headers:{"Content-Type":"application/json"},
    credentials:"same-origin",body:JSON.stringify({action,token,subscription})
  });
  const data=await response.json();
  if(!response.ok||data.ok!==true)throw Error(data.message||"Сервер не принял подписку.");
}
const toArray=encoded=>{
  const base64=encoded.replace(/-/g,"+").replace(/_/g,"/");
  const data=atob(base64+"=".repeat((4-base64.length%4)%4));
  return Uint8Array.from(data,ch=>ch.charCodeAt(0));
};
button?.addEventListener("click",async()=>{
  if(busy||!supported())return;
  busy=true;button.disabled=true;
  try{
    // On iOS, permission prompts must be initiated before async fetch/register
    // operations can consume the user's activation gesture.
    if(Notification.permission==="default"){
      const granted=await Notification.requestPermission();
      if(granted!=="granted")throw Error("Разрешите уведомления в настройках iPhone.");
    }
    const reg=await getRegistration();
    const current=await reg.pushManager.getSubscription();
    if(current){
      await request("unsubscribe",current.toJSON());
      await current.unsubscribe();
      status("Уведомления отключены.");update(false);
      return;
    }
    // Request permission from this explicit button click only (required on iOS).
    if(Notification.permission!=="granted")
      throw Error("Уведомления запрещены в настройках устройства.");
    const configResponse=await fetch("/api/staff-push",{cache:"no-store"});
    const config=await configResponse.json();
    if(!configResponse.ok||!config.publicKey)throw Error("Уведомления ещё не настроены на сервере.");
    const sub=await reg.pushManager.subscribe({
      userVisibleOnly:true,applicationServerKey:toArray(config.publicKey)
    });
    try{await request("subscribe",sub.toJSON());}
    catch(error){await sub.unsubscribe().catch(()=>{});throw error;}
    status("Уведомления включены! Новые заказы будут приходить на телефон.");
    update(true);
  }catch(error){status(error?.message||"Не получилось включить уведомления.");}
  finally{busy=false;button.disabled=false;}
});
window.addEventListener("bali-staff-authorized",()=>void syncStatus());
window.addEventListener("bali-staff-signed-out",()=>{
  if(button)button.hidden=true;status("");
});
if(!supported())status("Для iPhone нужен установленный с Safari BALI STAFF.");
