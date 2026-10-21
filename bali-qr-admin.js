/* QR inventory manager — staff-only callables, never writes wallets directly. */
import {initializeApp,getApps,getApp} from "https://www.gstatic.com/firebasejs/10.14.1/firebase-app.js";
import {getAuth,onAuthStateChanged} from "https://www.gstatic.com/firebasejs/10.14.1/firebase-auth.js";
import {getFunctions,httpsCallable} from "https://www.gstatic.com/firebasejs/10.14.1/firebase-functions.js";
const app=getApps().length?getApp():initializeApp(window.BALI_FIREBASE_CONFIG);
const auth=getAuth(app),fn=getFunctions(app,"europe-west1"),$=id=>document.getElementById(id);
const calls=Object.fromEntries(["listBaliBonusKinds","createBaliBonusKind","createBaliQrBatch","listBaliQrCodes","revokeBaliQrCode","issueBaliQuantity"].map(k=>[k,httpsCallable(fn,k)]));
const labels={credit:"Начисление",debit:"Списание",once:"Разовый",repeat:"Многоразовый"};
const create=(tag,cl,text)=>{let x=document.createElement(tag);if(cl)x.className=cl;if(text!=null)x.textContent=text;return x};
const errorText=e=>String(e?.message||e?.code||"Ошибка сервера").slice(0,220);
const status=(form,text)=>{form.querySelector("[data-bali-qr-status]").textContent=text};
const kinds=new Map([["entry","Бесплатные входы"],["shot","Шоты"],["cocktail","Коктейли"],["hookah","Кальяны"]]);
let loading=false,lastBatch=[];
function fillKinds(){
 for(const select of document.querySelectorAll('[data-bali-bonus-kind]')){
  const previous=select.value;select.replaceChildren();
  for(const [value,name] of kinds){const opt=create("option",null,name);opt.value=value;select.append(opt);}
  if(kinds.has(previous))select.value=previous;
 }
}
async function reloadKinds(){
 try{
  const out=(await calls.listBaliBonusKinds({})).data;
  if(Array.isArray(out?.kinds)){
   kinds.clear();
   for(const row of out.kinds)if(row?.id&&row?.name)kinds.set(row.id,row.name);
   fillKinds();
  }
 }catch(e){$("baliQrBatchInfo").textContent="Не удалось загрузить виды бонусов: "+errorText(e);}
}
async function loadList(){
 const host=$("baliQrManageList");host.textContent="Загружаем…";
 try{
  const out=(await calls.listBaliQrCodes({})).data;
  host.replaceChildren();
  for(const x of out.codes||[]){
   const row=create("div","bali-qr-manage-row"),meta=create("div"),desc=create("strong",null,(x.name||kinds.get(x.kind)||x.kind)+" · "+labels[x.action]+" · "+labels[x.mode]);
   const extra=create("small",null,(x.active?"АКТИВЕН":"ОТКЛЮЧЁН")+(x.used?" · ИСПОЛЬЗОВАН":"")+" · ×"+x.quantity+" · использований: "+(x.uses||0));
   meta.append(desc,extra);row.append(meta);
   if(x.active&&!x.used){
    const revoke=create("button",null,"Отключить");revoke.type="button";revoke.addEventListener("click",async()=>{
     if(!confirm("Отключить этот QR-код? Уже распечатанные копии перестанут работать."))return;
     revoke.disabled=true;
     try{await calls.revokeBaliQrCode({code:x.code});await loadList();}catch(e){alert(errorText(e));revoke.disabled=false;}
    });row.append(revoke);
   }
   host.append(row);
  }
  if(!out.codes?.length)host.append(create("p","hint","Кодов пока нет."));
 }catch(e){host.textContent="Список недоступен: "+errorText(e);}
}
const createForm=$("baliQrCreateForm");
createForm?.elements.mode?.addEventListener("change",()=>{
 const repeated=createForm.elements.mode.value==="repeat";
 if(repeated){createForm.elements.count.value="1";createForm.elements.count.disabled=true;}
 else createForm.elements.count.disabled=false;
});
$("baliCreateBonusKindForm")?.addEventListener("submit",async event=>{
 event.preventDefault();
 const form=event.currentTarget,data=new FormData(form),button=form.querySelector("button[type=submit]");
 button.disabled=true;status(form,"Создаём новое направление…");
 try{
  const result=(await calls.createBaliBonusKind({kind:String(data.get("kind")||"").trim(),name:String(data.get("name")||"").trim(),emoji:String(data.get("emoji")||"").trim()})).data;
  if(!result?.ok)throw Error("Нет подтверждения.");
  await reloadKinds();form.reset();status(form,"Направление создано. Можно генерировать QR-коды.");
 }catch(e){status(form,errorText(e));}finally{button.disabled=false}
});
createForm?.addEventListener("submit",async event=>{
 event.preventDefault();const form=event.currentTarget,button=form.querySelector("button[type=submit]");
 if(loading)return;const data=new FormData(form);
 const mode=String(data.get("mode")||"once");
 const params={kind:String(data.get("kind")),action:String(data.get("action")),mode,
   quantity:Number(data.get("quantity")),count:mode==="repeat"?1:Number(data.get("count")),
   cooldownSeconds:String(data.get("cooldownSeconds")||"").trim()===""?30:Number(data.get("cooldownSeconds"))};
 if(!Number.isInteger(params.quantity)||params.quantity<1||params.quantity>999||
    !Number.isInteger(params.count)||params.count<1||params.count>100){status(form,"Укажите количество 1–999 и пакет 1–100.");return;}
 if(!confirm("Создать "+params.count+" QR-кодов для "+kinds.get(params.kind)+"?"))return;
 loading=true;button.disabled=true;status(form,"Создаём QR-коды на сервере…");
 try{
  const response=(await calls.createBaliQrBatch(params)).data;
  if(!response?.ok||!Array.isArray(response.codes))throw Error("Нет подтверждения создания.");
  lastBatch=response.codes;
  const box=$("baliQrPrintArea");box.replaceChildren();
  for(const code of lastBatch){
   const card=create("div","bali-qr-print-ticket");
   card.append(create("strong",null,"BALI · "+labels[code.action]));
   card.append(create("span",null,code.name+" · "+labels[code.mode]+" ×"+code.quantity));
   const image=document.createElement("img");image.src=code.qrDataUrl;image.alt="QR-код BALI";card.append(image);
   card.append(create("span",null,code.mode==="once"?"Одноразовый код":"Многоразовый код"));
   box.append(card);
  }
  $("baliQrPrint").disabled=false;
  $("baliQrBatchInfo").textContent="Сгенерировано "+lastBatch.length+" QR-кодов. Можно отправить на печать.";
  status(form,"Коды созданы. Повторно показать для печати можно до перезагрузки страницы.");
  await loadList();
 }catch(e){status(form,errorText(e));}finally{loading=false;button.disabled=false}
});
$("baliQrPrint")?.addEventListener("click",()=>{if(lastBatch.length)window.print();});
$("baliQrRefreshList")?.addEventListener("click",()=>void loadList());
const grant=$("baliAdminBonusGrantForm");
grant?.addEventListener("submit",async event=>{
 event.preventDefault();const uid=$("baliPrivilegeGuestUid")?.value,data=new FormData(grant);
 const kind=String(data.get("kind")),quantity=Number(data.get("quantity")),reason=String(data.get("reason")||"").trim(),transferable=Boolean(data.get("transferable"));
 if(!uid||!kinds.has(kind)||!Number.isInteger(quantity)||quantity<1||quantity>999||reason.length<5){status(grant,"Выберите гостя, тип, количество и основание.");return;}
 if(!confirm("Начислить "+quantity+" "+kinds.get(kind)+" выбранному гостю?"))return;
 const button=grant.querySelector('button[type="submit"]');button.disabled=true;status(grant,"Начисляем…");
 try{const result=(await calls.issueBaliQuantity({uid,kind,quantity,transferable,reason})).data;
  if(!result?.ok)throw Error("Нет подтверждения сервера");
  status(grant,"Бонусы начислены. Баланс и история гостя обновятся.");
 }catch(e){status(grant,errorText(e));}finally{button.disabled=false}
});
onAuthStateChanged(auth,user=>{if(user?.emailVerified){void reloadKinds();void loadList();}});
