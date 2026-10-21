/* BALI ICON ATELIER v53
 * Fine-line club-inspired SVGs; consistent strokes, gently chamfered corners.
 * All paths are authored locally, no icon CDN or font is required.
 * The script only decorates existing controls; all handlers and labels stay intact.
 */
(()=>{
  "use strict";
  const NS="http://www.w3.org/2000/svg";
  const icons={
    "home":'<path d="m3.5 10 8.5-6.7L20.5 10v9a1.5 1.5 0 0 1-1.5 1.5H5A1.5 1.5 0 0 1 3.5 19Z"/><path d="M9 20.5v-6.3h6v6.3"/><path d="M11 7.6h2"/>',
    "calendar":'<rect x="3.5" y="5" width="17" height="16" rx="2.5"/><path d="M7.5 3v4M16.5 3v4M3.5 10h17"/><path d="m12 12.6 2.1 2.1-2.1 2.1-2.1-2.1Z"/>',
    "calendar-heart":'<rect x="3.5" y="5" width="17" height="16" rx="2.5"/><path d="M7.5 3v4M16.5 3v4M3.5 10h17"/><path d="M12 18.2c-3.2-2-3.8-3.1-2.8-4.2.75-.85 2-.45 2.8.45.8-.9 2.05-1.3 2.8-.45 1 1.1.4 2.2-2.8 4.2Z"/>',
    "book":'<path d="M12 5.5c-2.65-1.85-5.65-2.2-9-1.4v14.75c3.35-.8 6.35-.45 9 1.4 2.65-1.85 5.65-2.2 9-1.4V4.1c-3.35-.8-6.35-.45-9 1.4Z"/><path d="M12 5.5v14.75M5.6 8c1.55-.2 2.75 0 4.1.62M14.3 8.62c1.35-.62 2.55-.82 4.1-.62"/>',
    "user":'<circle cx="12" cy="8.5" r="3.25"/><path d="M5.4 20v-1.1a6.6 6.6 0 0 1 13.2 0V20M4.3 20.5h15.4"/>',
    "id-card":'<rect x="2.75" y="5" width="18.5" height="14" rx="2.5"/><circle cx="8" cy="10" r="2"/><path d="M4.8 15.4a3.7 3.7 0 0 1 6.4 0M13.5 9h5.2M13.5 12.5h4.2"/>',
    "users":'<circle cx="9.5" cy="8.4" r="2.85"/><path d="M3.6 19.5v-.9a5.9 5.9 0 0 1 11.8 0v.9H3.6Z"/><path d="M16.4 5.9a3 3 0 0 1 0 5.7M17.6 14.1a4.65 4.65 0 0 1 2.8 4.4v1"/>',
    "bag":'<path d="M5 8.5h14l-1 12H6l-1-12Z"/><path d="M9 9V6a3 3 0 0 1 6 0v3"/><path d="M9.25 14h5.5"/>',
    "receipt":'<path d="M6 3.7h12v16.6l-3-1.5-3 1.5-3-1.5-3 1.5V3.7Z"/><path d="M9 8h6M9 11.5h6M9 15h3"/>',
    "ticket":'<path d="M4 5.5h16v4a2.5 2.5 0 0 0 0 5v4H4v-4a2.5 2.5 0 0 0 0-5v-4Z"/><path d="M12 5.5v13" stroke-dasharray="2 3"/>',
    "search":'<circle cx="10.6" cy="10.6" r="6"/><path d="m15.1 15.1 5.2 5.2"/><path d="M8.3 10.6h4.6"/>',
    "pin":'<path d="M19 10.1c0 5.7-7 11.1-7 11.1S5 15.8 5 10.1a7 7 0 1 1 14 0Z"/><circle cx="12" cy="10" r="2.35"/>',
    "phone":'<path d="M6.1 3.8h3l1.25 4-2 1.8c1.05 2.35 2.45 3.75 4.8 4.8l1.8-2 4 1.25v3a2 2 0 0 1-2.2 2 16 16 0 0 1-12.6-12.6 2 2 0 0 1 1.95-2.25Z"/>',
    "send":'<path d="m3 11.2 18-8.2-6.9 18-2.7-7.7L3 11.2Z"/><path d="M11.4 13.3 21 3"/>',
    "spark":'<path d="m12 2.5 2.25 7.25L21.5 12l-7.25 2.25L12 21.5l-2.25-7.25L2.5 12l7.25-2.25L12 2.5Z"/>',
    "palette":'<path d="M12 3a9 9 0 0 0 0 18h1.4a2.15 2.15 0 0 0 1.6-3.6 1.25 1.25 0 0 1 1.05-2.05h1.8A4.15 4.15 0 0 0 22 11.2 8.6 8.6 0 0 0 12 3Z"/><circle cx="7.5" cy="12" r=".65" fill="currentColor" stroke="none"/><circle cx="10" cy="7.5" r=".65" fill="currentColor" stroke="none"/><circle cx="16" cy="8.5" r=".65" fill="currentColor" stroke="none"/>',
    "diamond":'<path d="m12 2.8 8.7 9.2L12 21.2 3.3 12 12 2.8Z"/><path d="M8.5 12h7M12 8.5v7"/>',
    "check":'<path d="m4.7 12.2 5 4.9 9.6-10.2"/>',
    "x":'<path d="m5 5 14 14M19 5 5 19"/>',
    "plus":'<path d="M12 4.8v14.4M4.8 12h14.4"/>',
    "chevron-right":'<path d="m9 5.5 6.5 6.5L9 18.5"/>',
    "arrow-right":'<path d="M4 12h15M13.5 6.5 19 12l-5.5 5.5"/>',
    "arrow-left":'<path d="M20 12H5M10.5 6.5 5 12l5.5 5.5"/>',
    "external":'<path d="M12.5 5H19v6.5M19 5l-9.8 9.8"/><path d="M19 14.5v4.2a1.3 1.3 0 0 1-1.3 1.3H5.3A1.3 1.3 0 0 1 4 18.7V6.3A1.3 1.3 0 0 1 5.3 5h4.2"/>',
    "logout":'<path d="M10 4H5.5a2 2 0 0 0-2 2v12a2 2 0 0 0 2 2H10M14 7l5 5-5 5M8.5 12H19"/>',
    "bolt":'<path d="m13 2-8 11h6l-1 9 9-12h-6l0-8Z"/>',
    "star":'<path d="m12 2.8 2.9 6 6.6 1-4.75 4.65 1.1 6.55L12 18l-5.85 3.0 1.1-6.55L2.5 9.8l6.6-1 2.9-6Z"/>'
  };
  const createIcon=name=>{
    if(!Object.prototype.hasOwnProperty.call(icons,name))return null;
    const svg=document.createElementNS(NS,"svg");
    svg.setAttribute("viewBox","0 0 24 24");
    svg.setAttribute("fill","none");
    svg.setAttribute("stroke","currentColor");
    svg.setAttribute("stroke-width","1.65");
    svg.setAttribute("stroke-linecap","round");
    svg.setAttribute("stroke-linejoin","round");
    svg.setAttribute("focusable","false");
    svg.setAttribute("aria-hidden","true");
    svg.setAttribute("class","bali-custom-icon");
    svg.innerHTML=icons[name];
    return svg;
  };
  const put=(target,name)=>{
    if(!target||target.firstElementChild?.matches?.("svg.bali-custom-icon,svg.bali-ui-icon"))return;
    const icon=createIcon(name);
    if(!icon)return;
    target.replaceChildren(icon);
    target.classList.add("bali-icon-slot");
  };
  function replaceAll(selector,name){
    document.querySelectorAll(selector).forEach(el=>put(el,typeof name==="function"?name(el):name));
  }
  function addPrefix(selector,name){
    document.querySelectorAll(selector).forEach(el=>{
      if(el.querySelector(":scope > svg.bali-custom-icon"))return;
      const icon=createIcon(name);
      if(!icon)return;
      for(const node of el.childNodes){
        if(node.nodeType===Node.TEXT_NODE && /^\s*\+/.test(node.textContent)){
          node.textContent=node.textContent.replace(/^\s*\+\s*/,"");
          break;
        }
      }
      el.prepend(icon);
      el.classList.add("bali-icon-labeled");
    });
  }
  function decorate(){
    // Guest primary navigation and the home panel.
    replaceAll(".bali-bottom-nav [data-bali-nav] .bali-nav-glyph",el=>{
      const p=el.closest("[data-bali-nav]")?.dataset.baliNav;
      return {home:"home",events:"calendar",menu:"book",id:"id-card",profile:"user"}[p]||"diamond";
    });
    replaceAll(".bali-home-calendar-btn > span:first-child","calendar");
    replaceAll(".bali-home-calendar-btn > span:last-child","chevron-right");
    replaceAll(".bali-menu-banner-icon","book");
    replaceAll(".bali-menu-banner-arrow","chevron-right");
    replaceAll(".bali-menu-search-field > span:first-child","search");
    replaceAll(".bali-cart-dock-left > span:first-child","bag");
    replaceAll(".bali-cart-dock > span:last-child","chevron-right");
    replaceAll(".bali-profile-action > span:first-child",el=>{
      return {
        profileMyOrdersBtn:"receipt",
        profileMyPlansBtn:"calendar-heart",
        profileDataBtn:"user",
        profileLogoutBtn:"logout"
      }[el.parentElement?.id]||"diamond";
    });
    replaceAll(".bali-profile-action > b:last-child","chevron-right");
    replaceAll(".bali-floating-home > span:first-child","home");
    replaceAll(".events-info-icon","spark");
    replaceAll(".feature-icon",el=>{
      const txt=el.parentElement?.textContent||"";
      return /статус|гео/i.test(txt)?"pin":/столик/i.test(txt)?"star":"bolt";
    });
    replaceAll(".bali-contact-card .contact-symbol",el=>{
      const url=el.parentElement?.getAttribute("href")||"";
      return url.startsWith("tel:")?"phone":url.includes("maps")?"pin":"send";
    });
    replaceAll(".bali-contact-card > span:last-child","external");
    replaceAll(".empty-icon","bag");
    replaceAll(".events-carousel-hint > span:first-child","arrow-left");
    replaceAll(".events-carousel-hint > span:last-child","arrow-right");
    replaceAll(".close-cart,.close-modal,.dialog-close,.remove-item","x");
    document.querySelectorAll(".close-cart,.close-modal,.dialog-close").forEach(btn=>{
      if(!btn.hasAttribute("aria-label"))btn.setAttribute("aria-label","Закрыть");
    });
    document.querySelectorAll(".remove-item").forEach(btn=>{
      if(!btn.hasAttribute("aria-label"))btn.setAttribute("aria-label","Удалить позицию");
    });
    replaceAll(".success-icon","check");
    replaceAll(".btn-icon","arrow-right");
    // Admin: same line system, distinct role-specific symbols.
    replaceAll(".brand-mark,.login-logo","diamond");
    replaceAll(".admin-tab .tab-icon",el=>{
      const tab=el.closest("[data-admin-tab]")?.dataset.adminTab;
      return {orders:"ticket",clients:"users",menu:"book",events:"calendar",appearance:"palette"}[tab]||"diamond";
    });
    replaceAll(".topbar-site > span:last-child","external");
    addPrefix("#addMenuBtn,#addCategoryBtn,#addEventBtn,#newCategoryFromProduct,#editOrderAddBtn","plus");
    // Dynamically re-rendered empty cart and order line removal controls are included.
  }
  window.BaliIconAtelier=Object.freeze({createIcon,names:Object.keys(icons)});
  if(document.readyState==="loading"){
    document.addEventListener("DOMContentLoaded",decorate,{once:true});
  } else decorate();
  const watch=()=>{
    for(const id of ["cartItems","myOrdersList","adminOrdersList","adminMenuList"]){
      const parent=document.getElementById(id);
      if(!parent)continue;
      let queued=false;
      new MutationObserver(()=>{
        if(queued)return;
        queued=true;
        queueMicrotask(()=>{queued=false;decorate()});
      }).observe(parent,{childList:true,subtree:false});
    }
  };
  if(document.readyState==="loading")document.addEventListener("DOMContentLoaded",watch,{once:true});
  else watch();
})();
