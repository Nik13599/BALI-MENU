/* Fixed PC showcase: public BALI Privilege information, not private guest data. */
(()=>{
 "use strict";
 const button=document.getElementById("baliHomeIdCard");
 if(!button)return;
 button.addEventListener("click",()=>{
   if(window.BaliAuth?.isRegistered?.()){
     window.location.hash="id";
   }else{
     window.BaliAuth?.open?.();
   }
 });
})();
