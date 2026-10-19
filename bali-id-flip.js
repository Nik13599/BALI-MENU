/* BALI ID flip + temporary QR dialog.
   A live, staff-verifiable QR is issued ONLY by authenticated Firebase Cloud Functions.
   No static guest ID / UID / unauthenticated QR is ever treated as a valid pass. */
import {initializeApp,getApps,getApp} from "https://www.gstatic.com/firebasejs/10.14.1/firebase-app.js";
import {getAuth,onAuthStateChanged} from "https://www.gstatic.com/firebasejs/10.14.1/firebase-auth.js";
import {getFunctions,httpsCallable} from "https://www.gstatic.com/firebasejs/10.14.1/firebase-functions.js";

const $=id=>document.getElementById(id);
const scene=$("baliIdFlipScene"),track=$("baliIdFlipTrack"),front=$("baliIdFront"),back=$("baliIdBack");
const dialog=$("baliQrDialog"),showBtn=$("baliShowQr"),closeBtn=$("baliQrClose");
const image=$("baliQrImage"),message=$("baliQrMessage"),expiry=$("baliQrExpires"),refresh=$("baliQrRefresh");
if(!scene||!track||!front||!back||!dialog||!showBtn||!image){
  throw new Error("BALI ID flip markup is missing.");
}

// Touch/pen drag is interactive: the rotation follows the finger immediately.
// Mouse click remains available on desktop, but tapping the card on a phone
// does NOT flip it. Keyboard controls work on every device.
const reducedMotion=window.matchMedia("(prefers-reduced-motion:reduce)");
let isFlipped=false,gesture=null,suppressTouchClickUntil=0,settling=false,settleTimer=null;
const clamp=(v,min,max)=>Math.max(min,Math.min(max,v));
const dragDistance=()=>clamp(scene.clientWidth*.58,150,245);

function setFaceState(toBack,{focus=false}={}){
  isFlipped=Boolean(toBack);
  track.classList.toggle("is-flipped",isFlipped);
  front.setAttribute("aria-hidden",String(isFlipped));
  back.setAttribute("aria-hidden",String(!isFlipped));
  front.tabIndex=isFlipped?-1:0;
  back.tabIndex=isFlipped?0:-1;
  if(focus)(isFlipped?back:front).focus({preventScroll:true});
}
function normalizeRotation(){
  if(settleTimer){clearTimeout(settleTimer);settleTimer=null;}
  // -180deg and +180deg have the same visible orientation. Normalize without
  // a transition, so the next slow drag always starts at the correct angle.
  track.style.transition="none";
  track.style.transform="rotateY("+(isFlipped?180:0)+"deg)";
  void track.offsetWidth;
  track.style.transform="";
  track.style.transition="";
  settling=false;
}
function flip(toBack,{focus=false}={}){
  gesture=null;
  if(settleTimer){clearTimeout(settleTimer);settleTimer=null;}
  settling=false;
  track.style.transition="";
  track.style.transform="";
  setFaceState(toBack,{focus});
}
function settleDrag(toBack,targetAngle,currentAngle){
  setFaceState(toBack);
  settling=true;
  // Force the browser to commit the last finger-controlled angle before
  // restoring the CSS transition for the remaining part of the rotation.
  void track.offsetWidth;
  track.style.transition="";
  track.style.transform="rotateY("+targetAngle+"deg)";
  // Full-distance drags and reduced-motion preference can finish without
  // a transitionend event, so never leave the card locked in settling state.
  if(reducedMotion.matches||Math.abs(currentAngle-targetAngle)<.4)normalizeRotation();
  else settleTimer=setTimeout(()=>{if(settling&&!gesture)normalizeRotation();},850);
}
track.addEventListener("transitionend",event=>{
  if(event.target===track&&event.propertyName==="transform"&&settling&&!gesture){
    normalizeRotation();
  }
});
function onFaceClick(){
  if(Date.now()<suppressTouchClickUntil)return;
  if(window.getSelection?.()?.toString()?.trim())return;
  // Regular mouse click on a laptop/PC retains the requested flip action.
  if(gesture||settling)return;
  flip(!isFlipped);
}
front.addEventListener("click",onFaceClick);
back.addEventListener("click",onFaceClick);
for(const face of [front,back]){
  face.addEventListener("keydown",event=>{
    if(["Enter"," ","ArrowLeft","ArrowRight"].includes(event.key)){
      event.preventDefault();
      flip(!isFlipped,{focus:true});
    }
  });
}

scene.addEventListener("pointerdown",event=>{
  if(!event.isPrimary||!["touch","pen"].includes(event.pointerType)||settling)return;
  suppressTouchClickUntil=Date.now()+900;
  gesture={
    id:event.pointerId,
    x:event.clientX,y:event.clientY,
    startTime:performance.now(),lastX:event.clientX,lastTime:performance.now(),
    velocity:0,axis:null,dx:0
  };
  try{scene.setPointerCapture(event.pointerId);}catch{}
});
scene.addEventListener("pointermove",event=>{
  const g=gesture;
  if(!g||event.pointerId!==g.id)return;
  const dx=event.clientX-g.x,dy=event.clientY-g.y;
  if(!g.axis){
    if(Math.abs(dx)<7&&Math.abs(dy)<7)return;
    if(Math.abs(dx)>Math.abs(dy)*1.12)g.axis="horizontal";
    else if(Math.abs(dy)>Math.abs(dx)*1.12)g.axis="vertical";
    else return;
  }
  if(g.axis!=="horizontal")return; // Native vertical scrolling remains intact.
  const currentTime=performance.now();
  const dt=currentTime-g.lastTime;
  if(dt>0)g.velocity=(event.clientX-g.lastX)/dt;
  g.lastTime=currentTime;g.lastX=event.clientX;g.dx=dx;

  // On the rear side choose the equivalent -180/+180 start angle that
  // points toward the nearest 0deg position for the drag direction.
  const base=isFlipped?(dx>=0?-180:180):0;
  const progress=clamp(dx/dragDistance(),-1,1);
  g.angle=base+progress*180;
  track.style.transition="none";
  track.style.transform="rotateY("+g.angle+"deg)";
});
function endGesture(event,cancelled=false){
  const g=gesture;
  if(!g||event.pointerId!==g.id)return;
  gesture=null;
  if(scene.hasPointerCapture?.(g.id)){
    try{scene.releasePointerCapture(g.id);}catch{}
  }
  if(g.axis!=="horizontal")return;
  const dx=g.dx,direction=dx>=0?1:-1;
  const progress=Math.abs(dx)/dragDistance();
  // Slow deliberate drags complete when the card moves almost half a turn;
  // fast, intentional flicks also work with a shorter travel distance.
  const fast=Math.abs(dx)>=24&&Math.abs(g.velocity)>=.5&&performance.now()-g.lastTime<110;
  const completed=!cancelled&&(progress>=.42||fast);
  const next=completed?!isFlipped:isFlipped;
  const target=completed
    ?(isFlipped?0:direction*180)
    :(isFlipped?-direction*180:0);
  settleDrag(next,target,g.angle??(isFlipped?180:0));
}
scene.addEventListener("pointerup",event=>endGesture(event));
scene.addEventListener("pointercancel",event=>endGesture(event,true));
// Prevent stuck transforms when the window loses focus mid-swipe.
window.addEventListener("blur",()=>{
  if(!gesture)return;
  const g=gesture;
  endGesture({pointerId:g.id},true);
});
flip(false);

const app=getApps().length?getApp():initializeApp(window.BALI_FIREBASE_CONFIG);
const auth=getAuth(app);
let qrTimer=null,validUntil=0,requestSequence=0,busy=false;
function setMessage(text){message.textContent=text;message.hidden=!text;}
function clearQr({close=false}={}){
  ++requestSequence;
  if(qrTimer)clearInterval(qrTimer);
  qrTimer=null;validUntil=0;busy=false;
  image.removeAttribute("src");
  image.hidden=true;
  if(expiry)expiry.textContent="";
  if(refresh)refresh.hidden=true;
  if(close&&dialog.open)dialog.close();
}
function updateExpiry(){
  if(!dialog.open)return;
  const seconds=Math.max(0,Math.ceil((validUntil-Date.now())/1000));
  if(seconds>0){
    expiry.textContent="QR действителен ещё "+seconds+" сек.";
    return;
  }
  if(qrTimer)clearInterval(qrTimer);
  qrTimer=null;
  image.hidden=true;image.removeAttribute("src");
  expiry.textContent="";
  setMessage("Срок действия QR истёк. Создайте новый код.");
  refresh.hidden=false;
}
function readableError(error){
  const code=String(error?.code||"");
  if(["functions/not-found","functions/unimplemented","functions/unavailable"].includes(code))
    return "Безопасный QR-код пока недоступен: сервер проверки BALI ID ещё не подключён.";
  if(["functions/unauthenticated","functions/permission-denied"].includes(code))
    return "Нет доступа к QR-коду. Войдите в подтверждённый аккаунт BALI.";
  if(code==="functions/resource-exhausted")
    return "Подождите несколько секунд перед повторным запросом QR.";
  if(code==="functions/failed-precondition"||code==="functions/not-found")
    return "Сначала активируйте персональную карту BALI ID.";
  return "Не удалось получить защищённый QR-код. Повторите попытку позже.";
}
async function issueQr(){
  if(busy)return;
  busy=true;
  const sequence=++requestSequence;
  if(qrTimer)clearInterval(qrTimer);
  qrTimer=null;validUntil=0;
  image.hidden=true;image.removeAttribute("src");
  expiry.textContent="";
  refresh.hidden=true;
  setMessage("Создаём временный QR-код…");
  try{
    const uid=auth.currentUser?.uid;
    if(!uid||!auth.currentUser?.emailVerified||!window.BaliAuth?.isRegistered?.())
      throw Object.assign(new Error("Требуется регистрация"),{code:"functions/unauthenticated"});
    const functions=getFunctions(app,"europe-west1");
    const call=httpsCallable(functions,"issueGuestQr");
    const result=(await call({})).data;
    if(sequence!==requestSequence||!dialog.open||uid!==auth.currentUser?.uid)return;
    // This image must be generated by the protected backend for the current guest.
    if(!result||!/^data:image\/png;base64,[A-Za-z0-9+/=]+$/.test(result.qrDataUrl||"")
      ||!Number.isFinite(result.expiresAt)||result.expiresAt<=Date.now())
      throw new Error("Неверный ответ сервера");
    image.src=result.qrDataUrl;
    image.hidden=false;
    validUntil=result.expiresAt;
    setMessage("");
    updateExpiry();
    qrTimer=setInterval(updateExpiry,1000);
  }catch(error){
    if(sequence!==requestSequence||!dialog.open)return;
    image.hidden=true;
    setMessage(readableError(error));
    // A missing backend is not a retryable guest-side issue.
    refresh.hidden=["functions/not-found","functions/unimplemented","functions/unavailable"].includes(error?.code)?true:false;
  }finally{
    if(sequence===requestSequence)busy=false;
  }
}
showBtn.addEventListener("click",()=>{
  // A QR cannot be issued before the user has a verified BALI account.
  if(!auth.currentUser?.emailVerified||!window.BaliAuth?.isRegistered?.()){
    window.BaliAuth?.open?.();
    return;
  }
  if(!dialog.open)dialog.showModal();
  void issueQr();
});
closeBtn?.addEventListener("click",()=>dialog.close());
refresh?.addEventListener("click",()=>void issueQr());
dialog.addEventListener("click",event=>{if(event.target===dialog)dialog.close();});
dialog.addEventListener("close",()=>clearQr());
window.addEventListener("pagehide",()=>clearQr({close:true}));
onAuthStateChanged(auth,user=>{
  if(!user||!user.emailVerified){clearQr({close:true});flip(false);}
});
window.addEventListener("bali:auth-state",event=>{
  if(!event.detail?.registered){clearQr({close:true});flip(false);}
});
