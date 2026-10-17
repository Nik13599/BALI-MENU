/* BALI Admin: разделы, поиск по каталогу и сводные показатели.
   Firebase-права остаются в admin-firestore.js и Firestore Rules. */
(() => {
  "use strict";
  const $ = id => document.getElementById(id);
  const meta = {
    orders: ["Предзаказы", "Новые заявки, подтверждения и печать заказов"],
    menu: ["Меню и цены", "Каталог, доступность блюд и актуальные цены"],
    events: ["Мероприятия", "Даты, названия и время приёма предзаказов"]
  };
  const tabs = [...document.querySelectorAll("[data-admin-tab]")];
  const panels = [...document.querySelectorAll("[data-admin-panel]")];
  function activate(name, scroll = true) {
    if (!meta[name]) return;
    for (const tab of tabs) {
      const active = tab.dataset.adminTab === name;
      tab.classList.toggle("active",active);
      tab.setAttribute("aria-selected",String(active));
      tab.tabIndex = active ? 0 : -1;
    }
    for (const panel of panels) panel.hidden = panel.dataset.adminPanel !== name;
    $("adminPageTitle").textContent = meta[name][0];
    $("adminPageDescription").textContent = meta[name][1];
    if (scroll) window.scrollTo({top:0,behavior:"smooth"});
  }
  const nav=document.querySelector(".admin-tabs");
  if(nav) nav.setAttribute("role","tablist");
  for (const tab of tabs) {
    tab.setAttribute("role","tab");
    tab.addEventListener("click",()=>activate(tab.dataset.adminTab));
    tab.addEventListener("keydown",event=>{
      if(!["ArrowLeft","ArrowRight","ArrowUp","ArrowDown","Home","End"].includes(event.key))return;
      event.preventDefault();
      const i=tabs.indexOf(tab);
      const next=event.key==="Home"?0:event.key==="End"?tabs.length-1:
        (i+(["ArrowRight","ArrowDown"].includes(event.key)?1:-1)+tabs.length)%tabs.length;
      tabs[next].focus();
      activate(tabs[next].dataset.adminTab,false);
    });
  }
  panels.forEach(panel=>panel.setAttribute("role","tabpanel"));
  activate("orders",false);

  function openEditor(section,card,reset,focus) {
    activate(section,false);
    if(reset) $(reset)?.click();
    $(card)?.scrollIntoView({behavior:"smooth",block:"start"});
    if(focus) setTimeout(()=>$(focus)?.focus({preventScroll:true}),200);
  }
  $("addMenuBtn")?.addEventListener("click",()=>openEditor("menu","menuEditorCard","clearMenu","menuName"));
  $("addEventBtn")?.addEventListener("click",()=>openEditor("events","eventEditorCard","clearEvent","eventDateAdmin"));

  function filterMenu() {
    const phrase=($("menuSearch")?.value||"").trim().toLocaleLowerCase("ru");
    let count=0;
    for(const card of $("menuList")?.querySelectorAll(".entry")||[]) {
      const visible=card.textContent.toLocaleLowerCase("ru").includes(phrase);
      card.hidden=!visible;
      if(visible)count++;
    }
    if($("menuResultCount"))$("menuResultCount").textContent=String(count);
  }
  $("menuSearch")?.addEventListener("input",filterMenu);
  const menuList=$("menuList");
  if(menuList && typeof MutationObserver==="function") {
    const observer=new MutationObserver(filterMenu);
    observer.observe(menuList,{childList:true});
  }
  window.addEventListener("bali:admin:menu",({detail})=>{
    if($("adminStatMenu"))$("adminStatMenu").textContent=String(detail.count);
    filterMenu();
  });
  window.addEventListener("bali:admin:events",({detail})=>{
    if($("adminStatEvents"))$("adminStatEvents").textContent=String(detail.count);
  });
  window.addEventListener("bali:admin:orders",({detail})=>{
    if($("adminStatOrders"))$("adminStatOrders").textContent=String(detail.count);
    if($("adminStatPending"))$("adminStatPending").textContent=String(detail.pending);
    const badge=$("sidebarPendingCount");
    if(badge){badge.textContent=String(detail.pending);badge.hidden=detail.pending<=0;}
  });
  // Редактирование ранее добавленного товара/мероприятия всегда открывает нужный раздел.
  window.addEventListener("bali:admin:edit-menu",()=>activate("menu",false));
  window.addEventListener("bali:admin:edit-event",()=>activate("events",false));
})();
