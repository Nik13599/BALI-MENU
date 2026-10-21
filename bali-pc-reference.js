/* BALI persistent PC shell: sidebar cart + header profile. Hero is handled by offers module. */
(() => {
  "use strict";
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
    if(action==="id")document.getElementById("profileBaliIdBtn")?.click();
    if(action==="orders")document.getElementById("profileMyOrdersBtn")?.click();
    if(action==="plans")document.getElementById("profileMyPlansBtn")?.click();
    if(action==="details")document.getElementById("profileDataBtn")?.click();
    if(action==="info")document.getElementById("profileInfoBtn")?.click();
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

  // Desktop homepage frame: the logo and map/address control are the
  // actual visual anchors. The right About + BALI ID rail, advertising
  // carousel, five square posters and Menu must share these boundaries.
  // Do not adjust the sidebar from the Menu: that created a circular layout
  // dependency when the home grid was resized.
  const sidebar=document.querySelector(".bali-pc-sidebar");
  const logo=sidebar?.querySelector(".bali-pc-brand .bali-brand-logo");
  const address=sidebar?.querySelector(".bali-pc-contact-location > a");
  const homepage=document.getElementById("homeSection");
  const homeInner=homepage?.querySelector(".bali-home-inner");
  const eventsPanel=homeInner?.querySelector(".bali-home-events-panel");
  let alignmentFrame=0;

  // Heights stay within the two sidebar anchors. The five event posters
  // remain square, while only the advertisement is allowed to become
  // narrower (preserving the artwork's exact 1024:353 proportions).
  function alignHomeToSidebar(){
    alignmentFrame=0;
    if(!homeInner||!homepage||!sidebar)return;
    if(!desktop.matches){
      homeInner.classList.remove("bali-pc-edge-aligned");
      return;
    }
    if(document.body.dataset.baliPage!=="home")return;
    if(!logo||!address||!eventsPanel||!logo.getClientRects().length||!address.getClientRects().length)return;
    sidebar.style.removeProperty("--bali-contact-menu-alignment");

    const top=logo.getBoundingClientRect().top;
    const bottom=address.getBoundingClientRect().bottom;
    const homeTop=homepage.getBoundingClientRect().top;
    const sidebarBottom=sidebar.getBoundingClientRect().bottom;
    // If the sidebar itself has overflowed a short desktop viewport, the
    // address is scrolled out of sight: keep the existing fallback layout.
    if(bottom>sidebarBottom+2||bottom-top<320){
      homeInner.classList.remove("bali-pc-edge-aligned");
      return;
    }

    const span=Math.round((bottom-top)*100)/100;
    const gap=parseFloat(getComputedStyle(homeInner).columnGap)||12;
    const centerWidth=eventsPanel.getBoundingClientRect().width;
    if(centerWidth<250)return;
    const naturalPoster=Math.max(70,Math.min((centerWidth-4*gap)/5,innerHeight*.28));
    const menuHeight=Math.max(65,Math.min(96,innerHeight*.105));
    const naturalPromo=Math.min(centerWidth*353/1024,innerHeight*.46);
    const remaining=span-naturalPoster-menuHeight-2*gap;
    if(remaining<75){
      homeInner.classList.remove("bali-pc-edge-aligned");
      return;
    }
    const promoHeight=Math.min(naturalPromo,remaining);
    const values={
      "--bali-home-edge-top":Math.max(0,top-homeTop).toFixed(2)+"px",
      "--bali-home-edge-span":span.toFixed(2)+"px",
      "--bali-home-fit-promo":promoHeight.toFixed(2)+"px",
      "--bali-home-fit-poster":naturalPoster.toFixed(2)+"px",
      "--bali-home-fit-menu":menuHeight.toFixed(2)+"px"
    };
    for(const [name,value] of Object.entries(values)){
      if(homeInner.style.getPropertyValue(name)!==value)homeInner.style.setProperty(name,value);
    }
    homeInner.classList.add("bali-pc-edge-aligned");
  }
  function requestHomeAlignment(){
    if(alignmentFrame)cancelAnimationFrame(alignmentFrame);
    alignmentFrame=requestAnimationFrame(alignHomeToSidebar);
  }
  window.addEventListener("resize",requestHomeAlignment,{passive:true});
  window.addEventListener("load",requestHomeAlignment,{once:true});
  desktop.addEventListener?.("change",requestHomeAlignment);
  if(typeof ResizeObserver!=="undefined"){
    const observer=new ResizeObserver(requestHomeAlignment);
    for(const node of [logo,address,homeInner]){
      if(node)observer.observe(node);
    }
  }
  if(document.fonts?.ready)document.fonts.ready.then(requestHomeAlignment);
  document.addEventListener("visibilitychange",()=>{
    if(!document.hidden)requestHomeAlignment();
  });
  requestHomeAlignment();
})();
