/* BALI COIN: admin-only ledger operations through the private Sheets API.
 * Nothing is written directly to Firebase or Firestore from the browser. */
import {initializeApp,getApps,getApp} from "https://www.gstatic.com/firebasejs/10.14.1/firebase-app.js";
import {getAuth,onAuthStateChanged} from "https://www.gstatic.com/firebasejs/10.14.1/firebase-auth.js";
import {coinEnabled,coinRequest} from "./bali-coin-firebase-api.js";
const app=getApps().length?getApp():initializeApp(window.BALI_FIREBASE_CONFIG);
const auth=getAuth(app);
const $=id=>document.getElementById(id);
let currentUid=null,verifiedAdmin=false,busy=false,run=0;
const say=message=>{if($("baliCoinAdminStatus"))$("baliCoinAdminStatus").textContent=message;};
const setReady=()=>{$("baliCoinSubmit").disabled=!coinEnabled()||!verifiedAdmin||!currentUid||busy;};
const display=n=>Number.isSafeInteger(n)&&n>=0?new Intl.NumberFormat("ru-RU").format(n):"—";
async function loadBalance(uid){
  const seq=++run;
  $("baliCoinAdminBalance").textContent="—";
  if(!coinEnabled()||!verifiedAdmin||!uid){setReady();return;}
  say("Получаем баланс из Firebase...");
  try{
    const {card}=await coinRequest("adminCard",{uid});
    if(seq!==run||uid!==currentUid)return;
    $("baliCoinAdminBalance").textContent=display(card.coinBalance);
    say(card.activated?"Баланс актуален. Все операции сохраняются в журнале.":"Карта BALI ID ещё не активирована.");
  }catch(e){if(seq===run)say("Ошибка загрузки баланса: "+(e.message||e.code||"неизвестно"))}
  finally{setReady();}
}
window.addEventListener("bali:admin:select-privilege",event=>{
  const guest=event.detail;
  currentUid=guest?.uid||null;
  $("baliCoinGuestUid").value=currentUid||"";
  $("baliCoinGuestName").value=currentUid?
    [guest.name,guest.email].filter(Boolean).join(" · "):"";
  setReady();
  void loadBalance(currentUid);
});
function requestId(){
  const b=new Uint8Array(16);crypto.getRandomValues(b);
  return [...b].map(x=>x.toString(16).padStart(2,"0")).join("");
}
$("baliCoinChangeForm")?.addEventListener("submit",async event=>{
  event.preventDefault();
  if(busy||!verifiedAdmin||!currentUid||!coinEnabled())return;
  const uid=currentUid;
  const operation=$("baliCoinOperation").value;
  const amount=Number($("baliCoinQuantity").value);
  const reason=$("baliCoinReason").value.trim();
  if(!Number.isSafeInteger(amount)||amount<1||amount>1000000||reason.length<5){
    say("Укажите целое количество баллов и основание от 5 символов.");return;
  }
  if(!confirm((operation==="credit"?"Начислить ":"Списать ")+amount+
    " BALI COIN для "+$("baliCoinGuestName").value+"?"))return;
  busy=true;setReady();say("Сохраняем операцию в журнал BALI COIN...");
  const nonce=requestId();
  try{
    const {result}=await coinRequest("coinChange",{uid,operation,amount,reason,requestId:nonce});
    if(uid!==currentUid)return;
    $("baliCoinAdminBalance").textContent=display(result.balance);
    $("baliCoinQuantity").value="";
    $("baliCoinReason").value="";
    say("Операция подтверждена. Баланс BALI COIN: "+display(result.balance)+".");
    window.dispatchEvent(new CustomEvent("bali:coin-updated",{detail:{uid}}));
  }catch(e){say("Баланс не изменён либо ответ не получен: "+(e.message||e.code)+
    ". Перед повтором проверьте историю операций, чтобы не создать дубль.");}
  finally{busy=false;setReady();}
});
onAuthStateChanged(auth,async user=>{
  verifiedAdmin=false;currentUid=null;run++;setReady();
  if(!user?.emailVerified)return;
  if(!coinEnabled()){
    say("Новая таблица BALI подготовлена. Начисления включатся после публикации Apps Script и API.");
    return;
  }
  try{
    const {role}=await coinRequest("me");
    if(auth.currentUser?.uid!==user.uid)return;
    verifiedAdmin=role==="admin";
    say(verifiedAdmin?"Выберите гостя из списка клиентов, чтобы управлять BALI COIN.":"Требуется аккаунт администратора BALI.");
    setReady();
  }catch(e){say("Проверка прав BALI COIN недоступна: "+(e.message||e.code))}
});
