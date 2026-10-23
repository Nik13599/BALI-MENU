import {resolveBrsmGuest} from "./brsm-id-resolver.js";
/* Director/admin BRSM management. All writes go through callable server APIs. */
import {initializeApp,getApps,getApp} from "https://www.gstatic.com/firebasejs/10.14.1/firebase-app.js";
import {getAuth,GoogleAuthProvider,signInWithPopup,signInWithRedirect,getRedirectResult,signOut,onAuthStateChanged} from "https://www.gstatic.com/firebasejs/10.14.1/firebase-auth.js";
import {getFirestore,doc,getDoc,onSnapshot} from "https://www.gstatic.com/firebasejs/10.14.1/firebase-firestore.js";
import {getFunctions,httpsCallable} from "https://www.gstatic.com/firebasejs/10.14.1/firebase-functions.js";

const app=getApps().length?getApp():initializeApp(window.BALI_FIREBASE_CONFIG);
const auth=getAuth(app),db=getFirestore(app),fn=getFunctions(app,"europe-west1"),$=id=>document.getElementById(id);
const names=["manageBrsmCard","createBrsmPromo","createBrsmEvent","issueBrsmQrs","manualBrsmVisit","getBrsmCardAdmin","undoBrsmVisit","revokeBrsmQr","disableBrsmPromo","disableBrsmEvent","listBrsmAdmin","beginBrsmDraw","finalizeBrsmDraw","getBrsmDrawReport","updateBrsmDraw"];
const calls=Object.fromEntries(names.map(n=>[n,httpsCallable(fn,n)]));
let authorized=false,loading=false,watchDraw=null,authRound=0;
const status=s=>{$("brsmAdminStatus").textContent=s;};
const error=e=>String(e?.message||e?.code||"Сервер не ответил.").slice(0,200);
const add=(host,tag,text,cls)=>{const e=document.createElement(tag);e.textContent=text;if(cls)e.className=cls;host.append(e);return e;};
function setList(id,items){const host=$(id);host.replaceChildren();items.forEach(s=>add(host,"div",s));}
function formsSelect(id,events){const el=$(id);el.replaceChildren(new Option("Выберите мероприятие",""));events.forEach(v=>el.append(new Option(v.label+" · "+v.date,v.eventId)));}
function drawView(d){
  const balls=$("brsmDrawnBalls");balls.replaceChildren();
  if(!d){$("brsmDrawMeta").textContent="Розыгрыш не начат";$("brsmDrawWinner").textContent="";$("brsmTieDraw").hidden=true;$("brsmFinalizeDraw").hidden=true;$("brsmExportReport").disabled=true;return;}
  $("brsmDrawMeta").textContent="Участников: "+d.eligibleCount+" · чисел: "+d.drawn.length+
    " · порог: "+d.target+" · претендентов: "+d.contenderCount+" · "+d.phase;
  for(const n of d.drawn)add(balls,"span",String(n));
  $("brsmDrawWinner").textContent=d.winnerNumber?
    (d.phase==="provisional"?"ПРЕДВАРИТЕЛЬНЫЙ ПОБЕДИТЕЛЬ · BALI ID ":"ПОБЕДИТЕЛЬ · BALI ID ")+d.winnerNumber:
    d.phase==="tie"?"НИЧЬЯ · ДОПОЛНИТЕЛЬНЫЙ ЖРЕБИЙ":"";
  $("brsmTieDraw").hidden=d.phase!=="tie";
  $("brsmFinalizeDraw").hidden=d.phase!=="provisional";
  $("brsmBeginDraw").disabled=Boolean(d);
  $("brsmExportReport").disabled=d.phase!=="finished";
}
async function refresh(){
  if(!authorized||loading)return;
  loading=true;status("Загружаем данные…");
  try{
    const d=(await calls.listBrsmAdmin({})).data;
    formsSelect("brsmEventSelect",d.events);formsSelect("brsmManualEventSelect",d.events);formsSelect("brsmUndoEventSelect",d.events);
    setList("brsmEventsList",d.events.map(x=>x.label+" · "+x.date+" · "+x.eventId));
    setList("brsmPromosList",d.promos.map(x=>x.preview+" · "+x.used+"/"+x.maxUses+" активаций"));
    const tbody=$("brsmCardsTable");tbody.replaceChildren();
    d.cards.forEach(x=>{const tr=document.createElement("tr");
      for(const t of [x.number,x.name,x.visits+"/3",x.numbers.join(", ")||"Закрыт",x.active?"Активна":"Блокирована"])add(tr,"td",String(t));
      tbody.append(tr);
    });
    drawView(d.draw);
    status("Данные загружены.");
  }catch(e){status("Ошибка чтения: "+error(e));}
  finally{loading=false;}
}
async function action(name,payload,after=true){
  if(!authorized||loading)return;
  loading=true;status("Выполняем операцию…");
  try{const result=(await calls[name](payload)).data;status("Операция подтверждена сервером.");
    return result;
  }catch(e){status("Не выполнено: "+error(e));return null;}
  finally{loading=false;if(after)void refresh();}
}
onAuthStateChanged(auth,async user=>{
  const round=++authRound;authorized=false;watchDraw?.();watchDraw=null;
  $("brsmLogin").hidden=false;$("brsmWorkspace").hidden=true;$("brsmSignOut").hidden=true;
  if(!user){$("brsmAuthMessage").textContent="Войдите через Google.";return;}
  if(!user.emailVerified){$("brsmAuthMessage").textContent="Подтвердите email.";return;}
  $("brsmAuthMessage").textContent="Проверяем роль…";
  try{
    const [a,r]=await Promise.all([getDoc(doc(db,"admins",user.uid)),getDoc(doc(db,"staffRoles",user.uid))]);
    if(round!==authRound)return;
    authorized=a.exists()&&a.data().active===true||r.exists()&&r.data().active===true&&r.data().role==="director";
    if(!authorized){$("brsmAuthMessage").textContent="Нет прав директора или администратора.";return;}
    $("brsmLogin").hidden=true;$("brsmWorkspace").hidden=false;$("brsmSignOut").hidden=false;
    watchDraw=onSnapshot(doc(db,"brsmDraws","current"),d=>drawView(d.exists()?d.data():null));
    void refresh();
  }catch(e){if(round===authRound)$("brsmAuthMessage").textContent="Ошибка проверки роли: "+error(e);}
});
$("brsmSignIn").addEventListener("click",async()=>{
  const provider=new GoogleAuthProvider();
  try{await signInWithPopup(auth,provider);}
  catch(e){
    // iOS/Safari often block popup flows. Redirect works with the same Google account.
    if(["auth/popup-blocked","auth/operation-not-supported-in-this-environment"].includes(e.code)){
      try{await signInWithRedirect(auth,provider);}
      catch(redirectError){$("brsmAuthMessage").textContent=error(redirectError);}
    }else $("brsmAuthMessage").textContent=error(e);
  }
});
void getRedirectResult(auth).catch(e=>{
  $("brsmAuthMessage").textContent="Ошибка входа: "+error(e);
});
$("brsmSignOut").addEventListener("click",()=>signOut(auth));
$("brsmRefresh").addEventListener("click",()=>void refresh());
$("brsmFindCardForm").addEventListener("submit",async e=>{
  e.preventDefault();
  if(!authorized)return;
  const number=String(new FormData(e.currentTarget).get("number"));
  const target=$("brsmFoundCard");
  target.textContent="Поиск карты…";
  try{
    const resolved=await resolveBrsmGuest(number);
    const r=(await calls.getBrsmCardAdmin(resolved)).data.card;
    target.replaceChildren();
    add(target,"div","BALI ID "+r.number+" · "+r.name+" · "+(r.active?"Активна":"Заблокирована"));
    add(target,"div","Посещения: "+r.visits.length+"/3 · "+(r.eligible?"Билет выдан":"Билет пока не выдан"));
    for(const v of r.visits){
      const date=v.atMillis?new Date(v.atMillis).toLocaleString("ru-RU",{timeZone:"Europe/Minsk"}):"";
      add(target,"div","✓ "+v.label+" · "+v.eventId+" · "+date);
    }
    if(r.numbers.length)add(target,"div","Числа: "+r.numbers.join(", "));

  }catch(err){target.textContent="Не найдено: "+error(err);}
});
$("brsmManageForm").addEventListener("submit",async e=>{
  e.preventDefault();const f=new FormData(e.currentTarget),op=String(f.get("op"));
  if(op==="revoke"&&!confirm("Заблокировать карту?"))return;
  try{
    const resolved=await resolveBrsmGuest(f.get("number"));
    await action("manageBrsmCard",{...resolved,op});
  }catch(err){status("Проверьте BALI ID: "+error(err));}
});
$("brsmPromoCreateForm").addEventListener("submit",async e=>{
  e.preventDefault();const f=new FormData(e.currentTarget);
  const r=await action("createBrsmPromo",{maxUses:Number(f.get("maxUses")),days:Number(f.get("days"))});
  if(r)$("brsmNewPromo").textContent=r.code;
});
$("brsmEventCreateForm").addEventListener("submit",e=>{
  e.preventDefault();const f=new FormData(e.currentTarget);
  void action("createBrsmEvent",{eventId:String(f.get("eventId")),label:String(f.get("label")),date:String(f.get("date"))});
});
$("brsmQrCreateForm").addEventListener("submit",async e=>{
  e.preventDefault();const f=new FormData(e.currentTarget);
  const r=await action("issueBrsmQrs",{eventId:String(f.get("eventId")),count:Number(f.get("count")),hours:Number(f.get("hours"))},false);
  if(!r)return;
  const area=$("brsmPrintArea");area.replaceChildren();
  for(const [i,item] of r.items.entries()){
    const box=add(area,"div","","ticket");add(box,"b","КОНТАКТ · BRSM · "+r.eventId+" · "+(i+1));
    const img=document.createElement("img");img.src=item.qrDataUrl;img.alt="Одноразовый QR";box.append(img);
    add(box,"small",item.url);
  }
  $("brsmPrintQrs").disabled=false;status("Создано "+r.items.length+" одноразовых кодов. Распечатайте их.");
});
$("brsmPrintQrs").addEventListener("click",()=>window.print());
$("brsmQrDisableForm").addEventListener("submit",e=>{
  e.preventDefault();const token=String(new FormData(e.currentTarget).get("token"));
  if(confirm("Безвозвратно отключить неиспользованный QR?"))void action("revokeBrsmQr",{token});
});
$("brsmPromoDisableForm").addEventListener("submit",e=>{
  e.preventDefault();const code=String(new FormData(e.currentTarget).get("code"));
  if(confirm("Отключить промокод?"))void action("disableBrsmPromo",{code});
});
$("brsmEventDisableForm").addEventListener("submit",e=>{
  e.preventDefault();const eventId=String(new FormData(e.currentTarget).get("eventId"));
  if(confirm("Отключить мероприятие BRSM?"))void action("disableBrsmEvent",{eventId});
});
$("brsmManualForm").addEventListener("submit",async e=>{
  e.preventDefault();const f=new FormData(e.currentTarget);
  if(!confirm("Подтвердить посещение вручную?"))return;
  try{
    const resolved=await resolveBrsmGuest(f.get("number"));
    await action("manualBrsmVisit",{...resolved,eventId:String(f.get("eventId"))});
  }catch(err){status("Проверьте BALI ID: "+error(err));}
});
$("brsmUndoVisitForm").addEventListener("submit",async e=>{
  e.preventDefault();const f=new FormData(e.currentTarget);
  const number=String(f.get("number")),eventId=String(f.get("eventId")),reason=String(f.get("reason"));
  if(!confirm("Отменить посещение BRSM "+eventId+" гостю "+number+"? Если было три посещения, лотерейный билет аннулируется."))return;
  try{
    const resolved=await resolveBrsmGuest(number);
    await action("undoBrsmVisit",{...resolved,eventId,reason});
  }catch(err){status("Проверьте BALI ID: "+error(err));}
});
$("brsmBeginDraw").addEventListener("click",async()=>{
  if(confirm("Зафиксировать всех участников и запустить тираж? После этого нельзя выдавать карты или засчитывать посещения."))
    await action("beginBrsmDraw",{});
});
$("brsmDrawForm").addEventListener("submit",e=>{
  e.preventDefault();const f=new FormData(e.currentTarget);
  void action("updateBrsmDraw",{action:"draw",number:Number(f.get("number"))});
  e.currentTarget.reset();
});
$("brsmUndoDraw").addEventListener("click",()=>{
  const reason=window.prompt("Причина отмены последнего бочонка (не менее 5 символов):");
  if(reason?.trim().length>=5&&confirm("Убрать последний бочонок из тиража и записать исправление в журнал?"))
    void action("updateBrsmDraw",{action:"undo",reason:reason.trim()});
});
$("brsmTieDraw").addEventListener("click",()=>{if(confirm("Окончательное равенство. Провести отдельный случайный жребий среди оставшихся?"))void action("updateBrsmDraw",{action:"resolveTie"});});
// Export only completed rounds. Raw participant numbers remain restricted
// to authorized staff and are never included in public Firestore.
$("brsmFinalizeDraw").addEventListener("click",async()=>{
  if(!authorized)return;
  const confirmed=window.confirm(
    "Подтвердить победителя BALI ID и окончательно закрыть тираж? После этого числа нельзя исправить."
  );
  if(confirmed)await action("finalizeBrsmDraw",{});
});
$("brsmExportReport").addEventListener("click",async()=>{
  if(!authorized)return;
  const btn=$("brsmExportReport");btn.disabled=true;status("Формируем протокол завершённого тиража…");
  try{
    const report=(await calls.getBrsmDrawReport({})).data;
    const escaped=v=>{
      const value=String(v??"");
      // Avoid formula injection when a CSV is opened in Excel / Sheets.
      const protectedValue=/^[=+@\-\t\r]/.test(value)?"'"+value:value;
      return '"'+protectedValue.replace(/"/g,'""')+'"';
    };
    const lines=[["BALI ID","Числа билета","Совпадений","Победитель"].map(escaped).join(",")];
    for(const p of report.participants){
      lines.push([p.number,p.numbers.join(" "),p.matches,p.winner?"ДА":"НЕТ"].map(escaped).join(","));
    }
    lines.push("",["ВЫПАВШИЕ ЧИСЛА",report.numbersDrawn.join(" ")].map(escaped).join(","));
    lines.push(["ПОБЕДИТЕЛЬ",report.winnerNumber].map(escaped).join(","));
    lines.push(["КОНТРОЛЬНАЯ СУММА SHA256",report.sha256].map(escaped).join(","));
    lines.push("",["ДЕЙСТВИЕ","НОМЕР","СОТРУДНИК","ПРИЧИНА","ВРЕМЯ (МИНСК)"].map(escaped).join(","));
    for(const x of report.audit){
      const when=x.atMillis?new Date(x.atMillis).toLocaleString("ru-RU",{timeZone:"Europe/Minsk"}):"";
      lines.push([x.action,x.number,x.by,x.reason,when].map(escaped).join(","));
    }
    const store=(filename,content,type)=>{
      const url=URL.createObjectURL(new Blob([content],{type}));
      const link=document.createElement("a");link.href=url;link.download=filename;
      document.body.append(link);link.click();link.remove();
      setTimeout(()=>URL.revokeObjectURL(url),60000);
    };
    const stamp=new Date().toISOString().slice(0,10);
    store("BALI_BRSM_LOTTO_"+stamp+".csv","\ufeff"+lines.join("\r\n"),"text/csv;charset=utf-8");
    store("BALI_BRSM_LOTTO_"+stamp+".json",JSON.stringify(report,null,2),"application/json");
    status("Протокол завершённого тиража выгружен: "+report.participantsCount+" участников.");
  }catch(e){status("Протокол недоступен: "+error(e));}
  finally{btn.disabled=false;}
});
$("brsmFullscreen").addEventListener("click",async()=>{
  const stage=$("brsmLiveStage");if(document.fullscreenElement)await document.exitFullscreen();
  else await stage.requestFullscreen();
});
