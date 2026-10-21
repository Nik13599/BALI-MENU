/* Phone home-only viewport boundary measurement.
 * Match the actual bottom of the logo/header area and the actual top of the
 * fixed bottom navigation. The CSS then divides unused height evenly between
 * every visible home block using grid align-content:space-evenly.
 * No click handlers, network calls, carousel logic or device-width changes.
 */
(() => {
  "use strict";
  const section=document.getElementById("homeSection");
  const header=document.querySelector("body.bali-guest-theme > .header");
  const nav=document.querySelector("body.bali-guest-theme > .bali-bottom-nav");
  if(!section||!header||!nav)return;
  const phone=window.matchMedia("(max-width:767px)");
  let scheduled=false;
  let lastTop="",lastBottom="";

  function calculate(){
    scheduled=false;
    if(!phone.matches){
      if(lastTop){section.style.removeProperty("--bali-mobile-header-bottom");lastTop="";}
      if(lastBottom){section.style.removeProperty("--bali-mobile-nav-inset");lastBottom="";}
      return;
    }
    const headerRect=header.getBoundingClientRect();
    const navRect=nav.getBoundingClientRect();
    const viewportHeight=document.documentElement.clientHeight||window.innerHeight;
    if(!headerRect.height||!navRect.height||!viewportHeight)return;
    const top=Math.max(0,Math.round(headerRect.bottom*100)/100);
    const bottom=Math.max(0,Math.round((viewportHeight-navRect.top)*100)/100);
    if(top+bottom>=viewportHeight-30)return;
    const topCss=top+"px",bottomCss=bottom+"px";
    if(topCss!==lastTop){
      section.style.setProperty("--bali-mobile-header-bottom",topCss);
      lastTop=topCss;
    }
    if(bottomCss!==lastBottom){
      section.style.setProperty("--bali-mobile-nav-inset",bottomCss);
      lastBottom=bottomCss;
    }
  }

  function schedule(){
    if(scheduled)return;
    scheduled=true;
    requestAnimationFrame(calculate);
  }
  window.addEventListener("resize",schedule,{passive:true});
  window.addEventListener("orientationchange",schedule,{passive:true});
  window.visualViewport?.addEventListener("resize",schedule,{passive:true});
  phone.addEventListener?.("change",schedule);
  if(typeof ResizeObserver!=="undefined"){
    const observer=new ResizeObserver(schedule);
    observer.observe(header);
    observer.observe(nav);
    const preview=document.querySelector(".bali-preview-banner");
    if(preview)observer.observe(preview);
  }
  schedule();
})();
