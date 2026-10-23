import {resolveBrsmGuest} from "./brsm-id-resolver.js";
/* Director console for successive configurable BRSM campaigns.
 * One active campaign at a time; completed campaigns remain queryable.
 */
import {getApp,getApps,initializeApp} from "https://www.gstatic.com/firebasejs/10.14.1/firebase-app.js";
import {getAuth,onAuthStateChanged} from "https://www.gstatic.com/firebasejs/10.14.1/firebase-auth.js";
import {getFirestore,doc,getDoc,onSnapshot} from "https://www.gstatic.com/firebasejs/10.14.1/firebase-firestore.js";
import {getFunctions,httpsCallable} from "https://www.gstatic.com/firebasejs/10.14.1/firebase-functions.js";
const app=getApps().length?getApp():initializeApp(window.BALI_FIREBASE_CONFIG);
const auth=getAuth(app),db=getFirestore(app),fn=getFunctions(app,"europe-west1");
const $=id=>document.getElementById(id);
const call=Object.fromEntries([
  "listBrsmCampaigns","createBrsmCampaign","updateBrsmCampaignDraft","activateBrsmCampaign",
  "archiveBrsmCampaign","addBrsmCampaignEvent","listBrsmCampaignEvents",
  "issueBrsmCampaignQrs","manualBrsmCampaignVisit","undoBrsmCampaignVisit",
  "beginBrsmCampaignRound","manageBrsmCampaignBall","getBrsmCampaignReport"
].map(name=>[name,httpsCallable(fn,name)]));
let authorized=false,selected=null,campaigns=[],activeId=null,roundState=null,unsub=null,busy=false,roundsLoaded=0;
function message(text){$("brsmCampaignInfo").textContent=text;}
function add(el,tag,text){const node=document.createElement(tag);node.textContent=text;el.append(node);return node;}
function current(){return campaigns.find(c=>c.id===selected);}
async function perform(name,data,refresh=true){
  if(!authorized||busy)return null;
  busy=true;message("Сохраняем изменения на сервере…");
  try{
    const x=(await call[name](data)).data;
    message("Сохранено на сервере.");
    return x;
  }catch(error){
    message("Не выполнено: "+String(error.message||error.code||error).slice(0,220));return null;
  }finally{
    busy=false;
    if(refresh)void reload();
  }
}
function dates(items){
  const nodes=[$("brsmCampaignEventSelect"),...document.querySelectorAll(".campaign-event-choice")];
  for(const select of nodes){
    select.replaceChildren(new Option("Выберите КОНТАКТ",""));
    for(const row of items)if(row.active)select.append(new Option(row.label+" · "+row.date,row.eventId));
  }
}
async function refreshEvents(){
  if(!selected)return dates([]);
  try{const {data}=await call.listBrsmCampaignEvents({campaignId:selected});dates(data.events||[]);}
  catch(e){message("Ошибка мероприятий: "+String(e.message).slice(0,120));}
}
function showRound(data){
  roundState=data;
  const cfg=current(),stage=$("brsmCampaignBalls");stage.replaceChildren();
  $("brsmCampaignStageTitle").textContent=cfg?.title||"КОНТАКТ · BRSM";
  if(!data){
    $("brsmCampaignStageInfo").textContent="Раунд ещё не начат";
    $("brsmCampaignWinner").textContent="";
  }else{
    $("brsmCampaignStageInfo").textContent="Приз: "+data.prize+" · Раунд "+(cfg.roundIndex+1)+"/"+cfg.rounds.length+
      " · "+data.drawn.length+" бочонков · порог "+data.target;
    for(const n of data.drawn)add(stage,"span",String(n));
    $("brsmCampaignWinner").textContent=data.winnerNumber
      ?(data.phase==="finished"?"ПОБЕДИТЕЛЬ · ":"ПРЕДВАРИТЕЛЬНЫЙ ПОБЕДИТЕЛЬ · ")+data.winnerNumber
      :data.phase==="tie"?"НИЧЬЯ · НУЖЕН ДОПОЛНИТЕЛЬНЫЙ ЖРЕБИЙ":"";
  }
  $("brsmCampaignTie").hidden=data?.phase!=="tie";
  $("brsmCampaignConfirm").hidden=data?.phase!=="provisional";
  $("brsmCampaignStartRound").disabled=!cfg||!["open","drawing"].includes(cfg.status)||
    ((cfg.roundIndex??-1)>=cfg.rounds.length-1)||Boolean(data&&data.phase!=="finished");
  $("brsmCampaignDrawForm").hidden=data?.phase!=="live";
  $("brsmCampaignUndoBall").disabled=!data?.drawn?.length||data?.phase==="finished";
}
function watchRound(){
  unsub?.();unsub=null;roundState=null;
  const cfg=current();
  if(!cfg||cfg.roundIndex<0){showRound(null);return;}
  unsub=onSnapshot(doc(db,"brsmCampaigns",selected,"rounds",cfg.rounds[cfg.roundIndex].id),
    snapshot=>showRound(snapshot.exists()?snapshot.data():null),
    error=>message("Подключение раунда: "+String(error.message).slice(0,100)));
}
function setForm(cfg){
  const form=$("brsmCampaignForm");
  const values=cfg||{title:"",requiredVisits:3,ballCount:90,ticketSize:10,winMatches:5,rounds:[{prize:"iPhone 18 Pro"}]};
  for(const name of ["title","requiredVisits","ballCount","ticketSize","winMatches"])
    form.elements.namedItem(name).value=values[name];
  form.elements.namedItem("prizes").value=values.rounds.map(r=>r.prize).join("\n");
  const allowed=!cfg||cfg.status==="draft";
  for(const input of form.querySelectorAll("input,textarea,button[type=submit]"))input.disabled=!allowed;
  $("brsmCampaignSave").textContent=cfg?.status==="draft"?"Сохранить условия черновика":"Создать кампанию";
}
function render(){
  const cfg=current();
  const select=$("brsmCampaignSelect");
  select.replaceChildren(new Option("Новая кампания",""));
  for(const x of campaigns)select.append(new Option(x.title+" · "+x.status+" · "+x.rounds.length+" раунд.",x.id));
  select.value=cfg?.id||"";
  setForm(cfg);
  $("brsmCampaignActivate").hidden=cfg?.status!=="draft";
  $("brsmCampaignArchive").hidden=cfg?.status!=="finished";
  $("brsmCampaignReport").hidden=!cfg||!["finished","archived"].includes(cfg.status);
  $("brsmCampaignOperations").hidden=!cfg||!["open","drawing","finished","archived"].includes(cfg.status);
  // Existing membership and promo sections are reused. Old single-draw operators are hidden
  // as soon as any campaign exists, preventing accidental issuance in the legacy draw.
  const legacy=document.querySelectorAll("#brsmWorkspace > .admin-grid > .box");
  legacy.forEach((node,i)=>node.hidden=campaigns.length>0&&i>=2);
  if($("brsmLiveStage"))$("brsmLiveStage").hidden=campaigns.length>0;
  if(cfg){
    $("brsmCampaignInfo").textContent=cfg.title+" · "+cfg.status+" · "+cfg.requiredVisits+
      " вход(а) · "+cfg.ballCount+" бочонков · билет "+cfg.ticketSize+" чисел · "+cfg.winMatches+
      " совпадений · "+cfg.rounds.length+" раунд(ов)";
    const host=$("brsmCampaignRounds");host.replaceChildren();
    cfg.rounds.forEach((r,i)=>add(host,"div","Раунд "+(i+1)+": "+r.prize));
    $("brsmCampaignDrawForm").elements.namedItem("number").max=cfg.ballCount;
  }else{
    $("brsmCampaignRounds").replaceChildren();
    message("Создайте новый черновик кампании.");
  }
  showRound(null);watchRound();
}
async function reload(preferred){
  if(!authorized)return;
  try{
    const {data}=await call.listBrsmCampaigns({});
    campaigns=data.campaigns||[];activeId=data.activeId;
    const target=preferred||selected||activeId;
    selected=campaigns.some(c=>c.id===target)?target:activeId||campaigns[0]?.id||null;
    render();await refreshEvents();
  }catch(e){message("Ошибка получения кампаний: "+String(e.message).slice(0,160));}
}
onAuthStateChanged(auth,async user=>{
  authorized=false;unsub?.();unsub=null;
  if(!user?.emailVerified)return;
  try{
    const [a,d]=await Promise.all([
      getDoc(doc(db,"admins",user.uid)),
      getDoc(doc(db,"staffRoles",user.uid))
    ]);
    if(auth.currentUser?.uid!==user.uid)return;
    authorized=(a.exists()&&a.data().active===true)||(d.exists()&&d.data().active===true&&d.data().role==="director");
    if(authorized)await reload();
  }catch(e){message("Нет доступа: "+String(e.message).slice(0,140));}
});
$("brsmCampaignSelect").addEventListener("change",e=>{
  selected=e.target.value||null;render();void refreshEvents();
});
$("brsmCampaignRefresh").addEventListener("click",()=>void reload());
$("brsmCampaignNew").addEventListener("click",()=>{
  selected=null;setForm(null);$("brsmCampaignSelect").value="";
  message("Введите условия нового розыгрыша. Старая кампания не изменится.");
});
$("brsmCampaignForm").addEventListener("submit",async e=>{
  e.preventDefault();const f=new FormData(e.currentTarget);
  const prizes=String(f.get("prizes")||"").split(/\r?\n/).map(x=>x.trim()).filter(Boolean);
  const payload={
    title:String(f.get("title")||""),requiredVisits:Number(f.get("requiredVisits")),
    ballCount:Number(f.get("ballCount")),ticketSize:Number(f.get("ticketSize")),
    winMatches:Number(f.get("winMatches")),prizes
  };
  const cfg=current();
  if(cfg?.status==="draft"){
    const x=await perform("updateBrsmCampaignDraft",{campaignId:cfg.id,...payload},false);
    if(x)await reload(cfg.id);
  }else{
    const x=await perform("createBrsmCampaign",payload,false);
    if(x)await reload(x.campaign.id);
  }
});
$("brsmCampaignActivate").addEventListener("click",async()=>{
  if(selected&&confirm("Начать регистрацию? Число посещений, призы и раунды станут неизменяемыми.")){
    const x=await perform("activateBrsmCampaign",{campaignId:selected},false);
    if(x)await reload(selected);
  }
});
$("brsmCampaignArchive").addEventListener("click",async()=>{
  if(selected&&confirm("Архивировать завершённую кампанию, сохранив данные?")){
    const x=await perform("archiveBrsmCampaign",{campaignId:selected},false);
    if(x)await reload(selected);
  }
});
$("brsmCampaignEventForm").addEventListener("submit",async e=>{
  e.preventDefault();if(!selected)return;
  const eventId=String(new FormData(e.currentTarget).get("eventId"));
  const x=await perform("addBrsmCampaignEvent",{campaignId:selected,eventId},false);
  if(x)await refreshEvents();
});
$("brsmCampaignQrForm").addEventListener("submit",async e=>{
  e.preventDefault();const eventId=$("brsmCampaignEventSelect").value;
  if(!selected||!eventId)return message("Выберите мероприятие.");
  const data=new FormData(e.currentTarget);
  const x=await perform("issueBrsmCampaignQrs",{
    campaignId:selected,eventId,count:Number(data.get("count")),hours:Number(data.get("hours"))
  },false);
  if(!x)return;
  const host=$("brsmCampaignPrintArea");host.replaceChildren();
  for(const [i,item] of x.items.entries()){
    const div=add(host,"div","","");div.className="ticket";
    add(div,"strong",eventId+" · QR "+(i+1));
    const img=document.createElement("img");img.src=item.qrDataUrl;img.alt="QR для входа";div.append(img);
    add(div,"small",item.url);
  }
  message("Создано "+x.items.length+" QR-кодов. Они отображаются только сейчас; сохраните или распечатайте.");
  $("brsmCampaignPrint").hidden=false;
});
$("brsmCampaignManualForm").addEventListener("submit",async e=>{
  e.preventDefault();if(!selected)return;const data=new FormData(e.currentTarget);
  if(!confirm("Засчитать посещение вручную?"))return;
  try{
    const card=await resolveBrsmGuest(data.get("number"));
    await perform("manualBrsmCampaignVisit",{campaignId:selected,...card,eventId:data.get("eventId")},false);
  }catch(err){message("Проверьте карту: "+String(err.message).slice(0,120));}
});
$("brsmCampaignUndoForm").addEventListener("submit",async e=>{
  e.preventDefault();if(!selected)return;const f=new FormData(e.currentTarget);
  if(!confirm("Аннулировать посещение и билет, если он уже сформирован?"))return;
  try{
    const card=await resolveBrsmGuest(f.get("number"));
    await perform("undoBrsmCampaignVisit",{campaignId:selected,...card,eventId:f.get("eventId"),reason:f.get("reason")},false);
  }catch(err){message("Проверьте карту: "+String(err.message).slice(0,120));}
});
$("brsmCampaignStartRound").addEventListener("click",async()=>{
  if(!selected||!confirm("Зафиксировать участников и открыть следующий раунд? После начала первого раунда новые входы запрещены."))return;
  const x=await perform("beginBrsmCampaignRound",{campaignId:selected},false);
  if(x)await reload(selected);
});
$("brsmCampaignDrawForm").addEventListener("submit",e=>{
  e.preventDefault();if(!selected)return;const form=e.currentTarget;
  const number=Number(new FormData(form).get("number"));
  void perform("manageBrsmCampaignBall",{campaignId:selected,action:"draw",number},false);
  form.reset();
});
$("brsmCampaignUndoBall").addEventListener("click",()=>{
  if(!selected)return;
  const reason=prompt("Почему нужно отменить последнее число?");
  if(reason?.trim().length>=5&&confirm("Убрать последний бочонок? Действие сохранится в журнале."))
    void perform("manageBrsmCampaignBall",{campaignId:selected,action:"undo",reason:reason.trim()},false);
});
$("brsmCampaignTie").addEventListener("click",()=>{
  if(selected&&confirm("Ничья после всех бочонков. Провести дополнительный жребий?"))
    void perform("manageBrsmCampaignBall",{campaignId:selected,action:"resolveTie"},false);
});
$("brsmCampaignConfirm").addEventListener("click",async()=>{
  if(!selected||!confirm("Подтвердить победителя текущего раунда? Его результат нельзя будет изменить."))return;
  const x=await perform("manageBrsmCampaignBall",{campaignId:selected,action:"finalize"},false);
  if(x)await reload(selected);
});
$("brsmCampaignStageFullscreen").addEventListener("click",async()=>{
  const stage=$("brsmCampaignStage");
  if(document.fullscreenElement)await document.exitFullscreen();
  else await stage.requestFullscreen();
});
$("brsmCampaignReport").addEventListener("click",async()=>{
  if(!selected||!authorized)return;
  message("Формируем протокол всех раундов…");
  try{
    const report=(await call.getBrsmCampaignReport({campaignId:selected})).data;
    const csv=[["Раунд","Приз","Bali Card","Числа","Совпадения","Победитель"].join(";")];
    const quote=x=>'"'+String(x??"").replace(/^[=+\-@]/,"'$&").replace(/"/g,'""')+'"';
    for(const round of report.rounds)for(const t of round.entries)csv.push([
      round.roundId,round.prize,t.number,t.numbers.join(" "),t.matches,
      String(t.number)===String(round.winnerNumber)?"ДА":"НЕТ"
    ].map(quote).join(";"));
    const download=(name,content,mime)=>{
      const url=URL.createObjectURL(new Blob([content],{type:mime})),a=document.createElement("a");
      a.href=url;a.download=name;document.body.append(a);a.click();a.remove();
      setTimeout(()=>URL.revokeObjectURL(url),20000);
    };
    download("BRSM_"+selected+".json",JSON.stringify(report,null,2),"application/json");
    download("BRSM_"+selected+".csv","\ufeff"+csv.join("\r\n"),"text/csv;charset=utf-8");
    message("Отчёт выгружен. "+report.rounds.length+" раундов, контрольная сумма "+report.sha256.slice(0,16)+"…");
  }catch(e){message("Не получилось получить протокол: "+String(e.message).slice(0,200));}
});
 
$("brsmCampaignPrint").addEventListener("click",()=>window.print());
