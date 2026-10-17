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
  const search=document.getElementById("baliPcEventSearch");
  function filterBySearch(){
    const query=(search?.value||"").trim().toLocaleLowerCase("ru");
    for(const card of carousel.querySelectorAll(".bali-home-event-card")){
      const title=card.querySelector(".bali-home-event-info h3")?.textContent||"";
      const description=card.querySelector(".bali-home-event-description")?.textContent||"";
      card.hidden=Boolean(query)&&!(title+" "+description).toLocaleLowerCase("ru").includes(query);
    }
  }
  search?.addEventListener("input",filterBySearch);
  const observer=new MutationObserver(()=>{syncPosters();filterBySearch();});
  observer.observe(carousel,{childList:true});
  syncPosters();
  document.querySelectorAll("[data-bali-hero-step]").forEach(button=>{
    button.addEventListener("click",()=>{
      if(!slides.length)return;
      active=(active+Number(button.dataset.baliHeroStep)+slides.length)%slides.length;
      renderHero();
    });
  });
  function refreshNavigation(){
    const current=document.body.dataset.baliPage||"home";
    document.querySelectorAll(".bali-pc-navigation [data-bali-nav]").forEach(button=>{
      const active=button.dataset.baliNav===current;
      button.classList.toggle("active",active);
      if(active)button.setAttribute("aria-current","page");
      else button.removeAttribute("aria-current");
    });
  }
  const bodyObserver=new MutationObserver(refreshNavigation);
  bodyObserver.observe(document.body,{attributes:true,attributeFilter:["data-bali-page"]});
  document.querySelector(".bali-pc-navigation [data-bali-plans-link]")?.addEventListener("click",()=>{
    document.querySelector("#homeSection [data-home-events-view='planned']")?.click();
    document.getElementById("homeEventCarousel")?.scrollTo({left:0,behavior:"smooth"});
  });
  refreshNavigation();
})();
