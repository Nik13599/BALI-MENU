/* BALI INFO — one source of truth for PC and phone contact details.
 * The desktop sidebar is edited live via settings/homeInterface in Firebase.
 * Clone only its public contact block into the Info page; never fork the data.
 */
(()=>{
  const sidebar=document.querySelector(".bali-pc-sidebar .bali-pc-sidebar-contacts");
  const target=document.getElementById("baliInfoContactMirror");
  if(!sidebar||!target)return;
  let scheduled=false;
  const sync=()=>{
    scheduled=false;
    const clone=sidebar.cloneNode(true);
    clone.classList.add("bali-info-mirror");
    clone.removeAttribute("aria-label");
    // Preserve official links and optional custom icons exactly as configured on PC.
    // Do not display an unconfigured TikTok URL as if it were a real profile.
    for(const link of clone.querySelectorAll('a[href]')){
      const raw=link.getAttribute("href")||"";
      if(!raw||raw==="#"){link.removeAttribute("href");link.setAttribute("aria-disabled","true");}
    }
    target.replaceChildren(clone);
  };
  const schedule=()=>{
    if(scheduled)return;
    scheduled=true;
    requestAnimationFrame(sync);
  };
  sync();
  const observer=new MutationObserver(schedule);
  observer.observe(sidebar,{
    subtree:true,attributes:true,childList:true,characterData:true,
    attributeFilter:["href","hidden","class","src","aria-label","title"]
  });
  // onSnapshot of the admin-edited desktop contact settings dispatches this event.
  window.addEventListener("bali:home-interface",schedule);
  window.addEventListener("pageshow",schedule);
})();