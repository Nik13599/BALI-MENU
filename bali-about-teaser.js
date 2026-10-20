/* A teaser click opens the existing full About page.
   Prevent the native details expansion, which was clipped on short screens. */
(()=>{
  const summary=document.getElementById("baliPcAboutPreview");
  if(!summary)return;
  summary.addEventListener("click",event=>{
    if(event.target.closest(".bali-pc-about-events-link, .bali-pc-about-booking-link")){
      event.stopPropagation();
      return;
    }
    event.preventDefault();
    const details=summary.closest("details");
    if(details)details.open=false;
    if(window.location.hash!=="#about")window.location.hash="about";
  });
})();
