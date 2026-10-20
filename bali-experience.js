/* BALI Experience: contextual guidance without changing ordering, age
   verification or navigation. Page state and available modes stay owned
   by app.js / Firestore, not duplicated here. */
(() => {
  "use strict";
  const purpose=document.getElementById("baliMenuPurpose");
  if(!purpose)return;
  const descriptions=Object.freeze({
    kitchen:"Кухня BALI: выберите блюда и добавьте их в предзаказ к своему мероприятию.",
    bar:"Барная карта: ознакомьтесь с ассортиментом и ценами. Заказ — в клубе, 18+.",
    hookah:"Кальянная карта: ознакомьтесь с ассортиментом и ценами. Заказ — в клубе, 18+.",
    tea:"Чайная карта: ознакомьтесь с ассортиментом и ценами. Заказ — в клубе."
  });
  const labels=Object.freeze({
    kitchen:"Кухня — доступен предзаказ",
    bar:"Барная карта — только ознакомление, 18+",
    hookah:"Кальянная карта — только ознакомление, 18+",
    tea:"Чайная карта — только ознакомление"
  });
  function render(mode){
    const selected=Object.hasOwn(descriptions,mode)?mode:"kitchen";
    purpose.textContent=descriptions[selected];
    document.querySelectorAll("#baliMenuModeSwitch [data-bali-menu-mode]").forEach(button=>{
      const key=button.dataset.baliMenuMode;
      if(Object.hasOwn(labels,key))button.setAttribute("aria-description",labels[key]);
    });
  }
  window.addEventListener("bali:menu-mode-changed",event=>render(event.detail?.mode));
  // The initial mode may already have been chosen before this script loads.
  render(window.BaliActiveMenuMode||"kitchen");
})();
