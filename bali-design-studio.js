/* BALI v82 — actual website inside an editable responsive canvas.
   The iframe executes the very same Firebase-backed index.html as visitors. */
(() => {
  "use strict";
  const $=id=>document.getElementById(id);
  const panel=$("adminDesignPanel");
  const frame=$("baliDesignLiveFrame");
  const stage=$("baliDesignScaledFrame");
  const canvas=$("baliDesignCanvas");
  if(!panel||!frame||!stage||!canvas)return;

  const devices={
    desktop:{width:1440,height:900,label:"ПК"},
    tablet:{width:820,height:1180,label:"Планшет"},
    phone:{width:390,height:844,label:"Телефон"}
  };
  const labels={
    privilege:["BALI PRIVILEGE","Загрузите макет с пропорциями, указанными по фактическому размеру блока ниже. Размер зависит от экрана."],
    about:["О клубе BALI","Название, описание, фото 900×1400 / 1200×900 / 900×1200."],
    mobileAbout:["Мобильный блок «О клубе»","До восьми фонов, порядок, публикация и загрузка изображений 1200×600."],
    idCard:["Bali Card","Персональная цифровая карта гостя. Уровни и права настраиваются через BALI PRIVILEGE."],
    navigation:["Логотип и навигация","Тексты пунктов и собственные значки для кнопок."],
    calendar:["BALI календарь","Заголовки календаря и ссылка на редактор мероприятий."],
    menuBanner:["Большая кнопка «Меню»","Текст, подпись и собственный значок кнопки перехода."],
    contacts:["Контактная информация","Телефон, Telegram, Instagram и Яндекс Карты."],
    events:["Мероприятия","Действующие афиши, даты и информация из Firebase."],
    catalog:["Каталог меню","Актуальные блюда и карты, категории, цены и доступность из Firebase."],
    profile:["Профиль посетителя","Настройки профиля защищены учётными данными посетителя."]
  };
  let device="desktop",section="home",selected="privilege",skipClick=false;
  const editors=[...panel.querySelectorAll("[data-design-editor]")];
  const controlButtons=[...panel.querySelectorAll("[data-studio-device]")];
  const pages=[...panel.querySelectorAll("[data-studio-page]")];
  const status=$("baliStudioLoadStatus");
  const label=$("baliStudioViewportLabel");
  const heroSizing=$("baliPromoRealSize");
  let heroSizeObserver=null;
  function reportArtworkSize(){
    if(!heroSizing)return;
    let liveDoc;
    try{liveDoc=frame.contentDocument;}catch{return;}
    const element=liveDoc?.querySelector(".bali-pc-hero");
    const bounds=element?.getBoundingClientRect();
    if(!bounds||bounds.width<2||bounds.height<2){
      heroSizing.textContent=device==="desktop"
        ?"Ждём загрузку живого предпросмотра ПК, чтобы измерить баннер…"
        :"На "+(device==="tablet"?"планшете":"телефоне")+" этот баннер в текущей компоновке не показывается. Его размер здесь не задаётся.";
      return;
    }
    const width=Math.round(bounds.width);
    const height=Math.round(bounds.height);
    // 2x source pixels for sharp raster artwork, with the exact live aspect.
    const ratio=(width/height).toFixed(3);
    const source=liveDoc.querySelector("#baliPcHeroPoster");
    const sourceRatio=source?.naturalWidth>0&&source?.naturalHeight>0
      ?source.naturalWidth/source.naturalHeight:null;
    const mismatch=sourceRatio&&Math.abs(sourceRatio-width/height)>0.06
      ?" ВНИМАНИЕ: текущий загруженный баннер имеет пропорции "+sourceRatio.toFixed(3)+":1 — не как этот блок. Перезагрузите оригинал, подготовленный по размерам выше."
      :"";
    heroSizing.textContent="Размер блока в предпросмотре "+devices[device].width+"×"+devices[device].height+
      ": "+width+" × "+height+" px (пропорция "+ratio+":1). "+
      "Готовьте баннер точно "+width*2+" × "+height*2+" px для этого экрана (2× для чёткости). "+
      "На других мониторах пропорции немного меняются — сайт вписывает изображение без обрезки."+mismatch;
    const sample=panel.querySelector(".bali-promo-editor .bali-design-spec-art-hero");
    if(sample){
      sample.style.aspectRatio=width+" / "+height;
      const name=sample.querySelector("span");
      if(name)name.textContent=width+" × "+height+" px";
    }
    const preview=$("baliPromoImagePreview");
    if(preview)preview.style.aspectRatio=width+" / "+height;
  }
  const focusSelectedInFrame=()=>{
    let doc;
    try{doc=frame.contentDocument;}catch{return;}
    if(!doc)return;
    doc.querySelectorAll("[data-bali-editor-selected]").forEach(node=>node.removeAttribute("data-bali-editor-selected"));
    const targets={
      privilege:".bali-pc-hero",about:".bali-pc-about",mobileAbout:".bali-mobile-home-hero",idCard:".bali-pc-id-card",
      calendar:".bali-pc-events-title",menuBanner:"#menuNavBtn",
      navigation:".bali-pc-navigation",contacts:".bali-pc-sidebar-contacts",
      events:"#eventsGrid",catalog:"#menuPage",profile:".header #accountBtn"
    };
    const target=doc.querySelector(targets[selected]);
    if(target&&target.getClientRects().length)target.setAttribute("data-bali-editor-selected","");
  };
  function chooseEditor(id){
    if(!labels[id])return;
    selected=id;
    for(const item of editors)item.hidden=item.dataset.designEditor!==id;
    const [title,description]=labels[id];
    $("baliStudioInspectorTitle").textContent=title;
    $("baliStudioInspectorHint").textContent=description;
    focusSelectedInFrame();
  }
  function fit(){
    const {width,height}=devices[device];
    const available=Math.max(260,canvas.clientWidth-24);
    const scale=Math.min(1,available/width);
    // Keep the real media-query viewport; scale just its representation.
    stage.style.width=Math.round(width*scale)+"px";
    stage.style.height=Math.round(height*scale)+"px";
    stage.style.setProperty("--bali-studio-scale",String(scale));
    frame.style.width=width+"px";
    frame.style.height=height+"px";
    frame.style.transform="scale("+scale+")";
    label.textContent=devices[device].label+" · "+width+" × "+height+" px · "+Math.round(scale*100)+"%";
    requestAnimationFrame(reportArtworkSize);
  }
  function chooseDevice(name){
    if(!devices[name])return;
    device=name;
    for(const button of controlButtons){
      const active=button.dataset.studioDevice===name;
      button.classList.toggle("active",active);
      button.setAttribute("aria-pressed",String(active));
    }
    fit();
  }
  function choosePage(name){
    if(!["home","events","menu"].includes(name))return;
    section=name;
    for(const button of pages){
      const active=button.dataset.studioPage===name;
      button.classList.toggle("active",active);
      button.setAttribute("aria-pressed",String(active));
    }
    try{
      const doc=frame.contentDocument;
      const nav=doc?.querySelector('.bali-pc-navigation [data-bali-nav="'+name+'"]');
      if(nav){
        skipClick=true;
        nav.click();
        skipClick=false;
      }
    }catch(error){skipClick=false;console.warn("BALI studio preview navigation:",error);}
    chooseEditor(name==="menu"?"catalog":name==="events"?"events":"privilege");
  }
  function selectionFrom(target){
    if(!(target instanceof frame.contentWindow.Element))return null;
    const ruleOrder=[
      ["privilege",".bali-pc-hero"],
      ["mobileAbout",".bali-mobile-home-hero"],
      ["about",".bali-pc-about"],
      ["idCard",".bali-pc-id-card"],
      ["menuBanner","#menuNavBtn, .bali-menu-heading-row"],
      ["calendar",".bali-pc-events-title, #eventsSection .events-topbar"],
      ["events",".bali-home-event-card, #homeEventCarousel, #eventsGrid, .event-card"],
      ["contacts",".bali-pc-sidebar-contacts, .bali-home-contacts-card, #contactsSection"],
      ["navigation",".bali-pc-navigation, .bali-pc-brand"],
      ["profile",".header #accountBtn, .bali-pc-profile-menu"],
      ["catalog","#menuPage"]
    ];
    for(const [id,selector] of ruleOrder)if(target.closest(selector))return id;
    return null;
  }
  function attachFrame(){
    let doc;
    try{doc=frame.contentDocument;}catch{
      status.textContent="Предпросмотр недоступен: схема должна загружаться с того же сайта.";
      return;
    }
    if(!doc)return;
    heroSizeObserver?.disconnect();
    const liveHero=doc.querySelector(".bali-pc-hero");
    if(liveHero&&typeof ResizeObserver!=="undefined"){
      heroSizeObserver=new ResizeObserver(reportArtworkSize);
      heroSizeObserver.observe(liveHero);
    }
    doc.querySelector("#baliPcHeroPoster")?.addEventListener("load",reportArtworkSize);
    requestAnimationFrame(reportArtworkSize);
    if(doc.documentElement.dataset.baliStudioCapture)return;
    doc.documentElement.dataset.baliStudioCapture="true";
    const style=doc.createElement("style");
    style.textContent=`
      .bali-pc-hero:hover,.bali-pc-about:hover,.bali-mobile-home-hero:hover,.bali-pc-id-card:hover,
      #menuNavBtn:hover,.bali-pc-events-title:hover,.bali-pc-navigation:hover,
      .bali-pc-sidebar-contacts:hover,.bali-home-event-card:hover,
      .event-card:hover,#menuPage .menu-item:hover{
        outline:3px solid rgba(185,255,81,.85)!important;
        outline-offset:-3px!important;cursor:crosshair!important;
      }
      [data-bali-editor-selected]{
        outline:3px solid #b9ff51!important;
        outline-offset:-3px!important;
      }
    `;
    doc.head.append(style);
    doc.addEventListener("click",event=>{
      if(skipClick||window.BaliBuilderEditor?.isActive?.())return;
      const area=selectionFrom(event.target);
      // The canvas is an editing surface, not an order checkout.
      event.preventDefault();
      event.stopImmediatePropagation();
      if(area)chooseEditor(area);
      else status.textContent="Выберите один из выделяемых блоков схемы. Для перехода между страницами используйте кнопки сверху.";
    },true);
    doc.addEventListener("submit",event=>{if(window.BaliBuilderEditor?.isActive?.())return;event.preventDefault();event.stopImmediatePropagation();},true);
    status.textContent="Живая схема загружена: данные сайта обновляются через Firebase.";
    focusSelectedInFrame();
  }
  frame.addEventListener("load",attachFrame);
  const desktopPreset=$("baliPromoViewportPreset");
  desktopPreset?.addEventListener("change",()=>{
    const size=desktopPreset.value;
    if(size==="current"){
      devices.desktop.width=Math.max(1180,Math.round(window.innerWidth));
      devices.desktop.height=Math.max(600,Math.round(window.innerHeight));
    }else if(["1440x900","1920x1080","1792x852","1366x768"].includes(size)){
      const [width,height]=size.split("x").map(Number);
      if(width>=1180&&height>=600&&width<=3840&&height<=2160){
        devices.desktop.width=width;
        devices.desktop.height=height;
      }
    }
    chooseDevice("desktop");
  });
  for(const button of controlButtons)button.addEventListener("click",()=>chooseDevice(button.dataset.studioDevice));
  for(const button of pages)button.addEventListener("click",()=>choosePage(button.dataset.studioPage));
  panel.querySelectorAll("[data-design-admin-route]").forEach(button=>{
    button.addEventListener("click",()=>window.dispatchEvent(new CustomEvent("bali:admin:navigate",{
      detail:{section:button.dataset.designAdminRoute}
    })));
  });
  const observer=new ResizeObserver(()=>fit());
  observer.observe(canvas);
  window.addEventListener("bali:admin:section",event=>{
    if(event.detail.section==="design"){
      if(frame.dataset.src&&!frame.hasAttribute("src"))frame.src=frame.dataset.src;
      fit();attachFrame();
    }
  });
  chooseEditor("privilege");
  chooseDevice("desktop");
  function resizeActiveViewport(width,height){
    const limits={desktop:[1180,3840,600,2160],tablet:[768,1179,500,2100],phone:[320,767,480,1700]}[device];
    const w=Number(width),h=Number(height);
    if(Number.isFinite(w))devices[device].width=Math.round(Math.max(limits[0],Math.min(limits[1],w)));
    if(Number.isFinite(h))devices[device].height=Math.round(Math.max(limits[2],Math.min(limits[3],h)));
    fit();
    return {...devices[device]};
  }
  window.BaliDesignStudio={select:chooseEditor,device:chooseDevice,page:choosePage,viewport:resizeActiveViewport,getViewport:()=>({...devices[device]})};
})();
