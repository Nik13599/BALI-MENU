/* BALI CARD BRSM director-only module. Privileges are verified in Functions. */
import {initializeApp,getApps,getApp} from "https://www.gstatic.com/firebasejs/10.14.1/firebase-app.js";
import {getAuth,GoogleAuthProvider,signInWithPopup,signOut,onAuthStateChanged} from "https://www.gstatic.com/firebasejs/10.14.1/firebase-auth.js";
import {getFunctions,httpsCallable} from "https://www.gstatic.com/firebasejs/10.14.1/firebase-functions.js";
const app=getApps().length?getApp():initializeApp(window.BALI_FIREBASE_CONFIG),auth=getAuth(app),fn=getFunctions(app,"europe-west1");
const names=["getBrsmAdminState","assignBrsmCard","createBrsmPromo","revokeBrsmPromo",
 "listBrsmEvents","createBrsmQrBatch","startBrsmDraw","reopenBrsmRegistration","callBrsmNumber","finishBrsmTie"];
const call=Object.fromEntries(names.map(name=>[name,httpsCallable(fn,name)]));
const $=id=>document.getElementById(id);
const error=e=>String(e?.message||e?.code||"Ошибка запроса").slice(0,230);
const status=(key,message)=>{document.querySelector('[data-status="'+key+'"]').textContent=message;};
let authorized=false,round=0,busy=false,chosenPromo="",draw=null;
async function run(name,args,key,fnSuccess){
 if(!authorized||busy)return;busy=true;status(key,"Проверяем и сохраняем на сервере...");
 try{const response=await call[name](args);await fnSuccess?.(response.data);status(key,"Готово.");}
 catch(e){status(key,error(e));}
 finally{busy=false;}
}
function switchPanel(panel){
 document.querySelectorAll("[data-panel]").forEach(btn=>btn.classList.toggle("selected",btn.dataset.panel===panel));
 document.querySelectorAll("[data-content]").forEach(section=>section.hidden=section.dataset.content!==panel);
}
document.querySelectorAll("[data-panel]").forEach(btn=>btn.addEventListener("click",()=>switchPanel(btn.dataset.panel)));
function updateDraw(state){
 const d=state?.draw||null;draw=d;
 $("brsmTicketCount").textContent=String(d?.participants||state?.ticketCount||0);
 $("brsmTarget").textContent=String(d?.threshold||5);
 const mode={live:"В эфире",finished:"Завершён",tiebreak:"Ничья"};
 $("brsmDrawMode").textContent=mode[d?.status]||"Не начат";
 const numbers=$("brsmDrawNumbers");numbers.replaceChildren();
 (d?.called||[]).forEach(n=>{const ball=document.createElement("span");ball.textContent=n;numbers.append(ball);});
 $("brsmWinner").textContent=d?.winnerNumber?"ПОБЕДИТЕЛЬ · BALI ID "+d.winnerNumber+" · "+(d.winnerName||""):"";
 $("brsmDrawStart").hidden=!!d&&["live","finished","tiebreak"].includes(d.status);
 $("brsmReopen").hidden=!state?.closed||!!d&&["live","finished","tiebreak"].includes(d.status);
 $("brsmDrawCall").hidden=d?.status!=="live";
 $("brsmDrawTie").hidden=d?.status!=="tiebreak";
 if(state?.closed&&!d)$("brsmDrawStart").textContent="Сформировать билеты после закрытия регистрации";
}
async function refresh(){
 if(!authorized)return;
 try{updateDraw((await call.getBrsmAdminState({})).data);}catch(e){status("lotto",error(e));}
}
async function loadEvents(){
 try{
  const events=(await call.listBrsmEvents({})).data?.events||[];
  const select=$("brsmEventSelect");select.replaceChildren();
  const first=document.createElement("option");first.value="";first.textContent=events.length?"Выберите вечеринку КОНТАКТ":"В календаре нет мероприятий КОНТАКТ";select.append(first);
  events.forEach(event=>{const opt=document.createElement("option");opt.value=event.id;opt.textContent=event.date+" · "+event.title;select.append(opt);});
 }catch(e){status("qr",error(e));}
}
onAuthStateChanged(auth,async user=>{
 const now=++round;authorized=false;$("brsmAdminWorkspace").hidden=true;$("brsmAdminLogin").hidden=false;
 if(!user){$("brsmAdminAuthStatus").textContent="Войдите через Google.";return;}
 if(!user.emailVerified){$("brsmAdminAuthStatus").textContent="Подтвердите email.";return;}
 $("brsmAdminAuthStatus").textContent="Проверяем полномочия директора...";
 try{
  const response=await call.getBrsmAdminState({});
  if(now!==round||auth.currentUser?.uid!==user.uid)return;
  authorized=true;$("brsmAdminWorkspace").hidden=false;$("brsmAdminLogin").hidden=true;
  updateDraw(response.data);void loadEvents();
 }catch(e){$("brsmAdminAuthStatus").textContent="Нет доступа директора или администратора: "+error(e);}
});
$("brsmAdminLoginButton").addEventListener("click",async()=>{try{await signInWithPopup(auth,new GoogleAuthProvider());}catch(e){$("brsmAdminAuthStatus").textContent=error(e);}});
$("brsmAdminLogout").addEventListener("click",()=>signOut(auth));
$("brsmAssignForm").addEventListener("submit",e=>{
 e.preventDefault();const form=new FormData(e.currentTarget),number=String(form.get("number")),active=form.get("active")==="true";
 if(!active&&!confirm("Отключить карту БРСМ? Посещения и лотерейный билет сохранятся для аудита."))return;
 void run("assignBrsmCard",{number,active},"card",data=>status("card",data.active?"Карта назначена: "+data.name+" · "+data.number:"Карта отключена · "+data.number));
});
$("brsmPromoCreate").addEventListener("submit",e=>{
 e.preventDefault();const form=new FormData(e.currentTarget);
 void run("createBrsmPromo",{maxUses:Number(form.get("maxUses")),days:Number(form.get("days"))},"promo",data=>{
  chosenPromo=data.code;$("brsmPromoResult").textContent=data.code;$("brsmCreatedPromo").hidden=false;
 });
});
$("brsmCopyPromo").addEventListener("click",async()=>{if(chosenPromo){try{await navigator.clipboard.writeText(chosenPromo);status("promo","Промокод скопирован.");}catch{status("promo","Скопируйте промокод вручную.");}}});
$("brsmPromoRevoke").addEventListener("submit",e=>{
 e.preventDefault();const code=new FormData(e.currentTarget).get("code");
 if(!confirm("Отключить промокод?"))return;
 void run("revokeBrsmPromo",{code},"promo");
});
$("brsmQrCreate").addEventListener("submit",e=>{
 e.preventDefault();const f=new FormData(e.currentTarget);
 void run("createBrsmQrBatch",{eventId:f.get("eventId"),count:Number(f.get("count"))},"qr",data=>{
  const list=$("brsmQrList");list.replaceChildren();const title=data.date+" · "+data.eventId;
  (data.records||[]).forEach((r,i)=>{
    const item=document.createElement("div");item.className="brsm-qr-item";
    const heading=document.createElement("strong");heading.textContent="КОНТАКТ · "+(i+1);
    const img=document.createElement("img");img.src=r.qr;img.alt="Разовый QR на вход";
    const info=document.createElement("small");info.textContent=title;
    const serial=document.createElement("small");serial.textContent=r.token;
    item.append(heading,img,info,serial);list.append(item);
  });$("brsmPrintQr").hidden=!data.records?.length;
 });
});
$("brsmPrintQr").addEventListener("click",()=>window.print());
$("brsmReopen").addEventListener("click",()=>{
 if(!confirm("Вернуть возможность принимать отметки КОНТАКТ? Только до начала лото."))return;
 void run("reopenBrsmRegistration",{},"lotto",refresh);
});
$("brsmDrawStart").addEventListener("click",()=>{
 if(!confirm("Внимание: выдача отметок закроется, билеты будут зафиксированы. Начать розыгрыш?"))return;
 void run("startBrsmDraw",{},"lotto",refresh);
});
$("brsmDrawCall").addEventListener("submit",e=>{
 e.preventDefault();const number=Number(new FormData(e.currentTarget).get("number"));
 if(draw?.called?.includes(number)){status("lotto","Номер уже был назван.");return;}
 void run("callBrsmNumber",{number},"lotto",async data=>{
  const f=$("brsmDrawCall");f.reset();
  await refresh();
  if(data.status==="finished")status("lotto","Победитель подтверждён сервером!");
  else if(data.status==="tiebreak")status("lotto","Полная ничья. Используйте утверждённую дополнительную жеребьёвку.");
 });
});
$("brsmDrawTie").addEventListener("click",()=>{
 if(!confirm("Произвести криптографическую жеребьёвку между участниками с полной ничьей? Это должно быть предусмотрено правилами акции."))return;
 void run("finishBrsmTie",{},"lotto",refresh);
});
$("brsmRefresh").addEventListener("click",refresh);
