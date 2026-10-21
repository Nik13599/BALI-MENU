/* Local consent UI. No analytics, remote requests or anonymous consent tracking. */
(()=>{
 "use strict";
 const dialog=document.getElementById("baliPrivacyDialog");
 if(!dialog)return;
 const processing=document.getElementById("baliPrivacyProcessing");
 const international=document.getElementById("baliPrivacyInternational");
 const accept=document.getElementById("baliPrivacyAccept");
 const decline=document.getElementById("baliPrivacyDecline");
 let resolveReview=null,pending=null,acceptAction=null;
 const update=()=>{accept.disabled=!(processing.checked&&international.checked)};
 const finish=value=>{
  const resolve=resolveReview,onAccepted=acceptAction;
  resolveReview=null;pending=null;acceptAction=null;
  if(dialog.open)dialog.close();
  if(value){try{localStorage.setItem("bali-privacy-entry-approved","2026-10-21")}catch(_e){}}
  // Called directly from the trusted Accept button click, before resolving
  // the review Promise. Otherwise browsers may block the Google popup after
  // the asynchronous consent step has consumed its user activation.
  if(value && onAccepted)onAccepted();
  resolve?.(value);
 };
 processing.addEventListener("change",update);
 international.addEventListener("change",update);
 accept.addEventListener("click",()=>{if(!accept.disabled)finish(true)});
 decline.addEventListener("click",()=>finish(false));
 dialog.addEventListener("cancel",event=>{event.preventDefault();finish(false)});
 dialog.addEventListener("close",()=>{if(resolveReview)finish(false)});
 window.BaliPrivacy=Object.freeze({
  version:"2026-10-21",
  hasEntryConsent(){try{return localStorage.getItem("bali-privacy-entry-approved")==="2026-10-21"}catch(_e){return false}},
  review({onAccepted}={}){
   if(pending)return pending;
   acceptAction=typeof onAccepted==="function"?onAccepted:null;
   processing.checked=false;international.checked=false;update();
   pending=new Promise(resolve=>{resolveReview=resolve});
   dialog.showModal();dialog.querySelector("h2").focus({preventScroll:true});
   return pending;
  },
  cancel(){if(resolveReview)finish(false)}
 });
})();
