/* Gate the first public paint on authoritative Firestore snapshots and visible images. */
(()=>{
  "use strict";
  const required={
    home:["events","promotions","settings/homeDesign","settings/homeInterface",
      "settings/homeEventPlaceholder","settings/siteBuilderPublished"],
    events:["events"],menu:["menu"],contacts:["settings/homeInterface"],
    about:["settings/siteBuilderPublished"],profile:[],id:[]
  };
  if(window.matchMedia("(max-width:767px)").matches)required.home.push("mobileAboutBackgrounds");
  const received=new Set(),validPages=new Set(Object.keys(required));
  let domReady=false,opening=false,opened=false,failed=false;
  let timeoutId;
  const route=()=>{const page=location.hash.slice(1).toLowerCase();return validPages.has(page)?page:"home";};
  const overlay=()=>document.getElementById("baliStartupOverlay");
  function fail(message){
    if(opened||failed)return;
    failed=true;clearTimeout(timeoutId);
    const label=document.getElementById("baliStartupMessage");
    if(label)label.textContent=message||"Не удалось загрузить актуальные данные BALI.";
    const retry=document.getElementById("baliStartupRetry");
    if(retry)retry.hidden=false;
    overlay()?.classList.add("is-error");
  }
  const waitImage=(img,limit=7000,strict=false)=>new Promise((resolve,reject)=>{
    if(!img||!img.getAttribute("src"))return resolve();
    if(img.complete)return img.naturalWidth>0||!strict?resolve():reject(Error("Не загрузился основной баннер"));
    let timer;
    const cleanup=()=>{clearTimeout(timer);img.removeEventListener("load",ok);img.removeEventListener("error",error);};
    const ok=()=>{cleanup();resolve();};
    const error=()=>{cleanup();strict?reject(Error("Не загрузился основной баннер")):resolve();};
    img.addEventListener("load",ok,{once:true});img.addEventListener("error",error,{once:true});
    timer=setTimeout(error,limit);
  });
  async function reveal(){
    if(opened||opening||failed||!domReady)return;
    const page=route();
    if(!required[page].every(path=>received.has(path)))return;
    opening=true;
    try{
      // Give the published page builder its two animation frames to apply the layout.
      await new Promise(done=>requestAnimationFrame(()=>requestAnimationFrame(done)));
      if(page==="home"){
        await waitImage(document.getElementById("baliPcHeroPoster"),8500,true);
        const photos=[...document.querySelectorAll("#homeEventCarousel .bali-home-event-card:not(.bali-home-event-placeholder) img")];
        if(window.matchMedia("(max-width:767px)").matches)
          photos.push(document.getElementById("baliMobileAboutBackgroundA"));
        await Promise.all(photos.map(img=>waitImage(img,5000)));
      }
      if(page!==route()){opening=false;reveal();return;}
      opened=true;clearTimeout(timeoutId);
      document.documentElement.classList.remove("bali-await-content");
      overlay()?.remove();
      window.dispatchEvent(new Event("bali:startup-ready"));
    }catch(error){
      fail(error?.message||"Не удалось загрузить изображения BALI.");
    }finally{opening=false;}
  }
  window.addEventListener("bali:public-snapshot",event=>{
    const path=event.detail?.path;
    if(typeof path==="string"){received.add(path);reveal();}
  });
  const ready=()=>{
    domReady=true;
    document.getElementById("baliStartupRetry")?.addEventListener("click",()=>location.reload());
    reveal();
  };
  if(document.readyState==="loading")document.addEventListener("DOMContentLoaded",ready,{once:true});
  else ready();
  window.addEventListener("hashchange",reveal);
  window.addEventListener("popstate",reveal);
  // Never reveal the shipped SECRET screen as a network-error fallback.
  timeoutId=setTimeout(()=>fail("Нет подтверждения актуальных данных. Проверьте подключение и повторите загрузку."),18000);
})();