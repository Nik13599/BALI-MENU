/* Browser-only BALI admin: publish public content to Cloudflare.
 * All editor state stays in the browser. Only a verified owner can ask
 * the Pages Function to copy a whitelisted Firestore snapshot to KV.
 * No guest/order/wallet records are sent to the public endpoint.
 */
import {getApp,getApps,initializeApp} from "https://www.gstatic.com/firebasejs/10.14.1/firebase-app.js";
import {getAuth} from "https://www.gstatic.com/firebasejs/10.14.1/firebase-auth.js";
const PATHS=Object.freeze([
  "events","promotions","menu","bar_menu","hookah_menu","tea_menu",
  "mobileAboutBackgrounds","settings/homeDesign","settings/homeInterface",
  "settings/homeEventPlaceholder","settings/siteBuilderPublished",
  "settings/menuVisibility","settings/appearance"
]);
const allowed=new Set(PATHS),pending=new Set();
let flushing=false,timer=null;
const status=()=>document.getElementById("baliPublicPublishStatus");
function message(text){const el=status();if(el)el.textContent=text;}
const app=getApps().length?getApp():initializeApp(window.BALI_FIREBASE_CONFIG);
const auth=getAuth(app);
async function send(path){
  const user=auth.currentUser;
  if(!user||!user.emailVerified)throw Error("Войдите в админку.");
  const token=await user.getIdToken();
  const r=await fetch("/api/publish-public",{
    method:"POST",credentials:"same-origin",
    headers:{"Content-Type":"application/json","Authorization":"Bearer "+token},
    body:JSON.stringify({path})
  });
  if(!r.ok)throw Error("Не удалось опубликовать "+path+" (HTTP "+r.status+")");
  return r.json();
}
async function flush(){
  if(flushing)return;
  flushing=true;
  const todo=[...pending];pending.clear();
  let updated=0;
  try{
    for(const path of todo){
      try{await send(path);updated++;}
      catch(error){message("Публичная копия не обновилась: "+error.message+
        ". Изменения в админке сохранены. Повторите публикацию.");}
    }
    if(updated===todo.length&&updated>0)message("Опубликовано в Cloudflare: "+updated+" разделов.");
  }finally{flushing=false;if(pending.size)timer=setTimeout(flush,1200);}
}
function queue(path){
  if(!allowed.has(path))return false;
  pending.add(path);
  clearTimeout(timer);
  timer=setTimeout(flush,1200);
  return true;
}
async function publishAll(){
  for(const path of PATHS)pending.add(path);
  clearTimeout(timer);
  await flush();
}
window.BaliPublicPublish={queue,publishAll};
document.getElementById("baliPublicPublishAll")?.addEventListener("click",()=>{
  const button=document.getElementById("baliPublicPublishAll");
  button.disabled=true;message("Обновляем публичные данные…");
  void publishAll().finally(()=>button.disabled=false);
});
