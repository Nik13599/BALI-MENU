/* Secure camera-first QR scanner for internal club bonus grants, redemption and card recipient lookup.
   No wallet mutations happen in browser; each operation requires server confirmation. */
import {initializeApp,getApps,getApp} from "https://www.gstatic.com/firebasejs/10.14.1/firebase-app.js";
import {getAuth,onAuthStateChanged} from "https://www.gstatic.com/firebasejs/10.14.1/firebase-auth.js";
import {getFunctions,httpsCallable} from "https://www.gstatic.com/firebasejs/10.14.1/firebase-functions.js";
const app=getApps().length?getApp():initializeApp(window.BALI_FIREBASE_CONFIG);
const auth=getAuth(app),functions=getFunctions(app,"europe-west1");
const previewBonus=httpsCallable(functions,"previewBaliBonusQR");
const applyBonus=httpsCallable(functions,"applyBaliBonusQR");
const previewRecipient=httpsCallable(functions,"previewBaliRecipientQr");
const fmt=new Intl.DateTimeFormat("ru-RU",{timeZone:"Europe/Minsk",year:"numeric",month:"long",day:"numeric",hour:"2-digit",minute:"2-digit"});
const el=(tag,cls="",text="")=>{const e=document.createElement(tag);if(cls)e.className=cls;e.textContent=text;return e;};
const dialog=el("dialog","bali-qr-dialog");
const shell=el("div","bali-qr-shell"),head=el("div","bali-qr-head"),title=el("h2","","СКАНИРОВАНИЕ QR");
const close=el("button","","Закрыть");close.type="button";head.append(title,close);
const instructions=el("p","","Наведите камеру на QR-код или вставьте ссылку.");
const video=el("video");video.setAttribute("playsinline","");video.muted=true;
const toolRow=el("div","bali-qr-camera-tools");
const start=el("button","","Включить камеру"),stop=el("button","","Остановить");
for(const b of [start,stop])b.type="button";toolRow.append(start,stop);
const inputLabel=el("label","","Ссылка или код QR");
const field=el("input");field.type="text";field.autocomplete="off";field.placeholder="Вставить содержимое QR";
inputLabel.append(field);
const check=el("button","","Проверить код");check.type="button";
const status=el("p","","");status.setAttribute("role","status");
const confirmBox=el("section","bali-qr-confirm");confirmBox.hidden=true;
const details=el("strong"),balance=el("p");
const quantityLabel=el("label","","Количество списания");
const amount=el("input");amount.type="number";amount.min="1";amount.max="999";amount.value="1";
quantityLabel.append(amount);
const submit=el("button","","Подтвердить операцию");submit.type="button";
confirmBox.append(details,balance,quantityLabel,submit);
shell.append(head,instructions,video,toolRow,inputLabel,check,status,confirmBox);
dialog.append(shell);document.body.append(dialog);
const receipt=el("dialog","bali-qr-dialog"),receiptShell=el("div","bali-qr-shell");
const receiptHead=el("div","bali-qr-head");
const receiptTitle=el("h2","","BALI · ОПЕРАЦИЯ"),receiptClose=el("button","","Закрыть");
receiptHead.append(receiptTitle,receiptClose);
const receiptBody=el("section","bali-qr-receipt");
receiptShell.append(receiptHead,receiptBody);receipt.append(receiptShell);document.body.append(receipt);
const id=()=>Array.from(crypto.getRandomValues(new Uint8Array(16)),b=>b.toString(16).padStart(2,"0")).join("");
let mode="credit",token="",preview=null,busy=false,sequence=0,stream=null,loop=null,detector=null,requestId=null,operationKey="",cameraBusy=false;
function setStatus(s,error=false){status.textContent=s;status.classList.toggle("bali-qr-error",error);}
function stopCamera(){
  if(loop!==null)cancelAnimationFrame(loop);loop=null;
  if(stream){for(const t of stream.getTracks())t.stop();stream=null;}
  video.pause();video.srcObject=null;cameraBusy=false;
}
function hidePreview(){preview=null;confirmBox.hidden=true;requestId=null;operationKey="";}
function reset(){
  ++sequence;stopCamera();hidePreview();field.value="";token="";busy=false;check.disabled=false;submit.disabled=false;
  setStatus("");video.hidden=true;
}
function parse(text){
  const raw=String(text||"").trim();
  if(/^[a-f0-9]{48}$/.test(raw))return raw;
  try{
    const url=new URL(raw);
    if(url.origin!=="https://nik13599.github.io"||url.pathname.replace(/\/$/,"")!=="/BALI-MENU")
      return "";
    const param=mode==="recipient"?"baliRecipientQr":"baliQrBonus";
    const value=url.searchParams.get(param);
    return /^[a-f0-9]{48}$/.test(value||"")?value:"";
  }catch{return "";}
}
function message(error){
  const code=String(error?.code||"");
  if(code.includes("unauthenticated"))return "Войдите в подтверждённый BALI ID.";
  if(code.includes("permission-denied"))return "Доступ к операции запрещён.";
  if(code.includes("resource-exhausted"))return "Лимит или защита от повторного сканирования. Попробуйте позднее.";
  if(code.includes("failed-precondition"))return String(error?.message||"Код использован, истёк или недостаточно бонусов.").slice(0,180);
  if(code.includes("not-found")||code.includes("unimplemented"))return "QR-сервис пока не развёрнут на сервере.";
  if(code.includes("invalid-argument"))return "Проверьте QR-код и количество.";
  return "Транзакция не подтверждена сервером. Повторите попытку.";
}
function setModal(modeArg){
  mode=modeArg;
  title.textContent=mode==="credit"?"ПОЛУЧИТЬ БОНУСЫ BALI":mode==="debit"?"ИСПОЛЬЗОВАТЬ БОНУСЫ":"ПЕРЕВОД ПО QR";
  instructions.textContent=mode==="recipient"?"Наведите камеру на QR-код карты получателя.":
    mode==="credit"?"Сканируйте QR-код начисления от BALI.":"Сканируйте QR-код списания от сотрудника клуба.";
}
function open({mode:next="credit",prefill=""}={}){
  if(!auth.currentUser?.emailVerified||!window.BaliAuth?.isRegistered?.()){
    window.BaliAuth?.open?.();return false;
  }
  reset();setModal(next);
  if(!dialog.open)dialog.showModal();
  if(prefill){field.value=prefill;void checkCode(prefill)}
  else void startCamera();
  return true;
}
async function checkCode(v=field.value){
  if(busy||!auth.currentUser?.emailVerified)return;
  const current=++sequence;
  const parsed=parse(v);
  if(!parsed){setStatus("Неверный тип QR-кода или ссылка. Выберите нужное действие.",true);return;}
  token=parsed;hidePreview();stopCamera();busy=true;check.disabled=true;
  setStatus("Проверяем код на сервере…");
  try{
    if(mode==="recipient"){
      const guest=(await previewRecipient({code:token})).data;
      if(current!==sequence||!dialog.open)return;
      if(!guest||!/^[0-9]{6}$/.test(guest.number)||!guest.name)throw Error("Ошибка подтверждения");
      window.dispatchEvent(new CustomEvent("bali:transfer-qr",{detail:{number:guest.number,name:guest.name}}));
      dialog.close();
      return;
    }
    const data=(await previewBonus({code:token})).data;
    if(current!==sequence||!dialog.open)return;
    if(!data||data.action!==mode)throw Error("QR-код предназначен для другой операции. Выберите подходящий режим.");
    preview=data;
    details.textContent=(mode==="credit"?"Начисление: ":"Списание: ")+data.name;
    const n=mode==="credit"?data.quantity:1;
    amount.value=String(n);amount.max=String(data.maxQuantity||999);
    quantityLabel.hidden=mode==="credit";
    balance.textContent=mode==="debit"?"Доступно: "+data.available+". Введите количество для списания (не более "+data.maxQuantity+").":
      "Будет начислено: "+data.quantity+" шт.";
    confirmBox.hidden=false;
    if(mode==="debit"&&data.available<1){setStatus("НЕДОСТАТОЧНО БОНУСОВ: "+data.name,true);submit.disabled=true;}
    else{setStatus("Проверьте бонусы и подтвердите действие.");submit.disabled=false;}
  }catch(error){if(current===sequence)setStatus(message(error),true)}
  finally{if(current===sequence){busy=false;check.disabled=false}}
}
function showReceipt(data){
  if(!data||!Number.isFinite(data.createdAt))return;
  receiptBody.replaceChildren();
  const credit=data.type==="grant",headline=el("strong","",credit?"НАЧИСЛЕНО":"СПИСАНО");
  const summary=el("div","bali-qr-receipt-main",(credit?"+":"−")+data.count+" "+(data.name||"бонусов"));
  const stamped=el("p","",fmt.format(new Date(data.createdAt))+" · Минск");
  const balanceLabel=el("p","",Number.isInteger(data.balanceAfter)?"Остаток: "+data.balanceAfter+" шт.":"BALI ID · PRIVILEGE");
  const number=el("small","bali-qr-receipt-number","Операция № "+data.id);
  const until=el("p","","Подтверждение доступно до "+fmt.format(new Date(data.expiresAt||data.createdAt+30*86400000)));
  receiptBody.append(headline,summary,stamped,balanceLabel,number,until);
  if(dialog.open)dialog.close();
  if(!receipt.open)receipt.showModal();
}
async function submitCode(){
  if(busy||!preview||!token||!auth.currentUser?.emailVerified)return;
  const q=mode==="credit"?preview.quantity:Number(amount.value);
  if(!Number.isInteger(q)||q<1||q>preview.maxQuantity||mode==="debit"&&q>preview.available){
    setStatus("ОШИБКА ТРАНЗАКЦИИ: недостаточно бонусов "+preview.name+" или превышен лимит.",true);return;
  }
  const key=token+":"+q;
  if(operationKey!==key){operationKey=key;requestId=id();}
  const user=auth.currentUser.uid,current=++sequence;
  busy=true;submit.disabled=true;setStatus("Проводим транзакцию…");
  try{
    const response=(await applyBonus({code:token,quantity:q,requestId})).data;
    if(current!==sequence||auth.currentUser?.uid!==user||!dialog.open)return;
    if(!response?.ok||!response.receipt)throw Error("Подтверждение не получено");
    showReceipt(response.receipt);requestId=null;operationKey="";
  }catch(error){if(current===sequence){setStatus(message(error),true);submit.disabled=false}}
  finally{busy=false}
}
async function startCamera(){
  if(!dialog.open)return;
  stopCamera();video.hidden=false;
  if(!navigator.mediaDevices?.getUserMedia||!window.BarcodeDetector){
    video.hidden=true;
    setStatus("Камера в этом браузере не поддерживает распознавание QR. Откройте код системной камерой или вставьте ссылку.",true);
    return;
  }
  const current=sequence;
  try{
    const support=await BarcodeDetector.getSupportedFormats();
    if(!support.includes("qr_code"))throw Error("QR camera unavailable");
    detector=new BarcodeDetector({formats:["qr_code"]});
    stream=await navigator.mediaDevices.getUserMedia({video:{facingMode:{ideal:"environment"}},audio:false});
    if(current!==sequence||!dialog.open){stopCamera();return;}
    video.srcObject=stream;await video.play();
    const scan=async()=>{
      if(current!==sequence||!dialog.open||!stream)return;
      if(!cameraBusy){
        cameraBusy=true;
        try{const codes=await detector.detect(video);
          if(codes.length){const found=parse(codes[0].rawValue);
            if(found){field.value=codes[0].rawValue;cameraBusy=false;void checkCode(codes[0].rawValue);return;}
          }
        }catch(_){}finally{cameraBusy=false;}
      }
      loop=requestAnimationFrame(scan);
    };
    loop=requestAnimationFrame(scan);setStatus("Наведите камеру на QR-код.");
  }catch(error){stopCamera();video.hidden=true;setStatus("Доступ к камере недоступен. Используйте системную камеру телефона или вставьте ссылку.",true);}
}
start.addEventListener("click",()=>void startCamera());
stop.addEventListener("click",stopCamera);
check.addEventListener("click",()=>void checkCode());
submit.addEventListener("click",()=>void submitCode());
close.addEventListener("click",()=>dialog.close());
receiptClose.addEventListener("click",()=>receipt.close());
dialog.addEventListener("close",reset);
window.addEventListener("pagehide",stopCamera);
document.getElementById("baliIdTopupOpen")?.addEventListener("click",()=>open({mode:"credit"}));
document.getElementById("baliIdPayOpen")?.addEventListener("click",()=>open({mode:"debit"}));
window.BaliQrScanner={open,showReceipt};
let consumed=false;
onAuthStateChanged(auth,user=>{
 if(!user?.emailVerified||consumed)return;
 const url=new URL(location.href),credit=url.searchParams.get("baliQrBonus"),recipient=url.searchParams.get("baliRecipientQr");
 if(!credit&&!recipient)return;
 consumed=true;url.searchParams.delete("baliQrBonus");url.searchParams.delete("baliRecipientQr");
 history.replaceState(history.state,"",url.pathname+url.search+url.hash);
 setTimeout(()=>{
   if(recipient){document.getElementById("baliIdTransferOpen")?.click();open({mode:"recipient",prefill:recipient});}
   else if(credit){open({mode:"credit",prefill:credit});}
 },250);
});
