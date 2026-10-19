/* Mobile-only BALI reference interaction.
   Reuse published About content and native guest navigation; no new Firebase writes. */
(()=>{
  "use strict";
  const openButton=document.getElementById("baliMobileAboutBtn");
  const dialog=document.getElementById("baliMobileAboutDialog");
  if(!openButton||!dialog)return;
  const closeButton=document.getElementById("baliMobileAboutClose");
  const contactsButton=dialog.querySelector('[data-bali-nav="contacts"]');
  function open(){
    const originalTitle=document.getElementById("baliPcAboutTitle");
    const originalDescription=document.getElementById("baliPcAboutDescription");
    const newTitle=document.getElementById("baliMobileAboutDialogTitle");
    const newDescription=document.getElementById("baliMobileAboutDialogDescription");
    const title=originalTitle?.textContent?.trim();
    const description=originalDescription?.textContent?.trim();
    if(newTitle)newTitle.textContent=title||"О клубе BALI";
    if(newDescription)newDescription.textContent=description||"Музыка, атмосфера, люди — BALI NIGHT CLUB.";
    if(!dialog.open){
      if(typeof dialog.showModal==="function")dialog.showModal();
      else dialog.setAttribute("open","");
    }
  }
  function close(){
    if(typeof dialog.close==="function"&&dialog.open)dialog.close();
    else dialog.removeAttribute("open");
  }
  openButton.addEventListener("click",open);
  closeButton?.addEventListener("click",close);
  contactsButton?.addEventListener("click",close);
  dialog.addEventListener("click",event=>{if(event.target===dialog)close();});
  window.addEventListener("popstate",close);
})();
