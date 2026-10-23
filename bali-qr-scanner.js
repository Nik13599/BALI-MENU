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
title.id="baliQrScannerTitle";dialog.setAttribute("aria-labelledby",title.id);
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
receiptTitle.id="baliQrReceiptTitle";receipt.setAttribute("aria-labelledby",receiptTitle.id);receiptClose.type="button";
receiptHead.append(receiptTitle,receiptClose);
const receiptBody=el("section","bali-qr-receipt");
receiptShell.append(receiptHead,receiptBody);receipt.append(receiptShell);document.body.append(receipt);
const id=()=>Array.from(crypto.getRandomValues(new Uint8Array(16)),b=>b.toString(16).padStart(2,"0")).join("");
let mode="credit",token="",preview=null,busy=false,sequence=0,stream=null,loop=null,requestId=null,operationKey="";
let ownerUid=null,previewUid=null,receiptUid=null,cameraEpoch=0,decoderPromise=null;
const signedInUid=()=>auth.currentUser?.emailVerified?auth.currentUser.uid:null;
const ownsSession=uid=>Boolean(uid&&uid===ownerUid&&uid===signedInUid()&&dialog.open);
function setStatus(s,error=false){status.textContent=s;status.classList.toggle("bali-qr-error",error);}
function stopCamera(){
  ++cameraEpoch;
  if(loop!==null)cancelAnimationFrame(loop);loop=null;
  if(stream){for(const t of stream.getTracks())t.stop();stream=null;}
  video.pause();video.srcObject=null;video.hidden=true;start.disabled=false;stop.disabled=true;
}
function hidePreview(){preview=null;previewUid=null;confirmBox.hidden=true;requestId=null;operationKey="";}
function reset(){
  ++sequence;stopCamera();hidePreview();field.value="";token="";busy=false;ownerUid=null;
  check.disabled=false;submit.disabled=false;field.disabled=false;amount.disabled=false;
  setStatus("");
}
function parse(text){
  const raw=String(text||"").trim();
  if(/^[a-f0-9]{48}$/.test(raw))return raw;
  try{
    const url=new URL(raw);
    const host=url.hostname.toLowerCase();
    const production=(url.protocol==="https:"&&
      (host==="baliminsk.by"||host==="www.baliminsk.by")&&
      url.pathname.replace(/\/$/,"")==="");
    const legacy=url.origin==="https://nik13599.github.io"&&
      url.pathname.replace(/\/$/,"")==="/BALI-MENU";
    if(!production&&!legacy)return "";
    const param=mode==="recipient"?"baliRecipientQr":"baliQrBonus";
    const value=url.searchParams.get(param);
    return /^[a-f0-9]{48}$/.test(value||"")?value:"";
  }catch{return "";}
}
function message(error){
  const code=String(error?.code||"");
  if(code.includes("unauthenticated"))return "Войдите в подтверждённый Bali Card.";
  if(code.includes("permission-denied"))return "Доступ к операции запрещён.";
  if(code.includes("resource-exhausted"))return "Лимит или защита от повторного сканирования. Попробуйте позднее.";
  if(code.includes("failed-precondition"))return String(error?.message||"Код использован, истёк или недостаточно бонусов.").slice(0,180);
  if(code.includes("not-found")||code.includes("unimplemented"))return "Проверка QR-кода временно недоступна. Повторите попытку позже.";
  if(code.includes("invalid-argument"))return "Проверьте QR-код и количество.";
  return "Транзакция не подтверждена сервером. Повторите попытку.";
}
function setModal(modeArg){
  mode=modeArg;
  title.textContent=mode==="credit"?"ПОЛУЧИТЬ БОНУСЫ BALI":mode==="debit"?"ИСПОЛЬЗОВАТЬ БОНУСЫ":mode==="recipient"?"ПЕРЕВОД ПО QR":"ПРОВЕРКА QR BALI";
  instructions.textContent=mode==="recipient"?"Наведите камеру на QR-код карты получателя.":
    mode==="credit"?"Сканируйте QR-код начисления от BALI.":mode==="debit"?"Сканируйте QR-код списания от сотрудника клуба.":"Проверяем действие по QR-коду. Операция выполняется только после вашего подтверждения.";
}
function open({mode:next="credit",prefill=""}={}){
  if(!auth.currentUser?.emailVerified||!window.BaliAuth?.isRegistered?.()){
    window.BaliAuth?.open?.();return false;
  }
  if(!["credit","debit","recipient","auto"].includes(next))return false;
  reset();ownerUid=signedInUid();setModal(next);
  if(!dialog.open)dialog.showModal();
  if(prefill){field.value=prefill;void checkCode(prefill)}
  else void startCamera();
  return true;
}
async function checkCode(v=field.value){
  if(busy||!ownsSession(ownerUid))return;
  const user=ownerUid;
  const current=++sequence;
  hidePreview();token="";stopCamera();
  const parsed=parse(v);
  if(!parsed){setStatus("Неверный тип QR-кода или ссылка. Выберите нужное действие.",true);return;}
  token=parsed;busy=true;check.disabled=true;
  setStatus("Проверяем код на сервере…");
  try{
    if(mode==="recipient"){
      const guest=(await previewRecipient({code:token})).data;
      if(current!==sequence||!ownsSession(user))return;
      if(!guest||!/^[0-9]{6}$/.test(guest.number)||!guest.name)throw Error("Ошибка подтверждения");
      window.dispatchEvent(new CustomEvent("bali:transfer-qr",{detail:{number:guest.number,name:guest.name}}));
      dialog.close();
      return;
    }
    const data=(await previewBonus({code:token})).data;
    if(current!==sequence||!ownsSession(user))return;
    if(mode==="auto"&&["credit","debit"].includes(data?.action))setModal(data.action);
    if(!data||data.action!==mode){
      setStatus("QR-код предназначен для другой операции. Выберите подходящий режим.",true);return;
    }
    preview=data;previewUid=user;
    details.textContent=(mode==="credit"?"Начисление: ":"Списание: ")+data.name;
    const n=mode==="credit"?data.quantity:1;
    amount.value=String(n);amount.max=String(data.maxQuantity||999);
    quantityLabel.hidden=mode==="credit";
    balance.textContent=mode==="debit"?"Доступно: "+data.available+". Введите количество для списания (не более "+data.maxQuantity+").":
      "Будет начислено: "+data.quantity+" шт.";
    confirmBox.hidden=false;
    if(mode==="debit"&&data.available<1){setStatus("НЕДОСТАТОЧНО БОНУСОВ: "+data.name,true);submit.disabled=true;}
    else{setStatus("Проверьте бонусы и подтвердите действие.");submit.disabled=false;}
  }catch(error){if(current===sequence&&ownsSession(user))setStatus(message(error),true)}
  finally{if(current===sequence&&ownsSession(user)){busy=false;check.disabled=false}}
}
function showReceipt(data){
  if(!signedInUid()||!data||!Number.isFinite(data.createdAt))return;
  receiptUid=signedInUid();
  receiptBody.replaceChildren();
  const credit=data.type==="grant",headline=el("strong","",credit?"НАЧИСЛЕНО":"СПИСАНО");
  const summary=el("div","bali-qr-receipt-main",(credit?"+":"−")+data.count+" "+(data.name||"бонусов"));
  const stamped=el("p","",fmt.format(new Date(data.createdAt))+" · Минск");
  const balanceLabel=el("p","",Number.isInteger(data.balanceAfter)?"Остаток: "+data.balanceAfter+" шт.":"Bali Card");
  const number=el("small","bali-qr-receipt-number","Операция № "+data.id);
  const until=el("p","","Подтверждение доступно до "+fmt.format(new Date(data.expiresAt||data.createdAt+30*86400000)));
  receiptBody.append(headline,summary,stamped,balanceLabel,number,until);
  if(dialog.open)dialog.close();
  if(!receipt.open)receipt.showModal();
}
async function submitCode(){
  if(busy||!preview||!token||previewUid!==ownerUid||!ownsSession(ownerUid))return;
  const q=mode==="credit"?preview.quantity:Number(amount.value);
  if(!Number.isInteger(q)||q<1||q>preview.maxQuantity||mode==="debit"&&q>preview.available){
    setStatus("ОШИБКА ТРАНЗАКЦИИ: недостаточно бонусов "+preview.name+" или превышен лимит.",true);return;
  }
  const key=token+":"+q;
  if(operationKey!==key){operationKey=key;requestId=id();}
  const user=auth.currentUser.uid,current=++sequence;
  busy=true;submit.disabled=true;field.disabled=true;amount.disabled=true;setStatus("Проводим транзакцию…");
  try{
    const response=(await applyBonus({code:token,quantity:q,requestId})).data;
    if(current!==sequence||!ownsSession(user))return;
    if(!response?.ok||!response.receipt)throw Error("Подтверждение не получено");
    showReceipt(response.receipt);requestId=null;operationKey="";
  }catch(error){if(current===sequence&&ownsSession(user)){setStatus(message(error),true);submit.disabled=false}}
  finally{if(current===sequence&&ownsSession(user)){busy=false;field.disabled=false;amount.disabled=false}}
}
async function fallbackDecoder(){
  // Local Apache-2.0 jsQR distribution, pinned and verified; no CDN request.
  if(!decoderPromise)decoderPromise=import("./assets/vendor/jsqr-1.4.0.js").then(()=>{
    if(typeof window.jsQR!=="function")throw Error("QR decoder unavailable");
    return window.jsQR;
  }).catch(error=>{decoderPromise=null;throw error;});
  const decode=await decoderPromise;
  const canvas=document.createElement("canvas"),ctx=canvas.getContext("2d",{willReadFrequently:true});
  if(!ctx)throw Error("QR canvas unavailable");
  return ()=>{
    if(video.readyState<2||!video.videoWidth||!video.videoHeight)return "";
    const ratio=Math.min(1,960/Math.max(video.videoWidth,video.videoHeight));
    canvas.width=Math.round(video.videoWidth*ratio);canvas.height=Math.round(video.videoHeight*ratio);
    ctx.drawImage(video,0,0,canvas.width,canvas.height);
    const pixels=ctx.getImageData(0,0,canvas.width,canvas.height);
    return decode(pixels.data,pixels.width,pixels.height,{inversionAttempts:"attemptBoth"})?.data||"";
  };
}
async function startCamera(){
  if(!ownsSession(ownerUid))return;
  stopCamera();
  if(!window.isSecureContext){
    setStatus("Для камеры откройте сайт по HTTPS. Можно также вставить ссылку из QR-кода.",true);return;
  }
  if(!navigator.mediaDevices?.getUserMedia){
    setStatus("Камера недоступна в этом браузере. Откройте сайт в Safari или Chrome либо вставьте ссылку из QR-кода.",true);return;
  }
  const user=ownerUid,current=sequence,epoch=cameraEpoch;
  const active=()=>epoch===cameraEpoch&&current===sequence&&ownsSession(user);
  start.disabled=true;stop.disabled=false;
  let localStream=null,read=null,native=null,lastScan=0;
  try{
    if(window.BarcodeDetector){
      try{
        const formats=await window.BarcodeDetector.getSupportedFormats();
        if(formats.includes("qr_code"))native=new window.BarcodeDetector({formats:["qr_code"]});
      }catch(_){}
    }
    if(!active())return;
    if(!native)read=await fallbackDecoder();
    if(!active())return;
    localStream=await navigator.mediaDevices.getUserMedia({video:{facingMode:{ideal:"environment"}},audio:false});
    // A superseded request owns only its own tracks, never a newer session's.
    if(!active()){for(const track of localStream.getTracks())track.stop();return;}
    stream=localStream;video.srcObject=localStream;video.hidden=false;
    await video.play();
    if(!active())return;
    const scan=async now=>{
      if(!active())return;
      if(now-lastScan>=120){
        lastScan=now;
        try{
          let raw="";
          if(native){
            try{const codes=await native.detect(video);raw=codes[0]?.rawValue||"";}
            catch(_){
              if(!active())return;
              try{read=await fallbackDecoder();}
              catch(_){
                if(active()){
                  stopCamera();setStatus("Не удалось загрузить модуль распознавания. Повторите или вставьте ссылку из QR-кода.",true);
                }
                return;
              }
              native=null;
            }
          }
          if(!active())return;
          if(!native)raw=read();
          if(raw&&parse(raw)){
            field.value=raw;void checkCode(raw);return;
          }
        }catch(_){/* A blurred/incomplete frame is retried, never submitted. */}
      }
      if(active())loop=requestAnimationFrame(scan);
    };
    loop=requestAnimationFrame(scan);setStatus("Наведите камеру на QR-код. Выберите хорошее освещение.");
  }catch(error){
    if(localStream&&localStream!==stream)for(const track of localStream.getTracks())track.stop();
    if(!active())return;
    stopCamera();
    const denied=["NotAllowedError","PermissionDeniedError"].includes(error?.name);
    setStatus(denied?"Разрешите доступ к камере в настройках браузера и повторите. Можно также вставить ссылку из QR-кода.":"Не удалось включить камеру. Закройте другие приложения камеры и повторите либо вставьте ссылку из QR-кода.",true);
  }
}
start.addEventListener("click",()=>void startCamera());
stop.addEventListener("click",stopCamera);
check.addEventListener("click",()=>void checkCode());
submit.addEventListener("click",()=>void submitCode());
close.addEventListener("click",()=>{reset();dialog.close();});
receiptClose.addEventListener("click",()=>receipt.close());
dialog.addEventListener("cancel",reset);
dialog.addEventListener("close",()=>{if(!dialog.open)reset();});
receipt.addEventListener("close",()=>{if(!receipt.open){receiptUid=null;receiptBody.replaceChildren();}});
field.addEventListener("input",()=>{
  if(field.disabled)return;
  ++sequence;hidePreview();token="";busy=false;check.disabled=false;stopCamera();
});
window.addEventListener("pagehide",()=>{if(dialog.open)dialog.close();if(receipt.open)receipt.close();stopCamera();});
document.addEventListener("visibilitychange",()=>{if(document.hidden)stopCamera();});
document.getElementById("baliIdTopupOpen")?.addEventListener("click",()=>open({mode:"credit"}));
document.getElementById("baliIdPayOpen")?.addEventListener("click",()=>open({mode:"debit"}));
window.BaliQrScanner={open,showReceipt};
let consumed=false;
onAuthStateChanged(auth,user=>{
 const currentUid=user?.emailVerified?user.uid:null;
 if(ownerUid&&ownerUid!==currentUid){reset();if(dialog.open)dialog.close();}
 if(receiptUid&&receiptUid!==currentUid){receipt.close();receiptBody.replaceChildren();receiptUid=null;}
 if(!user?.emailVerified||consumed)return;
 const url=new URL(location.href),credit=url.searchParams.get("baliQrBonus"),recipient=url.searchParams.get("baliRecipientQr");
 if(!credit&&!recipient)return;
 consumed=true;url.searchParams.delete("baliQrBonus");url.searchParams.delete("baliRecipientQr");
 history.replaceState(history.state,"",url.pathname+url.search+url.hash);
 const linkUid=user.uid,linkSequence=sequence;
 setTimeout(async()=>{
   await window.BaliAuth?.ready;
   if(signedInUid()!==linkUid||sequence!==linkSequence)return;
   if(recipient){document.getElementById("baliIdTransferOpen")?.click();open({mode:"recipient",prefill:recipient});}
   else if(credit){open({mode:"auto",prefill:credit});}
 },250);
});
