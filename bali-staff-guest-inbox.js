/* BALI STAFF live guest intake, separate from Firebase/D1 orders.
 * Staff auth is checked by Cloudflare; the browser never sees the KV binding.
 */
import {getApps,getApp,initializeApp} from "https://www.gstatic.com/firebasejs/10.14.1/firebase-app.js";
import {getAuth,onAuthStateChanged} from "https://www.gstatic.com/firebasejs/10.14.1/firebase-auth.js";
const app=getApps().length?getApp():initializeApp(window.BALI_FIREBASE_CONFIG);
const auth=getAuth(app);
let active=false,timer=null,loading=false,queue=[];
const publish=(state="ready")=>window.dispatchEvent(new CustomEvent("bali:staff-guest-orders",{
  detail:{orders:[...queue],state}
}));
async function bearer(){
  const user=auth.currentUser;
  if(!user)throw Error("Войдите в BALI STAFF.");
  return "Bearer "+await user.getIdToken();
}
export async function refresh(){
  if(!active||loading)return queue;
  loading=true;
  try{
    const response=await fetch("/api/staff-guest-preorders",{
      headers:{Authorization:await bearer()},cache:"no-store",credentials:"same-origin"
    });
    if(!response.ok)throw Error("Не удалось получить гостевые заявки (HTTP "+response.status+").");
    const result=await response.json();
    if(result.complete!==true||!Array.isArray(result.orders))throw Error("Гостевая очередь загружена не полностью.");
    queue=result.orders;
    publish();
    return queue;
  }catch(e){
    publish("error");
    throw e;
  }finally{loading=false;}
}
export async function setStatus(order,status){
  if(!active)throw Error("Сеанс сотрудника неактивен.");
  if(!["pending","confirmed","cancelled"].includes(status))throw Error("Недопустимый статус.");
  const response=await fetch("/api/staff-guest-preorders",{
    method:"PATCH",credentials:"same-origin",
    headers:{Authorization:await bearer(),"Content-Type":"application/json"},
    body:JSON.stringify({requestId:order.requestId,status})
  });
  if(!response.ok)throw Error("Не удалось изменить заявку (HTTP "+response.status+").");
  await refresh();
}
function stop(){
  active=false;
  clearInterval(timer);timer=null;
  queue=[];publish();
}
export function start(){
  stop();active=true;
  void refresh().catch(error=>console.warn("BALI guest intake:",error?.message));
  timer=setInterval(()=>{if(!document.hidden)void refresh().catch(()=>{});},45000);
}
window.BaliStaffGuestInbox={start,stop,refresh,setStatus,getOrders:()=>[...queue]};
onAuthStateChanged(auth,user=>{if(!user)stop();});
