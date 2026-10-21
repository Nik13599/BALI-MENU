/* Fixed PC showcase: public BALI Privilege information, not private guest data. */
(()=>{
 "use strict";
 const button=document.getElementById("baliHomeIdCard");
 if(!button)return;
 button.addEventListener("click",()=>{
   // The desktop shortcut uses the same login notification as every ID route.
   void window.BaliIdOnboarding?.open?.().then(allowed=>{
     if(allowed)window.location.hash="id";
   });
 });
})();
