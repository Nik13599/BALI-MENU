/* About BALI is a screen inside the existing navigation shell. */
(()=>{
  "use strict";
  function openAbout(event){
    event?.preventDefault();
    event?.stopPropagation();
    if(window.location.hash.toLowerCase()==="#about"){
      try{document.getElementById("baliAboutFrame")?.contentWindow?.scrollTo(0,0);}catch(_e){}
      return;
    }
    window.location.hash="about";
  }
  document.getElementById("baliMobileAboutBtn")?.addEventListener("click",openAbout);
  document.querySelector(".bali-pc-about > summary")?.addEventListener("click",openAbout);
})();
