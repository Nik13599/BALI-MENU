/* BALI Admin: разделы, поиск по каталогу и сводные показатели.
   Firebase-права остаются в admin-firestore.js и Firestore Rules. */
(() => {
  "use strict";
  const $ = id => document.getElementById(id);
  const meta = {
    overview: ["Обзор BALI", "Быстрый доступ ко всем задачам заведения"],
    orders: ["Предзаказы", "Очередь, статусы заказов и доступные действия"],
    clients: ["Гости", "Поиск зарегистрированных гостей и история заказов"],
    menu: ["Меню и цены", "Четыре отдельные карты: кухня, бар, кальяны и чай"],
    events: ["Мероприятия", "Даты, афиши, расписание и приём предзаказов"],
    design: ["Конструктор сайта", "Визуальное редактирование страниц, размеров, типографики, изображений и анимаций для всех устройств"],
    appearance: ["Цвета сайта", "Готовые темы и цвета гостевого интерфейса"]
  };
  const sectionHelp = {
    orders: [
      "Выберите дату мероприятия в фильтре или оставьте «Все даты».",
      "Откройте заявку из очереди и выполните доступное действие; сначала проверьте данные гостя.",
      "Создавайте предзаказы по телефону без аккаунта гостя. Для отдельной рабочей страницы откройте «Предзаказы»."
    ],
    clients: [
      "Найдите гостя через поиск по имени, телефону или email.",
      "Откройте карточку для просмотра доступной истории его заказов.",
      "Профили доступны только уполномоченным администраторам."
    ],
    menu: [
      "Выберите сверху карту: кухня, бар, кальяны или чай.",
      "Для кухни сначала проверьте категории, затем добавляйте блюда и стоимость.",
      "Для остальных карт указывайте категорию, название, объём и цену. Не используйте фиктивные цены.",
      "Видимость раздела для гостей регулируется отдельно. Бар, кальяны и чай не добавляются в корзину предзаказа."
    ],
    events: [
      "Выберите существующую дату справа или нажмите «Новая дата».",
      "Укажите дату, название, время, афишу и при необходимости время закрытия предзаказов.",
      "Сохраните мероприятие и проверьте его на публичном календаре."
    ],
    design: [
      "Переключайте ПК, планшет и телефон в окне предпросмотра.",
      "Выберите блок главной страницы и отредактируйте соответствующие поля.",
      "Сохраните изменения в самом редакторе. Кнопка «Открыть сайт» нужна для проверки."
    ],
    appearance: [
      "Выберите готовую тему или задайте собственные цвета.",
      "Проверьте контраст и видимость текста в предпросмотре.",
      "Примените изменения через кнопку сохранения темы."
    ]
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
    const guide=$("adminSectionGuide");
    const guideText=$("adminSectionGuideText");
    if (guide) {
      guide.hidden = name === "overview";
      guide.open = false;
    }
    if (guideText) {
      guideText.replaceChildren();
      const steps=sectionHelp[name];
      if (steps) {
        const list=document.createElement("ol");
        for (const step of steps) {
          const li=document.createElement("li");
          li.textContent=step;
          list.append(li);
        }
        guideText.append(list);
      }
    }
    const back=$("adminReturnOverview");
    if (back) back.hidden=name === "overview";

    // Statistics remain on operational pages, but not in the visual designer.
    document.body.dataset.baliAdminSection=name;
    window.dispatchEvent(new CustomEvent("bali:admin:section",{detail:{section:name}}));
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
  activate("overview",false);

  // A prepared poster often already contains all its copy. One click removes
  // browser-generated text; the original image and image variants stay intact.
  const clearArtworkFields={
    about:["baliHomeAboutTitle","baliHomeAboutSubtitle","baliHomeAboutDescription"],
    merch:["baliHomeMerchName","baliHomeMerchDescription"],
    privilege:["baliPromoTitle","baliPromoDescription"]
  };
  for(const button of document.querySelectorAll("[data-bali-clear-artwork-copy]")){
    button.addEventListener("click",()=>{
      const ids=clearArtworkFields[button.dataset.baliClearArtworkCopy];
      if(!ids)return;
      for(const id of ids){
        const input=$(id);
        if(!input||input.disabled)return;
      }
      for(const id of ids){
        const input=$(id);
        input.value="";
        input.dispatchEvent(new Event("input",{bubbles:true}));
      }
      const status={
        about:"baliHomeAboutStatus",
        merch:"baliHomeMerchFeedback",
        privilege:"baliPromoStatus"
      }[button.dataset.baliClearArtworkCopy];
      if(status&&$(status))$(status).textContent="Надписи очищены. Сохраните блок, чтобы показать только изображение.";
    });
  }
  $("adminReturnOverview")?.addEventListener("click",()=>activate("overview"));
  document.querySelectorAll("[data-admin-go]").forEach(button=>{
    button.addEventListener("click",()=>{
      const target=button.dataset.adminGo;
      if (!meta[target]) return;
      activate(target);
      const catalog=button.dataset.adminMenu;
      if (target==="menu" && catalog) {
        const tab=document.querySelector('[data-bali-catalog-tab="'+catalog+'"]');
        tab?.click();
      }
    });
  });


  function openEditor(section,card,reset,focus) {
    activate(section,false);
    if(reset) $(reset)?.click();
    $(card)?.scrollIntoView({behavior:"smooth",block:"start"});
    if(focus) setTimeout(()=>$(focus)?.focus({preventScroll:true}),200);
  }
  $("addEventBtn")?.addEventListener("click",()=>openEditor("events","eventEditorCard","clearEvent","eventDateAdmin"));

  function filterMenu() {
    const phrase=($("menuSearch")?.value||"").trim().toLocaleLowerCase("ru");
    let count=0;
    for(const group of $("menuList")?.querySelectorAll(".menu-category-group")||[]) {
      const title=group.querySelector(".menu-category-title strong")?.textContent?.toLocaleLowerCase("ru")||"";
      let matched=0;
      for(const row of group.querySelectorAll(".entry")) {
        const visible=!phrase||title.includes(phrase)||row.textContent.toLocaleLowerCase("ru").includes(phrase);
        row.hidden=!visible;
        if(visible){matched++;count++;}
      }
      group.hidden=matched===0;
      if(phrase&&matched)group.open=true;
    }
    if($("menuResultCount"))$("menuResultCount").textContent=String(count);
  }
  $("menuSearch")?.addEventListener("input",filterMenu);
  const menuList=$("menuList");
  if(menuList && typeof MutationObserver==="function") {
    const observer=new MutationObserver(filterMenu);
    observer.observe(menuList,{childList:true});
  }
  window.addEventListener("bali:admin:catalog-rendered",filterMenu);
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
  window.addEventListener("bali:admin:navigate",({detail})=>activate(detail.section,false));
})();
