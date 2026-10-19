/* Guest-specific desktop BALI ID preview. No synthetic IDs or privileged writes. */
(()=>{
 "use strict";
 const card=document.getElementById("baliHomeIdCard");
 if(!card)return;
 const name=document.getElementById("baliHomeIdName");
 const number=document.getElementById("baliHomeIdNumber");
 const tier=document.getElementById("baliHomeIdTier");
 const hint=document.getElementById("baliHomeIdHint");
 const realScene=document.getElementById("baliIdFlipScene");
 const allowed=new Set(["member","silver","gold","platinum","black","private"]);
 let registered=false;
 function reset(){
   card.dataset.baliTier="member";
   name.textContent="ВАША КАРТА BALI ID";
   number.textContent="— — — — — —";
   tier.textContent="MEMBER";
   hint.textContent="Войти и получить карту";
 }
 function sync(){
   if(!registered){reset();return;}
   const sourceName=document.getElementById("baliCardName")?.textContent?.trim();
   const sourceNum=document.getElementById("baliCardNumber")?.textContent?.trim();
   const sourceTier=realScene?.dataset.baliTier?.toLowerCase();
   const safeTier=allowed.has(sourceTier)?sourceTier:"member";
   card.dataset.baliTier=safeTier;
   tier.textContent=safeTier.toUpperCase();
   name.textContent=sourceName||"ГОСТЬ BALI";
   number.textContent=sourceNum||"— — — — — —";
   hint.textContent="Открыть карту и привилегии";
 }
 card.addEventListener("click",()=>{
   if(!registered){window.BaliAuth?.open?.();return;}
   window.location.hash="id";
 });
 window.addEventListener("bali:auth-state",event=>{
   registered=event.detail?.registered===true;
   sync();
 });
 if(realScene){
   const observer=new MutationObserver(sync);
   observer.observe(realScene,{attributes:true,attributeFilter:["data-bali-tier"],subtree:true,childList:true,characterData:true});
 }
 registered=window.BaliAuth?.isRegistered?.()===true;
 sync();
})();
