/* BALI ID onboarding — first-use acknowledgement stored per Firebase user. */
import {initializeApp,getApps,getApp} from "https://www.gstatic.com/firebasejs/10.14.1/firebase-app.js";
import {getAuth,onAuthStateChanged} from "https://www.gstatic.com/firebasejs/10.14.1/firebase-auth.js";
import {getFirestore,doc,getDoc,setDoc,serverTimestamp} from "https://www.gstatic.com/firebasejs/10.14.1/firebase-firestore.js";
import {sheetsEnabled,sheetsRequest} from "./bali-sheets-api.js";

const app=getApps().length?getApp():initializeApp(window.BALI_FIREBASE_CONFIG);
const auth=getAuth(app),db=getFirestore(app);
const VERSION=1;
const dialog=document.getElementById("baliIdWelcomeDialog");
const scroll=document.getElementById("baliIdWelcomeScroll");
const accept=document.getElementById("baliIdWelcomeAccept");
const cancel=document.getElementById("baliIdWelcomeCancel");
const hint=document.getElementById("baliIdWelcomeHint");
const error=document.getElementById("baliIdWelcomeError");
const loginDialog=document.getElementById("baliIdLoginDialog");
const loginAction=document.getElementById("baliIdLoginAction");
const loginCancel=document.getElementById("baliIdLoginCancel");
let acceptedUid=null,pending=null,resolveReview=null,busy=false;

const agreementRef=uid=>doc(db,"users",uid,"baliIdAgreements","privilege");
const isAccepted=()=>Boolean(auth.currentUser?.uid&&auth.currentUser.uid===acceptedUid&&window.BaliAuth?.isRegistered?.());
const reachedEnd=()=>scroll && scroll.scrollTop+scroll.clientHeight>=scroll.scrollHeight-12;

function updateScroll(){
  const done=Boolean(reachedEnd());
  accept.disabled=busy||!done;
  hint.textContent=done?"Вы ознакомились с информацией. Теперь можно подтвердить.":"Прокрутите описание до конца, чтобы активировать подтверждение.";
}
function finishReview(result){
  const resolve=resolveReview;
  resolveReview=null;
  if(dialog.open)dialog.close();
  resolve?.(result);
}
function promptForLogin(){
  // This message always appears before the standard sign-in / registration form.
  if(loginDialog && !loginDialog.open)loginDialog.showModal();
}
loginAction?.addEventListener("click",()=>{
  if(loginDialog?.open)loginDialog.close();
  window.BaliAuth?.open?.();
});
loginCancel?.addEventListener("click",()=>loginDialog?.close());

function showReview(){
  return new Promise(resolve=>{
    resolveReview=resolve;
    busy=false;
    error.textContent="";
    scroll.scrollTop=0;
    if(!dialog.open)dialog.showModal();
    updateScroll();
    scroll.focus({preventScroll:true});
  });
}
async function checkAgreement(uid){
  if(sheetsEnabled()){
    const {card}=await sheetsRequest("card");
    return card?.activated===true&&card?.agreed===true;
  }
  const snapshot=await getDoc(agreementRef(uid));
  return snapshot.exists()&&snapshot.data()?.version===VERSION;
}
async function open(){
  if(pending)return pending;
  pending=(async()=>{
    await window.BaliAuth?.ready;
    const user=auth.currentUser;
    if(!user?.emailVerified||!window.BaliAuth?.isRegistered?.()){
      promptForLogin();
      return false;
    }
    if(isAccepted())return true;
    try{
      if(await checkAgreement(user.uid)){
        if(auth.currentUser?.uid!==user.uid)return false;
        acceptedUid=user.uid;
        // Another tab may have recorded the acknowledgement after this tab signed in.
        // Restart local ID initialization once the persisted consent is detected.
        window.dispatchEvent(new CustomEvent("bali:id-accepted",{detail:{uid:user.uid}}));
        return true;
      }
    }catch(e){
      // A failed read must not be interpreted as an absent acknowledgement.
      error.textContent="Не удалось проверить вашу Bali Card. Проверьте подключение и попробуйте снова.";
      if(!dialog.open)dialog.showModal();
      accept.disabled=true;
      cancel.focus();
      return false;
    }
    if(auth.currentUser?.uid!==user.uid)return false;
    return showReview();
  })().finally(()=>{pending=null;});
  return pending;
}

scroll?.addEventListener("scroll",updateScroll,{passive:true});
cancel?.addEventListener("click",()=>{if(!busy)finishReview(false);});
dialog?.addEventListener("close",()=>{
  if(resolveReview){const resolve=resolveReview;resolveReview=null;resolve(false);}
});
dialog?.addEventListener("cancel",event=>{if(busy)event.preventDefault();});
accept?.addEventListener("click",async()=>{
  if(busy||!reachedEnd())return;
  const user=auth.currentUser;
  if(!user?.emailVerified||!window.BaliAuth?.isRegistered?.()){
    error.textContent="Сначала войдите в подтверждённый аккаунт.";
    return;
  }
  busy=true;
  updateScroll();
  cancel.disabled=true;
  error.textContent="";
  try{
    if(sheetsEnabled()){
      const response=await sheetsRequest("activateCard",{accepted:true});
      if(response.card?.activated!==true)throw Error("Bali Card registration not confirmed");
    }else{
      try{
        await setDoc(agreementRef(user.uid),{version:VERSION,acceptedAt:serverTimestamp()});
      }catch(writeError){
        // Concurrent acceptance in another tab is valid; all other failures block issuance.
        if(!await checkAgreement(user.uid))throw writeError;
      }
    }
    if(auth.currentUser?.uid!==user.uid)throw Error("Сменился аккаунт. Откройте Bali Card заново.");
    acceptedUid=user.uid;
    window.dispatchEvent(new CustomEvent("bali:id-accepted",{detail:{uid:user.uid}}));
    finishReview(true);
  }catch(e){
    error.textContent="Не удалось сохранить подтверждение. Проверьте соединение и попробуйте снова.";
  }finally{
    busy=false;
    cancel.disabled=false;
    updateScroll();
  }
});
onAuthStateChanged(auth,user=>{
  if(acceptedUid!==user?.uid)acceptedUid=null;
  if(dialog?.open && resolveReview && (!user || !user.emailVerified) && !busy)finishReview(false);
  if(loginDialog?.open && user?.emailVerified && window.BaliAuth?.isRegistered?.())loginDialog.close();
});
window.BaliIdOnboarding={open,isAccepted};
window.dispatchEvent(new Event("bali:id-onboarding-ready"));
