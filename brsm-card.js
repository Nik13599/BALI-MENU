/* BALI CARD BRSM: active-campaign card with independently sealed tickets per round.
 * The existing BALI ID and BRSM membership profile are reused without a second account.
 */
import {initializeApp,getApps,getApp} from "https://www.gstatic.com/firebasejs/10.14.1/firebase-app.js";
import {getAuth,onAuthStateChanged} from "https://www.gstatic.com/firebasejs/10.14.1/firebase-auth.js";
import {getFirestore,doc,onSnapshot} from "https://www.gstatic.com/firebasejs/10.14.1/firebase-firestore.js";
import {getFunctions,httpsCallable} from "https://www.gstatic.com/firebasejs/10.14.1/firebase-functions.js";
import {coinEnabled,coinRequest} from "./bali-coin-firebase-api.js";
const app=getApps().length?getApp():initializeApp(window.BALI_FIREBASE_CONFIG);
const auth=getAuth(app),db=getFirestore(app),functions=getFunctions(app,"europe-west1");
const el=id=>document.getElementById(id),panel=el("brsmGuestPanel");
if(panel){
  const promo=httpsCallable(functions,"activateBrsmPromo");
  const claimOld=httpsCallable(functions,"claimBrsmVisit");
  const claimCampaign=httpsCallable(functions,"claimBrsmCampaignVisit");
  let card=null,campaign=null,entry=null,draw=null;
  let unsubs=[],roundListener=null,serial=0,flipped=false,mode=true,busy=false,roundIndex=0,roundKey="";
  const coinClaimPending=new Set();
  let claimSequence=0;
  const status=s=>{el("brsmGuestStatus").textContent=s;};
  const documentRef=(...p)=>doc(db,...p);
  const active=()=>card?.active===true;
  async function syncVisitCoins(){
    const uid=auth.currentUser?.uid, id=campaign?.id, visits=entry?.visits;
    if(!uid||!id||!Array.isArray(visits)||!active()||!coinEnabled())return;
    const generation=++claimSequence;
    for(const visit of visits){
      const eventId=visit.eventId, key="bali-coin-visit-v1:"+uid+":"+id+":"+eventId;
      if(localStorage.getItem(key)==="success"||coinClaimPending.has(key))continue;
      coinClaimPending.add(key);
      try{
        const response=await coinRequest("coinClaimVisit",{campaignId:id,eventId});
        if(auth.currentUser?.uid!==uid||generation!==claimSequence)continue;
        localStorage.setItem(key,"success");
        window.dispatchEvent(new CustomEvent("bali:coin-updated",{detail:{
          uid,campaignId:id,eventId,amount:response.result?.amount
        }}));
      }catch(error){
        // QR visit remains recorded. Points can be retried later or awarded by staff.
        if(generation===claimSequence&&auth.currentUser?.uid===uid)
          status("Посещение подтверждено. Начисление COIN можно повторить после настройки награды.");
      }finally{coinClaimPending.delete(key);}
    }
  }
  const currentTicket=()=>{
    if(!campaign||!entry?.tickets)return null;
    return entry.tickets.find(t=>t.id===campaign.rounds[roundIndex]?.id)||null;
  };
  const tokenFromInput=s=>{
    const raw=String(s||"").trim();
    if(/^[a-f0-9]{48}$/.test(raw))return {token:raw,kind:campaign?"campaign":"old"};
    try{
      const url=new URL(raw,location.origin);
      if(!["https://baliminsk.by","https://www.baliminsk.by",location.origin].includes(url.origin))
        return null;
      for(const [name,kind] of [["brsmCampaignVisit","campaign"],["brsmVisit","old"]]){
        const token=url.searchParams.get(name);
        if(token&&/^[a-f0-9]{48}$/.test(token))return {token,kind};
      }
    }catch{}
    return null;
  };
  // Keep a single extra draw listener only while the guest views a valid ticket.
  function updateDrawListener(){
    const roundId=campaign?.rounds?.[roundIndex]?.id;
    const need=Boolean(auth.currentUser?.emailVerified&&active()&&mode&&flipped&&
      campaign&&entry?.eligible&&roundId&&campaign.roundIndex>=roundIndex);
    const nextKey=need?campaign.id+"/"+roundId:"";
    if(nextKey===roundKey)return;
    roundListener?.();roundListener=null;roundKey=nextKey;draw=null;
    if(!nextKey)return;
    const current=serial;
    roundListener=onSnapshot(documentRef("brsmCampaigns",campaign.id,"rounds",roundId),snapshot=>{
      if(current!==serial)return;
      draw=snapshot.exists()?snapshot.data():null;
      render();
    },()=>{if(current===serial)status("Данные тиража временно недоступны.");});
  }
  const selector=document.createElement("div");selector.className="brsm-round-picker";selector.id="brsmRoundPicker";
  const label=document.createElement("label");label.textContent="Раунд: ";label.htmlFor="brsmRoundSelect";
  const roundSelect=document.createElement("select");roundSelect.id="brsmRoundSelect";label.append(roundSelect);
  selector.append(label);el("brsmFlip").append(selector);
  roundSelect.addEventListener("change",()=>{
    roundIndex=Number(roundSelect.value)||0;updateDrawListener();render();
  });
  function slotsAndNumbers(){
    const cfg=campaign,visits=cfg?(entry?.visits||[]):(card?.visits||[]);
    const required=cfg?.requiredVisits||3,maximum=cfg?.ticketSize||10;
    const host=panel.querySelector(".brsm-visits");
    if(host.children.length!==required){
      host.replaceChildren();
      for(let i=0;i<required;i++){
        const item=document.createElement("span");item.className="brsm-slot";
        const num=document.createElement("b"),label=document.createElement("small"),hint=document.createElement("em");
        label.textContent=(i+1)+"-я вечеринка";item.append(num,label,hint);host.append(item);
      }
    }
    for(const [i,item] of [...host.children].entries()){
      const v=visits[i];item.classList.toggle("done",Boolean(v));
      item.querySelector("b").textContent=v?"✓":String(i+1);
      item.querySelector("em").textContent=v?"Зачтено":"Ожидается";
      item.title=v?String(v.label||v.eventId):"Посещение пока не подтверждено";
    }
    const numberHost=panel.querySelector(".brsm-digits");
    if(numberHost.children.length!==maximum){
      numberHost.replaceChildren();
      for(let i=0;i<maximum;i++){
        const digit=document.createElement("span");digit.className="brsm-digit";
        numberHost.append(digit);
      }
    }
    const nums=cfg?currentTicket()?.numbers:card?.numbers;
    const issued=cfg?entry?.eligible===true:card?.eligible===true;
    for(const [i,item] of [...numberHost.children].entries()){
      const n=issued?nums?.[i]:null;
      item.textContent=n==null?"?":String(n).padStart(2,"0");
      item.classList.toggle("hit",n!=null&&Boolean(draw?.drawn?.includes(n)));
    }
    el("brsmBack").classList.toggle("brsm-expanded",required>3||maximum>10);
    el("brsmBack").style.setProperty("--brsm-visit-cols",String(Math.min(required,6)));
    el("brsmBack").style.setProperty("--brsm-number-cols",String(Math.min(maximum,6)));
    const count=visits.length;
    if(cfg){
      const round=cfg.rounds[roundIndex]||cfg.rounds[0];
      el("brsmBack").querySelector(".brsm-subtitle").textContent=
        required+" ВЕЧЕРИНКИ · "+maximum+" ЧИСЕЛ · "+round.prize;
      el("brsmBack").querySelector(".brsm-info").textContent=
        "РОЗЫГРЫШ "+cfg.title+" · ПРИЗ: "+round.prize;
      el("brsmBack").querySelector(".brsm-ticket strong").textContent=
        "РАУНД "+(roundIndex+1)+" · "+maximum+" ЧИСЕЛ";
      el("brsmTicketStatus").textContent=issued?
        (draw?.phase==="finished"?"Победитель Bali Card "+draw.winnerNumber:
        draw?.phase==="provisional"?"Ожидается подтверждение победителя":
        draw?.phase==="tie"?"Дополнительный жребий":
        draw?.drawn?.length?"Выпало "+draw.drawn.length+" из "+cfg.ballCount:"Билет на раунд готов"):
        "Посещения "+count+"/"+required+" · осталось "+Math.max(0,required-count);
    }else{
      el("brsmTicketStatus").textContent=issued?"Билет подготовлен":
        "Посещения "+count+"/3 · числа откроются после третьего входа";
    }
  }
  function render(){
    const authorized=Boolean(auth.currentUser?.emailVerified);
    panel.hidden=!authorized;
    el("brsmFlip").hidden=!active()||!mode;
    el("brsmSwitchCard").hidden=!active();
    el("brsmPromoForm").hidden=active();
    el("brsmVisitForm").hidden=!active()||Boolean(campaign&&campaign.status!=="open");
    panel.classList.toggle("brsm-open",active()&&mode);
    const standard=panel.parentElement?.querySelector(".bali-profile-card.bali-id-profile");
    const tools=panel.parentElement?.querySelector(".bali-id-page-tools");
    for(const node of [standard,tools]){
      if(!node)continue;
      if(active()&&mode)node.style.setProperty("display","none","important");
      else node.style.removeProperty("display");
    }
    el("brsmSwitchCard").textContent=mode?"Обычная Bali Card":"Показать карту BRSM";
    if(!active()){if(authorized)status("Карту BRSM можно получить у директора или по промокоду.");return;}
    el("brsmName").textContent=card?.name||"ГОСТЬ BALI";
    // The immutable Firebase BALI ID is shared by BRSM, COIN and privilege tiers.
    el("brsmNumber").textContent=String(card?.number||"").padStart(6,"0");
    selector.hidden=!campaign||campaign.rounds.length<=1;
    if(campaign){
      if(roundIndex>=campaign.rounds.length)roundIndex=0;
      if(roundSelect.options.length!==campaign.rounds.length){
        roundSelect.replaceChildren();
        campaign.rounds.forEach((r,i)=>roundSelect.append(new Option((i+1)+". "+r.prize,String(i))));
      }
      roundSelect.value=String(roundIndex);
    }
    slotsAndNumbers();
    el("brsmFront").hidden=flipped;el("brsmBack").hidden=!flipped;
  }
  function stop(){
    serial++;
    for(const off of unsubs)off();
    unsubs=[];
    roundListener?.();roundListener=null;roundKey="";
    card=null;campaign=null;entry=null;draw=null;flipped=false;mode=true;roundIndex=0;
    panel.hidden=true;panel.classList.remove("brsm-open");
    for(const node of [panel.parentElement?.querySelector(".bali-profile-card.bali-id-profile"),
      panel.parentElement?.querySelector(".bali-id-page-tools")])
      node?.style.removeProperty("display");
  }
  function watch(user){
    stop();if(!user?.emailVerified)return;
    const current=serial,uid=user.uid;
    unsubs.push(onSnapshot(documentRef("brsmCards",uid),snapshot=>{
      if(current!==serial)return;
      const had=active();card=snapshot.exists()?snapshot.data():null;
      if(active()&&!had){mode=true;flipped=false;}
      updateDrawListener();render();
    },()=>{if(current===serial)status("Карта временно недоступна.");}));
    // This small shared pointer lets a new campaign appear without page reload.
    unsubs.push(onSnapshot(documentRef("brsmCampaignState","active"),snapshot=>{
      if(current!==serial)return;
      const id=snapshot.exists()?snapshot.data().campaignId:null;
      if(id===campaign?.id)return;
      for(const off of unsubs.splice(2))off();
      roundListener?.();roundListener=null;roundKey="";draw=null;entry=null;
      campaign=null;roundIndex=0;roundSelect.replaceChildren();
      if(!id){render();return;}
      unsubs.push(onSnapshot(documentRef("brsmCampaigns",id),snap=>{
        if(current!==serial)return;
        campaign=snap.exists()?{id,...snap.data()}:null;
        updateDrawListener();render();void syncVisitCoins();
      },()=>status("Условия кампании временно недоступны.")));
      unsubs.push(onSnapshot(documentRef("brsmCampaigns",id,"entries",uid),snap=>{
        if(current!==serial)return;
        entry=snap.exists()?snap.data():null;
        updateDrawListener();render();void syncVisitCoins();
      },()=>status("Посещения кампании временно недоступны.")));
      render();
    },()=>status("Список кампаний временно недоступен.")));
    const url=new URL(location.href);
    const incoming=url.searchParams.get("brsmCampaignVisit")||url.searchParams.get("brsmVisit");
    if(incoming)el("brsmVisitToken").value=incoming;
    render();
  }
  async function submit(kind,value){
    if(busy)return;
    if(!auth.currentUser?.emailVerified||!window.BaliAuth?.isRegistered?.()){
      window.BaliAuth?.open?.();status("Сначала войдите в BALI и завершите регистрацию.");return;
    }
    busy=true;status("Проверяем на сервере…");
    try{
      if(kind==="promo"){
        await promo({code:value});status("Карта BRSM активирована.");
      }else{
        const parsed=tokenFromInput(value);
        if(!parsed)throw Error("Неверная ссылка или QR-код.");
        if(campaign&&parsed.kind!=="campaign")throw Error("Для этой кампании нужен новый QR-код.");
        const response=await (parsed.kind==="campaign"?claimCampaign:claimOld)({token:parsed.token});
        status("Посещение подтверждено: "+response.data.visits+"/"+(campaign?.requiredVisits||3));
        el("brsmVisitToken").value="";
        const url=new URL(location.href);
        url.searchParams.delete("brsmCampaignVisit");url.searchParams.delete("brsmVisit");
        history.replaceState(null,"",url.pathname+url.search+url.hash);
      }
    }catch(e){status(String(e.message||"Операция не выполнена.").slice(0,190));}
    finally{busy=false;}
  }
  el("brsmPromoForm").addEventListener("submit",e=>{
    e.preventDefault();void submit("promo",el("brsmPromoInput").value);
  });
  el("brsmVisitForm").addEventListener("submit",e=>{
    e.preventDefault();void submit("visit",el("brsmVisitToken").value);
  });
  for(const id of ["brsmFront","brsmBack"])
    el(id).addEventListener("click",()=>{flipped=!flipped;updateDrawListener();render();});
  el("brsmSwitchCard").addEventListener("click",()=>{
    mode=!mode;updateDrawListener();render();
  });
  onAuthStateChanged(auth,watch);
  window.addEventListener("bali:auth-state",()=>{if(auth.currentUser?.emailVerified)render();});
  window.addEventListener("bali:coin-updated",()=>{if(auth.currentUser?.emailVerified)render();});

}
