/* PC hero uses ONLY the event posters already rendered from Firestore. */
(() => {
  "use strict";
  const carousel=document.getElementById("homeEventCarousel");
  const photo=document.getElementById("baliPcHeroPoster");
  const counter=document.getElementById("baliPcHeroCounter");
  if(!carousel||!photo||!counter)return;
  let slides=[],active=0;
  function renderHero(){
    const selected=slides[active];
    if(!selected){photo.removeAttribute("src");photo.alt="";counter.textContent="— / —";return;}
    photo.src=selected.src;
    photo.alt=selected.alt;
    counter.textContent=String(active+1).padStart(2,"0")+" / "+String(slides.length).padStart(2,"0");
  }
  function syncPosters(){
    const next=[...carousel.querySelectorAll(".bali-home-event-card .bali-home-poster-wrap img")]
      .filter(img=>img.getAttribute("src"))
      .map(img=>({src:img.src,alt:img.alt}));
    const old=slides[active]?.src;
    slides=next;
    const previous=slides.findIndex(item=>item.src===old);
    active=previous<0?0:previous;
    renderHero();
  }
  const observer=new MutationObserver(syncPosters);
  observer.observe(carousel,{childList:true});
  syncPosters();

  const profileTrigger=document.getElementById("accountBtn");
  const menu=document.getElementById("baliPcProfileMenu");
  const cartButton=document.getElementById("baliPcCartBtn");
  const cartCount=document.getElementById("baliPcCartCount");
  const desktop=window.matchMedia("(min-width:1180px)");
  let signedIn=false;
  function closeProfile(){
    if(!menu)return;
    menu.hidden=true;
    profileTrigger?.setAttribute("aria-expanded","false");
  }
  function toggleProfile(){
    if(!desktop.matches||!signedIn||!menu)return false;
    const next=menu.hidden;
    menu.hidden=!next;
    profileTrigger?.setAttribute("aria-expanded",String(next));
    if(next)menu.querySelector('button[role="menuitem"]')?.focus();
    return true;
  }
  window.BaliDesktopProfile={toggle:toggleProfile,close:closeProfile};
  function updateAuth(detail){
    signedIn=Boolean(detail?.registered);
    profileTrigger?.setAttribute("data-pc-signed-in",String(signedIn));
    if(!signedIn)closeProfile();
  }
  window.addEventListener("bali:auth-state",event=>updateAuth(event.detail));
  // Module initialization may run before or after Firebase's first auth callback.
  Promise.resolve(window.BaliAuth?.ready).then(()=>{
    updateAuth({registered:Boolean(window.BaliAuth?.isRegistered?.())});
  });
  menu?.addEventListener("click",event=>{
    const button=event.target.closest("button[data-bali-profile-action]");
    if(!button)return;
    const action=button.dataset.baliProfileAction;
    closeProfile();
    if(action==="orders")document.getElementById("profileMyOrdersBtn")?.click();
    if(action==="plans")document.getElementById("profileMyPlansBtn")?.click();
    if(action==="details")document.getElementById("profileDataBtn")?.click();
    if(action==="logout")document.getElementById("profileLogoutBtn")?.click();
  });
  document.addEventListener("pointerdown",event=>{
    if(menu&&!menu.hidden&&!event.target.closest(".bali-pc-account-wrap"))closeProfile();
  });
  document.addEventListener("keydown",event=>{
    if(event.key==="Escape"&&menu&&!menu.hidden){closeProfile();profileTrigger?.focus();}
  });
  desktop.addEventListener?.("change",()=>closeProfile());
  cartButton?.addEventListener("click",()=>{
    if(cartButton.hidden)return;
    closeProfile();
    window.openCart?.();
  });
  function setCartCount(count){
    const n=Number(count)||0;
    if(cartButton)cartButton.hidden=n<=0;
    if(cartCount)cartCount.textContent=String(n);
  }
  window.addEventListener("bali:cart-changed",event=>setCartCount(event.detail?.count));
  setCartCount(document.getElementById("baliDockCount")?.textContent);
  function refreshNavigation(){
    const current=document.body.dataset.baliPage||"home";
    document.querySelectorAll(".bali-pc-navigation [data-bali-nav]").forEach(button=>{
      const active=button.dataset.baliNav===current;
      button.classList.toggle("active",active);
      if(active)button.setAttribute("aria-current","page");
      else button.removeAttribute("aria-current");
    });
    closeProfile();
  }
  const bodyObserver=new MutationObserver(refreshNavigation);
  bodyObserver.observe(document.body,{attributes:true,attributeFilter:["data-bali-page"]});
  refreshNavigation();
})();
