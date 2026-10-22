/* BALI CARD BRSM: the visits and live crossed-out numbers live ON the card. */
import {initializeApp,getApps,getApp} from "https://www.gstatic.com/firebasejs/10.14.1/firebase-app.js";
import {getAuth,GoogleAuthProvider,signInWithPopup,onAuthStateChanged} from "https://www.gstatic.com/firebasejs/10.14.1/firebase-auth.js";
import {getFirestore,doc,onSnapshot} from "https://www.gstatic.com/firebasejs/10.14.1/firebase-firestore.js";
import {getFunctions,httpsCallable} from "https://www.gstatic.com/firebasejs/10.14.1/firebase-functions.js";
const app=getApps().length?getApp():initializeApp(window.BALI_FIREBASE_CONFIG);
const auth=getAuth(app),db=getFirestore(app),fn=getFunctions(app,"europe-west1");
const call=Object.fromEntries(["redeemBrsmPromo","redeemBrsmQr"].map(key=>[key,httpsCallable(fn,key)]));
const $=id=>document.getElementById(id);
let uid=null,card=null,called=[],draw=null,cardStop=null,drawStop=null,qrPending=new URL(location.href).searchParams.get("qr")||"",busy=false;
const status=text=>{$("brsmStatus").textContent=text||"";};
const err=e=>String(e?.message||e?.code||"Не удалось выполнить действие.").slice(0,230);
const dom=(tag,cls,text)=>{const e=document.createElement(tag);if(cls)e.className=cls;e.textContent=text||"";return e;};
const formatDate=date=>typeof date==="string"?date.split("-").reverse().join("."):"";
function render(){
 $("brsmAuthGate").hidden=!!uid;
 $("brsmPromoGate").hidden=!uid||!!card?.active;
 $("brsmCardArea").hidden=!card?.active;
 if(!card?.active)return;
 $("brsmName").textContent=card.name||"ГОСТЬ BALI";
 $("brsmNumber").textContent=card.number||"000000";
 const visits=Array.isArray(card.visits)?card.visits:[];
 const list=$("brsmVisits");list.replaceChildren();
 for(let index=0;index<3;index++){
   const v=visits[index],tile=dom("div","brsm-visit"+(v?" done":""));
   tile.append(dom("strong","",v?"✓":String(index+1)));
   tile.append(dom("span","",v?"ПОДТВЕРЖДЕНО":"ВЕЧЕРИНКА "+(index+1)));
   tile.append(dom("small","",v?formatDate(v.date):"КОНТАКТ"));
   list.append(tile);
 }
 const numbers=$("brsmNumbers");numbers.replaceChildren();
 const values=Array.isArray(card.numbers)&&card.numbers.length===10?card.numbers:Array(10).fill("?");
 values.forEach(n=>numbers.append(dom("span","brsm-ball"+(typeof n==="number"&&called.includes(n)?" hit":""),String(n))));
 $("brsmProgress").textContent=visits.length>=3?
   "3/3 · Билет открыт. Совпадения зачёркиваются автоматически.":visits.length+"/3 · До лотерейного билета осталось посещений: "+(3-visits.length);
 const calledList=$("brsmCalled");calledList.replaceChildren();
 called.forEach(n=>calledList.append(dom("span","",String(n))));
 let text="Розыгрыш ещё не начался.";
 if(draw?.status==="live")text="Идёт розыгрыш. Вытянуто чисел: "+called.length+". Порог победы: "+draw.threshold+".";
 if(draw?.status==="tiebreak")text="Полная ничья. Ожидается дополнительный этап определения победителя.";
 if(draw?.status==="finished")text="Розыгрыш завершён. Победитель: BALI ID №"+draw.winnerNumber+".";
 $("brsmDrawStatus").textContent=text;
}
function stop(){cardStop?.();drawStop?.();cardStop=null;drawStop=null;card=null;draw=null;called=[];}
function fromQr(input){
 try{const url=new URL(input);return url.searchParams.get("qr")||"";}catch{return input.trim();}
}
async function claimQr(raw){
 if(busy)return;
 const token=fromQr(raw).trim().toLowerCase();
 if(!/^[a-f0-9]{48}$/.test(token)){status("Укажите действительный одноразовый QR-код КОНТАКТ.");return;}
 if(!auth.currentUser){status("Сначала войдите в BALI.");return;}
 if(!card?.active){status("Для отметки сначала активируйте карту БРСМ.");return;}
 busy=true;status("Проверяем QR-код на сервере...");
 try{
   const result=await call.redeemBrsmQr({token});
   const count=result.data?.visits?.length||0;
   status(count===3?"Третье посещение подтверждено. Лотерейный билет открыт!":"Вход подтверждён. Посещений: "+count+"/3.");
   $("brsmQrInput").value="";
   qrPending="";history.replaceState(null,"",location.pathname);
 }catch(e){status(err(e));}
 finally{busy=false;}
}
onAuthStateChanged(auth,user=>{
 stop();uid=user?.emailVerified?user.uid:null;
 status(user&&!user.emailVerified?"Подтвердите почту Google-аккаунта.":"");
 render();
 if(!uid)return;
 const current=uid;
 cardStop=onSnapshot(doc(db,"brsmCards",current),snap=>{
   if(current!==uid)return;
   card=snap.exists()?snap.data():{active:false};
   render();
   if(card?.active&&qrPending){const pending=qrPending;qrPending="";void claimQr(pending);}
 },e=>status("Не удалось прочитать карту: "+err(e)));
 drawStop=onSnapshot(doc(db,"brsmDraws","main"),snap=>{
   if(current!==uid)return;
   draw=snap.exists()?snap.data():null;
   called=Array.isArray(draw?.called)?draw.called:[];
   render();
 },e=>status("Не удалось получить состояние розыгрыша: "+err(e)));
});
$("brsmLogin").addEventListener("click",async()=>{
 try{await signInWithPopup(auth,new GoogleAuthProvider());}catch(e){status(err(e));}
});
$("brsmPromoForm").addEventListener("submit",async e=>{
 e.preventDefault();if(busy)return;busy=true;
 const code=$("brsmPromoInput").value;
 status("Активируем карту...");
 try{await call.redeemBrsmPromo({code});$("brsmPromoInput").value="";status("BALI CARD BRSM активирована.");}
 catch(e){status(err(e));}
 finally{busy=false;}
});
$("brsmQrForm").addEventListener("submit",e=>{e.preventDefault();void claimQr($("brsmQrInput").value);});
$("brsmFlip").addEventListener("click",()=>document.querySelector(".brsm-cards")?.classList.toggle("brsm-flipped"));
const cards=document.querySelector(".brsm-cards"); // Same two faces, mobile flips visually.
async function scan(){
 if(!navigator.mediaDevices?.getUserMedia||typeof BarcodeDetector==="undefined"){
   status("Сканирование не поддерживается этим браузером. Используйте QR-ссылку или вставьте код.");return;
 }
 const video=$("brsmCamera");
 let stream;
 try{
   stream=await navigator.mediaDevices.getUserMedia({video:{facingMode:"environment"}});
   video.srcObject=stream;video.hidden=false;await video.play();
   const detector=new BarcodeDetector({formats:["qr_code"]});let active=true;
   const stopCamera=()=>{active=false;stream.getTracks().forEach(t=>t.stop());video.hidden=true;video.srcObject=null;};
   $("brsmScan").textContent="Остановить камеру";
   $("brsmScan").onclick=()=>{stopCamera();$("brsmScan").textContent="Сканировать камерой";$("brsmScan").onclick=scan;};
   const frame=async()=>{
     if(!active||video.hidden)return;
     try{const codes=await detector.detect(video);
       if(codes.length){const raw=codes[0].rawValue;stopCamera();$("brsmScan").textContent="Сканировать камерой";$("brsmScan").onclick=scan;void claimQr(raw);return;}
     }catch{}
     if(active)requestAnimationFrame(frame);
   };requestAnimationFrame(frame);
 }catch(e){stream?.getTracks().forEach(t=>t.stop());video.hidden=true;status("Не удалось открыть камеру: "+err(e));}
}
$("brsmScan").addEventListener("click",scan);
