/* Owner-only, read-only Cloudflare D1 migration audit.
 * The widget never migrates an order or switches the live database.
 */
import {getApps,getApp,initializeApp} from "https://www.gstatic.com/firebasejs/10.14.1/firebase-app.js";
import {getAuth} from "https://www.gstatic.com/firebasejs/10.14.1/firebase-auth.js";
const app=getApps().length?getApp():initializeApp(window.BALI_FIREBASE_CONFIG);
const auth=getAuth(app);
const trigger=document.getElementById("baliMigrationAuditButton");
const status=document.getElementById("baliMigrationAuditStatus");
const rows=document.getElementById("baliMigrationAuditResults");
trigger?.addEventListener("click",async()=>{
  if(!status||!rows||trigger.disabled)return;
  trigger.disabled=true;rows.hidden=true;rows.replaceChildren();
  status.textContent="Проверяем количество заказов в Firebase и D1…";
  try{
    const user=auth.currentUser;
    if(!user?.emailVerified)throw Error("Войдите под аккаунтом владельца.");
    const response=await fetch("/api/admin/preorder-migration-audit",{
      headers:{"Authorization":"Bearer "+await user.getIdToken()},
      credentials:"same-origin",cache:"no-store"
    });
    if(!response.ok)throw Error(response.status===403
      ?"Требуется активный доступ администратора."
      :"Проверка недоступна (HTTP "+response.status+").");
    const report=await response.json();
    if(report.cutoverAllowed!==false||report.activeBackend!=="firestore"||
       !Number.isSafeInteger(report.sourceOrders)||
       !Number.isSafeInteger(report.stagedOrders))
      throw Error("Некорректный ответ проверки.");
    const summary=[
      "Firebase: "+report.sourceOrders+" заказов",
      "Cloudflare D1: "+report.stagedOrders+" заказов",
      "Позиций блюд в D1: "+report.stagedItems,
      "Заказов без блюд: "+report.missingItems,
      "Ошибок счётчиков: "+report.brokenCounters
    ];
    for(const line of summary){
      const item=document.createElement("li");
      item.textContent=line;rows.append(item);
    }
    rows.hidden=false;
    status.textContent=report.countsMatch&&report.structureValid
      ?"Количество совпадает. Для переноса ещё нужна проверка каждого заказа. D1 не активирована."
      :"Перенос НЕ завершён. Активные заказы по-прежнему хранятся в Firebase.";
  }catch(e){
    status.textContent="Не удалось проверить миграцию: "+(e?.message||"ошибка связи");
  }finally{trigger.disabled=false;}
});
