/* BRSM campaign administrator: coin rewards and bar menu use the existing
 * Firebase BALI COIN ledger, never independent Firebase balances.
 */
import {getApp,getApps,initializeApp} from "https://www.gstatic.com/firebasejs/10.14.1/firebase-app.js";
import {getAuth,onAuthStateChanged} from "https://www.gstatic.com/firebasejs/10.14.1/firebase-auth.js";
import {coinEnabled,coinRequest} from "./bali-coin-firebase-api.js";
const app=getApps().length?getApp():initializeApp(window.BALI_FIREBASE_CONFIG);
const auth=getAuth(app);
const $=id=>document.getElementById(id);
const say=s=>{$("brsmCoinAdminStatus").textContent=s};
const nonce=()=>{const b=new Uint8Array(16);crypto.getRandomValues(b);return [...b].map(n=>n.toString(16).padStart(2,"0")).join("")};
let permitted=false,busy=false;
const campaign=()=>$("brsmCampaignSelect")?.value||"";
async function invoke(action,data,label){
  if(!permitted||!coinEnabled()||busy)return;
  busy=true;say("Сохраняем "+label+"…");
  try{const result=await coinRequest(action,data);say(label+" подтверждено сервером.");return result;}
  catch(error){say("Не выполнено: "+(error.message||error.code||"Ошибка сервера"));return null;}
  finally{busy=false;}
}
const requireCampaign=()=>{
  const id=campaign();
  if(!id){say("Сначала выберите кампанию BRSM.");return "";}
  return id;
};
async function fillEvents(){
  const id=requireCampaign();
  const select=$("brsmCoinEventSelect");select.replaceChildren(new Option("Выберите вечеринку",""));
  if(!id)return;
  const opt=[...$("brsmCampaignEventSelect").options].filter(x=>x.value);
  for(const o of opt)select.add(new Option(o.text,o.value));
}
async function loadMenu(){
  const id=requireCampaign();if(!id||!permitted)return;
  say("Загружаем позиции за BALI COIN…");
  const host=$("brsmCoinMenuList");host.replaceChildren();
  try{
    const result=await coinRequest("coinLots",{campaignId:id});
    const lots=result.lots||[];
    if(!lots.length)host.textContent="Активные позиции ещё не созданы.";
    for(const v of lots){
      const line=document.createElement("div");
      line.textContent=(v.category==="bar"?"БАР":"ПРИЗ")+" · "+v.lotId+" · "+v.name+
        " · "+v.price+" COIN · остаток "+v.remaining;
      host.append(line);
    }
    say("Каталог загружен.");
  }catch(e){say("Не удалось загрузить каталог: "+(e.message||"Ошибка"));}
}
$("brsmCoinEventForm").addEventListener("submit",async event=>{
  event.preventDefault();const id=requireCampaign();if(!id)return;
  const f=new FormData(event.currentTarget);
  await invoke("coinSetReward",{
    kind:"EVENT",campaignId:id,itemId:String(f.get("eventId")),
    label:String(f.get("label")),amount:Number(f.get("amount"))
  },"награду за посещение");
});
$("brsmCoinActivityForm").addEventListener("submit",async event=>{
  event.preventDefault();const id=requireCampaign();if(!id)return;
  const f=new FormData(event.currentTarget);
  await invoke("coinSetReward",{
    kind:"ACTIVITY",campaignId:id,itemId:String(f.get("activityId")),
    label:String(f.get("label")),amount:Number(f.get("amount"))
  },"награду за активность");
});
$("brsmCoinAwardForm").addEventListener("submit",async event=>{
  event.preventDefault();const id=requireCampaign();if(!id)return;
  const f=new FormData(event.currentTarget),number=String(f.get("number"));
  if(!confirm("Начислить баллы за активность пользователю Bali Card "+number+"?"))return;
  const result=await invoke("coinAwardActivity",{
    campaignId:id,activityId:String(f.get("activityId")),number,
    requestId:nonce()
  },"начисление гостю");
  if(result){say("Начислено "+result.result?.amount+" COIN · баланс: "+result.result?.balance);}
});
$("brsmCoinLotForm").addEventListener("submit",async event=>{
  event.preventDefault();const id=requireCampaign();if(!id)return;
  const f=new FormData(event.currentTarget);
  const result=await invoke("coinLotManage",{
    campaignId:id,lotId:String(f.get("lotId")),name:String(f.get("name")),
    category:String(f.get("category")),price:Number(f.get("price")),
    stock:Number(f.get("stock")),active:f.get("active")==="on"
  },"позицию каталога");
  if(result)void loadMenu();
});
$("brsmCoinReloadMenu").addEventListener("click",loadMenu);
$("brsmCoinFulfillForm").addEventListener("submit",async event=>{
  event.preventDefault();
  const f=new FormData(event.currentTarget),number=String(f.get("number")),
    voucher=String(f.get("voucher")).trim();
  if(!confirm("Подтвердить выдачу оплаченного BALI COIN заказа пользователю "+number+"?"))return;
  const result=await invoke("coinVoucherFulfill",{number,voucher},"выдачу заказа");
  if(result)say(result.result?.alreadyFulfilled?
    "Этот ваучер уже был погашен. Повторная выдача запрещена.":
    "Выдача подтверждена: "+(result.result?.name||"Позиция")+".");
});
$("brsmCampaignSelect")?.addEventListener("change",()=>{void fillEvents();void loadMenu()});
$("brsmCampaignRefresh")?.addEventListener("click",()=>setTimeout(fillEvents,500));
$("brsmCampaignEventForm")?.addEventListener("submit",()=>setTimeout(fillEvents,1200));
onAuthStateChanged(auth,async user=>{
  permitted=false;
  if(!coinEnabled()){say("Firebase API пока выключен. Начисления, переводы и бар станут доступны после подключения.");return;}
  if(!user?.emailVerified)return say("Для управления BALI COIN войдите в Google.");
  try{
    const {role,coinLaunchPhase}=await coinRequest("me");
    if(auth.currentUser?.uid!==user.uid)return;
    permitted=["admin","director"].includes(role);
    say(!permitted?"В Firebase требуется роль admin или director.":
      coinLaunchPhase==="live"?"BALI COIN: рабочий режим. Проверьте каждое начисление.":
      coinLaunchPhase==="pilot"?"BALI COIN: тестовый режим, начисления разрешены только тестовым картам.":
      "Настройки COIN доступны. Начисления и обмен пока отключены до сверки балансов.");
    if(permitted){void fillEvents();void loadMenu();}
  }catch(e){say("Не удалось проверить доступ: "+(e.message||"Ошибка"));}
});
