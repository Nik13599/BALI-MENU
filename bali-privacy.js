/* Local consent UI. No analytics, remote requests or anonymous consent tracking. */
(()=>{
 "use strict";
 const dialog=document.getElementById("baliPrivacyDialog");
 if(!dialog)return;
 const processing=document.getElementById("baliPrivacyProcessing");
 const international=document.getElementById("baliPrivacyInternational");
 const accept=document.getElementById("baliPrivacyAccept");
 const decline=document.getElementById("baliPrivacyDecline");
 let resolveReview=null,pending=null;
 const update=()=>{accept.disabled=!(processing.checked&&international.checked)};
 const finish=value=>{
  const resolve=resolveReview;resolveReview=null;pending=null;
  if(dialog.open)dialog.close();
  if(value){try{localStorage.setItem("bali-privacy-entry-approved","2026-10-21")}catch(_e){}}
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
  review(){
   if(pending)return pending;
   processing.checked=false;international.checked=false;update();
   pending=new Promise(resolve=>{resolveReview=resolve});
   dialog.showModal();dialog.querySelector("h2").focus({preventScroll:true});
   return pending;
  },
  cancel(){if(resolveReview)finish(false)}
 });
})();
