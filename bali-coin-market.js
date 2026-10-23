/* Shared BALI COIN market for all BALI ID tiers, including BRSM.
 * Card balance stays in the existing Sheets journal. No browser-side balance writes.
 */
import {getApp,getApps,initializeApp} from "https://www.gstatic.com/firebasejs/10.14.1/firebase-app.js";
import {getAuth} from "https://www.gstatic.com/firebasejs/10.14.1/firebase-auth.js";
import {getFirestore,doc,getDoc} from "https://www.gstatic.com/firebasejs/10.14.1/firebase-firestore.js";
import {coinEnabled,coinRequest} from "./bali-coin-firebase-api.js";
const app=getApps().length?getApp():initializeApp(window.BALI_FIREBASE_CONFIG);
const auth=getAuth(app),db=getFirestore(app);
const $=id=>document.getElementById(id),money=n=>Number(n||0).toLocaleString("ru-RU")+" BALI COIN";
const unique=()=>{const b=new Uint8Array(16);crypto.getRandomValues(b);return [...b].map(x=>x.toString(16).padStart(2,"0")).join("")};
const pendingKey=kind=>"bali-coin-pending:"+String(auth.currentUser?.uid||"guest")+":"+kind;
const signature=value=>{
  let h=2166136261;
  for(const ch of value){h^=ch.charCodeAt(0);h=Math.imul(h,16777619);}
  return (h>>>0).toString(16);
};
// Reuse the same requestId after a timeout. Retrying a successful debit with a
// different ID could otherwise buy the same item twice.
function operationId(kind,details){
  const key=pendingKey(kind),fingerprint=signature(details);
  try{
    const previous=JSON.parse(sessionStorage.getItem(key)||"null");
    if(previous?.fingerprint===fingerprint&&/^[0-9a-f]{32}$/.test(previous.id))
      return previous.id;
  }catch{}
  const id=unique();
  try{sessionStorage.setItem(key,JSON.stringify({fingerprint,id}));}catch{}
  return id;
}
function clearOperation(kind){
  try{sessionStorage.removeItem(pendingKey(kind));}catch{}
}

const element=(tag,text,cls)=>{const el=document.createElement(tag);if(text!==undefined)el.textContent=text;if(cls)el.className=cls;return el;};
const box=element("dialog",undefined,"bali-coins-dialog");box.id="baliCoinMarketDialog";
box.innerHTML='<div class="coins-head"><strong>МЕНЮ ЗА BALI COIN</strong><button type="button" id="coinsRefresh" aria-label="Обновить баланс">⟳ Обновить</button><button type="button" id="coinsClose" aria-label="Закрыть">×</button></div><p id="coinsMarketBalance" class="coins-balance">Загрузка…</p><nav class="coins-tabs" aria-label="Разделы BALI COIN"></nav><section id="coinsMarketBody" class="coins-body" aria-live="polite"></section><p id="coinsMarketStatus" class="coins-message" role="status" aria-live="polite"></p>';
document.body.append(box);
const status=s=>{$("coinsMarketStatus").textContent=s};
let currentCampaign="",balance=null,tab="bar",loading=false,serial=0,items=[],vouchers=[],number="";
const titles={bar:"Бар",prize:"Призовые лоты",transfer:"Перевести",vouchers:"Мои покупки"};
function allowed(){
  if(!coinEnabled()){status("BALI COIN станет доступен после включения BALI API.");return false;}
  if(!auth.currentUser?.emailVerified||!window.BaliAuth?.isRegistered?.()){
    status("Войдите и активируйте свою BALI ID.");return false;
  }
  return true;
}
function paintTabs(){
  const nav=box.querySelector(".coins-tabs");nav.replaceChildren();
  for(const [id,label] of Object.entries(titles)){
    const btn=element("button",label,tab===id?"selected":"");
    btn.type="button";btn.addEventListener("click",()=>{tab=id;paintTabs();render()});
    nav.append(btn);
  }
}
async function reload(){
  const id=++serial;if(!allowed())return;
  status("Получаем актуальный баланс и позиции…");
  try{
    const [state,card]=await Promise.all([
      getDoc(doc(db,"brsmCampaignState","active")).catch(()=>null),
      coinRequest("card")
    ]);
    if(id!==serial||!box.open)return;
    currentCampaign=state?.exists()?state.data().campaignId:"";
    balance=card.card?.coinBalance;
    number=card.card?.number||"";
    if(!card.card?.activated)throw Error("Сначала активируйте личную BALI ID.");
    $("coinsMarketBalance").textContent="Баланс всех ваших карт: "+money(balance);
    if(currentCampaign){
      const [result,history]=await Promise.all([
        coinRequest("coinLots",{campaignId:currentCampaign}),
        coinRequest("coinVouchers")
      ]);
      if(id!==serial||!box.open)return;
      items=result.lots||[];vouchers=history.vouchers||[];
    }else{
      items=[];vouchers=(await coinRequest("coinVouchers")).vouchers||[];
    }
    status("");render();
  }catch(e){if(id===serial){status("Не удалось загрузить: "+(e.message||"Ошибка соединения"));render();}}
}
function render(){
  if(!box.open)return;
  const host=$("coinsMarketBody");host.replaceChildren();
  if(tab==="bar"||tab==="prize"){
    if(!currentCampaign){
      host.append(element("p","Специальное меню появится, когда администрация откроет кампанию BALI."));return;
    }
    const choices=items.filter(x=>(x.category||"prize")===tab);
    if(!choices.length)host.append(element("p",tab==="bar"?"Барное меню за баллы пока не открыто.":"Сейчас нет доступных призовых лотов."));
    for(const item of choices){
      const row=element("article",undefined,"coins-offer");
      const left=element("div");left.append(element("strong",item.name),
        element("small","Доступно: "+item.remaining+" · "+money(item.price)));
      const buy=element("button","Получить", "coins-buy");
      buy.type="button";buy.disabled=loading||item.remaining<1||balance<item.price;
      buy.addEventListener("click",async()=>{
        if(!confirm("Обменять "+money(item.price)+" на «"+item.name+"»?"))return;
        loading=true;render();status("Резервируем позицию и списываем баллы…");
        const requestId=operationId("redeem",currentCampaign+"|"+item.lotId+"|"+item.price);
        try{
          const {result}=await coinRequest("coinRedeemLot",{
            campaignId:currentCampaign,lotId:item.lotId,requestId
          });
          clearOperation("redeem");
          status("Покупка подтверждена. Покажите сотруднику код выдачи: "+result.voucher);
          tab="vouchers";paintTabs();publishBalance();
        }catch(e){status("Не удалось провести обмен: "+(e.message||"Ошибка"));}
        finally{loading=false;render();}
      });
      row.append(left,buy);host.append(row);
    }
  }else if(tab==="transfer"){
    const form=element("form",undefined,"coins-form");form.id="coinsTransferForm";
    form.innerHTML='<label>BALI ID получателя<input name="number" inputmode="numeric" pattern="[0-9]{6}" maxlength="6" placeholder="000001" required></label><label>Количество BALI COIN<input name="amount" type="number" min="1" max="1000000" step="1" required></label><label>Комментарий (необязательно)<input name="comment" maxlength="100" placeholder="Подарок другу"></label><button type="submit">Перевести баллы</button>';
    form.addEventListener("submit",async e=>{
      e.preventDefault();
      if(loading)return;
      const fields=new FormData(form),to=String(fields.get("number")),
        amount=Number(fields.get("amount")),comment=String(fields.get("comment")||"");
      if(to===number)return status("Нельзя отправить баллы на собственную BALI ID.");
      if(!Number.isInteger(amount)||amount<1||amount>balance)return status("Недостаточно баллов.");
      try{
        const {recipient}=await coinRequest("coinRecipient",{number:to});
        if(!confirm("Перевести "+money(amount)+" пользователю "+recipient.name+" (BALI ID "+to+")?"))return;
        loading=true;status("Выполняем защищённый перевод…");
        const {result}=await coinRequest("coinTransfer",{
          number:to,amount,comment,requestId:operationId("transfer",to+"|"+amount+"|"+comment)
        });
        clearOperation("transfer");
        status("Переведено "+money(amount)+". Новый баланс: "+money(result.balance));
        form.reset();publishBalance();
      }catch(e){status("Перевод не подтверждён: "+(e.message||"Ошибка"));}
      finally{loading=false;}
    });
    host.append(form);
  }else{
    if(!vouchers.length)host.append(element("p","Вы пока не обменивали BALI COIN на позиции."));
    for(const v of vouchers){
      const card=element("article",undefined,"coins-voucher");
      card.append(element("strong",v.name),
        element("small",money(v.price)+" · "+(v.status==="served"?"Выдано":"Ожидает выдачи")));
      const code=element("code",v.voucher);card.append(code);
      const copy=element("button","Скопировать код");
      copy.type="button";copy.addEventListener("click",async()=>{
        try{await navigator.clipboard.writeText(v.voucher);status("Код скопирован.");}
        catch{status("Выделите и скопируйте код из карточки.");}
      });
      card.append(copy);host.append(card);
    }
  }
}
const open=async()=>{
  tab="bar";paintTabs();box.showModal();
  if(!allowed()){
    $("coinsMarketBody").textContent="BALI COIN пока недоступен: проверьте вход и подключение сервера.";
    return;
  }
  void reload();
};
$("coinsRefresh").addEventListener("click",()=>void reload());
$("coinsClose").addEventListener("click",()=>box.close());
box.addEventListener("close",()=>{serial++;currentCampaign="";items=[];vouchers=[];});
box.addEventListener("click",e=>{if(e.target===box)box.close()});
window.BaliCoinMarket=Object.freeze({open,refresh:()=>box.open?reload():undefined});
function publishBalance(){
  // Refresh the original BALI ID card and the BRSM toolbar immediately.
  window.dispatchEvent(new CustomEvent("bali:coin-updated",{detail:{uid:auth.currentUser?.uid}}));
}
// One access point for ordinary cards and another for the alternate BRSM face.
const mainTools=document.querySelector("#baliIdSection .bali-id-page-tools");
if(mainTools){
  const btn=element("button","Меню за BALI COIN");btn.type="button";btn.id="baliCoinMarketOpen";
  btn.className="bali-id-coin-menu-button";btn.addEventListener("click",open);mainTools.append(btn);
}
const brsmToolbar=$("brsmGuestPanel")?.querySelector(".brsm-guest-toolbar");
if(brsmToolbar){
  const balanceBadge=element("span","— BALI COIN","brsm-coin-balance");
  balanceBadge.setAttribute("aria-label","Общий баланс BALI COIN");
  brsmToolbar.append(balanceBadge);
  let balanceSerial=0;
  async function refreshBrsmBalance(){
    const seq=++balanceSerial;
    if(!coinEnabled()||!auth.currentUser?.emailVerified){balanceBadge.textContent="— BALI COIN";return;}
    try{
      const {card}=await coinRequest("card");
      if(seq===balanceSerial)balanceBadge.textContent=money(card.coinBalance);
    }catch{if(seq===balanceSerial)balanceBadge.textContent="Баланс недоступен";}
  }
  window.addEventListener("bali:auth-state",()=>void refreshBrsmBalance());
  window.addEventListener("bali:coin-updated",()=>void refreshBrsmBalance());
  const btn=element("button","BALI COIN");btn.type="button";btn.id="brsmCoinMarketOpen";
  btn.addEventListener("click",open);brsmToolbar.append(btn);
}
window.addEventListener("bali:coin-updated",()=>{if(box.open)void reload()});
