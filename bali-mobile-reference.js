/* BALI: the About button leads to a full editorial page instead of a small dialog. */
(()=>{
  "use strict";
  function openAbout(event){
    event.preventDefault();
    window.location.assign("./about.html");
  }
  document.getElementById("baliMobileAboutBtn")?.addEventListener("click",openAbout);
  const desktopSummary=document.querySelector(".bali-pc-about > summary");
  desktopSummary?.addEventListener("click",openAbout);
})();
