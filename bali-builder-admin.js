/* BALI Site Builder — admin-only visual editor, separate drafts and publishing. */
import {getApp,getApps,initializeApp} from "https://www.gstatic.com/firebasejs/10.14.1/firebase-app.js";
import {getAuth,onAuthStateChanged} from "https://www.gstatic.com/firebasejs/10.14.1/firebase-auth.js";
import {getFirestore,doc,getDoc,onSnapshot,setDoc,writeBatch,serverTimestamp} from "https://www.gstatic.com/firebasejs/10.14.1/firebase-firestore.js";
import {prepareImage} from "./image-compressor.js?v=20261020-2";
import {createSimplePromoEditor} from "./bali-promo-simple-editor.js?v=20261021-removal4";
const $=id=>document.getElementById(id),core=window.BaliBuilderCore,frame=$("baliDesignLiveFrame");
const panel=$("adminDesignPanel"),inspector=$("baliBuilderInspector");
if(!panel||!frame||!inspector||!core)throw new Error("BALI Builder: initialization elements missing");
const app=getApps().length?getApp():initializeApp(window.BALI_FIREBASE_CONFIG);
const auth=getAuth(app),db=getFirestore(app);
const draftRef=doc(db,"settings","siteBuilderDraft"),publishedRef=doc(db,"settings","siteBuilderPublished");
const listDevices=["desktop","tablet","phone"];
// Homepage blocks retain the responsive sizing defined by the existing BALI layout.
const homeBlocks=[
 ["Рекламный слайдер / Новый год",".bali-pc-hero"],
 ["Первый экран · телефон",".bali-mobile-home-hero"],
 ["Календарь · весь блок",".bali-home-events-panel"],
 ["Календарь · заголовок",".bali-pc-events-title"],
 ["Карточки мероприятий","#homeEventCarousel"],
 ["О клубе",".bali-pc-about"],
 ["BALI ID / Privilege","#baliHomeIdCard"],
 ["Меню · большая кнопка","#menuNavBtn"],
 ["Контактный блок",".bali-home-contacts-card, .bali-pc-sidebar-contacts"],
 ["Контакты · заголовок",".bali-home-contacts-heading h2"],
 ["Контакты · телефон",".bali-home-social .bali-social-phone"],
 ["Контакты · Telegram",".bali-home-social .bali-social-telegram"],
 ["Контакты · Instagram",".bali-home-social .bali-social-instagram"],
 ["Контакты · Яндекс Карты",".bali-home-map"],
 ["О клубе · заголовок","#baliPcAboutTitle"],
 ["О клубе · описание","#baliPcAboutDescription"],
 ["Главная · слоган",".bali-mobile-home-hero-copy h1"],
 ["Главная · подпись",".bali-mobile-hero-tagline"],
 ["Логотип","#homeBrandBtn"],
 ["Логотип · изображение","#homeBrandBtn img"],
 ["Кнопка Подробнее о клубе","#baliMobileAboutBtn"],
 ["Кнопка Площадка и аренда",".bali-pc-about-action"],
 ["Кнопка Афиша вечеринок",".bali-pc-about-events-link"],
 ["Профиль · телефон","#baliMobileProfileBtn"],
 ["BALI ID · телефон","#baliMobileIdBtn"],
 ["ПК · Главная",'.bali-pc-navigation [data-bali-nav="home"]'],
 ["ПК · Календарь",'.bali-pc-navigation [data-bali-nav="events"]'],
 ["ПК · Меню",'.bali-pc-navigation [data-bali-nav="menu"]'],
 ["ПК · Корзина","#baliPcCartBtn"],
 ["Телефон · Главная",'.bali-bottom-nav [data-bali-nav="home"]'],
 ["Телефон · Календарь",'.bali-bottom-nav [data-bali-nav="events"]'],
 ["Телефон · Меню",'.bali-bottom-nav [data-bali-nav="menu"]'],
 ["Телефон · Инфо",'.bali-bottom-nav [data-bali-nav="contacts"]'],
 ["Телефон · Профиль",'.bali-bottom-nav [data-bali-nav="profile"]']
];
const homeCardSelector=".bali-pc-hero,.bali-mobile-home-hero,.bali-home-events-panel,.bali-pc-about,.bali-pc-id-card,.bali-home-menu-banner,.bali-home-contacts-card,.bali-pc-sidebar-contacts,#homeSection,.header";
let model=core.emptyModel(),published=core.emptyModel(),currentDevice="desktop",currentPage="home";
let authorized=false,loading=false,saving=false,dirty=false,enabled=true,authEpoch=0,unsub=null,selection=null,overlay=null,drag=null,history=[],future=[];
let writingImage=false,styleClipboard=null,promoEditor=null;
const view={
 status:$("baliBuilderStatus"),page:$("baliBuilderPage"),mode:$("baliBuilderMode"),
 draft:$("baliBuilderSaveDraft"),publish:$("baliBuilderPublish"),restore:$("baliBuilderRestore"),
 undo:$("baliBuilderUndo"),redo:$("baliBuilderRedo"),copy:$("baliBuilderCopy"),
 addButtons:[...panel.querySelectorAll("[data-bali-builder-add]")],viewportWidth:$("baliBuilderViewportWidth"),viewportHeight:$("baliBuilderViewportHeight")
};
const animations=[
 ["","Сохранить текущую анимацию"],["none","Без анимации"],["fade","Плавное появление"],["reveal","Раскрытие маской"],
 ["slide-left","Появление справа"],["slide-right","Появление слева"],["zoom","Масштабирование"],
 ["float","Парение"],["pulse","Пульсация"],["glow","Свечение"],["bounce","Подпрыгивание"],
 ["tilt","Покачивание"],["shimmer","Мерцание"],["spin","Вращение"],
 ["heartbeat","Биение"],["flicker","Мигание"]
];
const effects=[
 ["","Сохранить текущий эффект"],["none","Убрать эффект"],["glass","Матированное стекло"],
 ["neon","Неоновая подсветка"],["hover-lift","Подъём при наведении"],
 ["hover-glow","Свечение при наведении"],["grayscale","Чёрно-белый"],
 ["sepia","Сепия"],["saturate","Насыщенность"],["blur","Размытие"]
];
const metadata=[
 ["width","Ширина","text","Размер (px или %)","320px"],
 ["height","Высота","text","Размер (px или %)","100px"],
 ["minHeight","Мин. высота","text","Размер (px или %)",""],
 ["minWidth","Мин. ширина","text","px или %",""],
 ["maxWidth","Макс. ширина","text","px или %",""],
 ["maxHeight","Макс. высота","text","px или %",""],
 ["translateX","Сдвиг по X","number","px",0],
 ["translateY","Сдвиг по Y","number","px",0],
 ["padding","Внутренний отступ","number","px",0],
 ["marginTop","Отступ сверху","number","px",0],
 ["marginBottom","Отступ снизу","number","px",0],
 ["marginLeft","Отступ слева","number","px",0],
 ["marginRight","Отступ справа","number","px",0],
 ["gap","Расстояние между элементами","number","px",0],
 ["borderRadius","Скругление","number","px",0],
 ["fontFamily","Шрифт","select","",core.fonts.map(x=>[x,x])],
 ["fontSize","Размер шрифта","number","px",16],
 ["fontWeight","Насыщенность","select","",[["300","Light 300"],["400","Regular 400"],["500","Medium 500"],["600","SemiBold 600"],["700","Bold 700"],["800","ExtraBold 800"],["900","Black 900"]]],
 ["fontStyle","Начертание","select","",[["normal","Обычный"],["italic","Курсив"]]],
 ["textAlign","Выравнивание","select","",[["left","Слева"],["center","По центру"],["right","Справа"],["justify","По ширине"]]],
 ["textTransform","Регистр текста","select","",[["none","Без изменения"],["uppercase","ЗАГЛАВНЫЕ"],["lowercase","строчные"],["capitalize","С Заглавных"]]],
 ["lineHeight","Межстрочный","number","коэффициент",1.3],
 ["letterSpacing","Межбуквенный","number","px",0],
 ["color","Цвет текста","color","", "#ffffff"],
 ["backgroundColor","Цвет фона","color","", "#151a20"],
 ["borderColor","Цвет рамки","color","", "#657169"],
 ["borderWidth","Толщина рамки","number","px",0],
 ["opacity","Прозрачность","number","0…1",1],
 ["shadow","Тень","select","",[["none","Без тени"],["soft","Мягкая"],["deep","Глубокая"],["glow","С подсветкой"]]],
 ["buttonStyle","Форма кнопки","select","",[["none","Исходный стиль"],["solid","Заливка"],["outline","Контур"],["glass","Стеклянная"],["pill","Капсула"]]],
 ["display","Отображение","select","",[["block","Блок"],["inline-block","В строке"],["flex","Гибкий контейнер"],["grid","Сетка"],["none","Скрыть на этом устройстве"]]],
 ["flexDirection","Направление элементов","select","",[["row","В строку"],["column","В столбец"],["row-reverse","В обратную строку"],["column-reverse","В обратный столбец"]]],
 ["justifyContent","Выравнивание элементов","select","",[["flex-start","В начало"],["center","По центру"],["flex-end","В конец"],["space-between","По краям"],["space-around","С равными полями"],["space-evenly","Равномерно"]]],
 ["alignItems","Выравнивание по высоте","select","",[["stretch","Растянуть"],["flex-start","Сверху"],["center","По центру"],["flex-end","Снизу"],["baseline","По базовой линии"]]],
 ["objectFit","Масштаб фото","select","",[["cover","Заполнить с обрезкой"],["contain","Вместить полностью"],["fill","Растянуть"],["none","Без масштабирования"],["scale-down","Уменьшать по размеру"]]],
 ["backgroundPosition","Позиция фона","select","",[["center","По центру"],["top","Сверху"],["bottom","Снизу"],["left","Слева"],["right","Справа"]]],
 ["backgroundSize","Заполнение фона","select","",[["cover","Заполнить с обрезкой"],["contain","Показать полностью"],["auto","Исходный размер"],["100% 100%","Растянуть на весь блок"]]],
 ["objectPosition","Положение изображения","select","",[["center","По центру"],["top","Верхняя часть"],["bottom","Нижняя часть"],["left","Левый край"],["right","Правый край"]]],
 ["aspectRatio","Пропорции блока","select","",[["auto","Автоматически"],["1 / 1","Квадрат 1:1"],["16 / 9","Широкий 16:9"],["4 / 3","Горизонтальный 4:3"],["3 / 4","Вертикальный 3:4"],["9 / 16","Сторис 9:16"]]],
 ["overflow","Обрезка за пределами блока","select","",[["visible","Показывать"],["hidden","Скрывать"],["clip","Обрезать"],["auto","Прокрутка по необходимости"]]],
 ["zIndex","Уровень слоя","number","от −10 до 100",0],
 ["animation","Анимация","select","",animations],
 ["animationDuration","Длительность","number","секунды · 0.2–20",3],
 ["animationDelay","Задержка","number","секунды · 0–15",0],
 ["animationIteration","Повтор","select","",[["1","1 раз"],["2","2 раза"],["3","3 раза"],["infinite","Бесконечно"]]],
 ["animationEasing","Плавность","select","",[["ease","Обычная"],["ease-in","Ускорение"],["ease-out","Замедление"],["ease-in-out","Плавное ускорение и замедление"],["linear","Равномерно"]]],
 ["effect","Эффект","select","",effects],
 ["rotate","Поворот","number","градусы",0],
 ["scale","Масштаб","number","×",1]
];
const titleGroups=[
 ["Габариты и позиция",["width","height","minWidth","maxWidth","minHeight","maxHeight","translateX","translateY","padding","marginTop","marginBottom","marginLeft","marginRight","borderRadius"]],
 ["Макет и медиа",["display","flexDirection","justifyContent","alignItems","gap","objectFit","objectPosition","backgroundPosition","backgroundSize","aspectRatio","overflow","zIndex"]],
 ["Шрифты и текст",["fontFamily","fontSize","fontWeight","fontStyle","textAlign","textTransform","lineHeight","letterSpacing"]],
 ["Цвета и кнопки",["color","backgroundColor","borderColor","borderWidth","borderRadius","opacity","shadow","buttonStyle"]],
 ["Анимация и эффекты",["animation","animationDuration","animationDelay","animationIteration","animationEasing","effect","rotate","scale"]]
];
const inputs=new Map();
function msg(v){if(view.status)view.status.textContent=v;}
function setControls(){
 const can=authorized&&!saving&&!writingImage;
 view.draft.disabled=!can||!dirty;view.publish.disabled=!can;view.restore.disabled=!can;
 view.undo.disabled=!history.length;view.redo.disabled=!future.length;
 view.copy.disabled=!can;
 for(const b of view.addButtons)b.disabled=!can;
 for(const control of inspector.querySelectorAll("input,select,textarea,button"))
  control.disabled=control.id==="baliBuilderHomeBlock"?!can:!can||!selection;
}
function mark(){dirty=true;msg("Изменения только в предпросмотре. Сохраните черновик или опубликуйте.");setControls();}
const clone=x=>JSON.parse(JSON.stringify(x));
function remember(){
 history.push(clone(model));if(history.length>40)history.shift();future=[];
}
function commit(edit){
 if(!authorized)return;
 remember();edit();model=core.cleanModel(model);mark();refreshCanvas();
}
function optionList(options){
 const frag=document.createDocumentFragment();
 for(const [value,label] of options){
  const o=document.createElement("option");o.value=value;o.textContent=label;frag.append(o);
 }return frag;
}
function newField(id,title,kind,help,choices){
 const wrap=document.createElement("label");wrap.className="bali-builder-field";
 const caption=document.createElement("span");caption.textContent=title;wrap.append(caption);
 const input=document.createElement(kind==="select"?"select":"input");
 input.dataset.builderProp=id;
 if(kind==="select"){
  const options=Array.isArray(choices)?choices:[];
  input.append(optionList([["","Не изменять"],...options]));
 }else{
  input.type=kind==="color"?"color":kind==="number"?"number":"text";
  if(kind==="number")input.step=["lineHeight","opacity","scale","animationDuration","animationDelay"].includes(id)?"0.1":"1";
  if(kind==="number"){input.min=id==="fontSize"?"8":id==="scale"?"0.2":undefined;input.max=id==="opacity"?"1":undefined;}
  input.placeholder=help||"";
 }
 input.addEventListener(kind==="text"||kind==="number"?"change":"input",()=>changeProp(id,input.value));
 wrap.append(input);
 if(help&&kind!=="text"){const small=document.createElement("small");small.textContent=help;wrap.append(small);}
 inputs.set(id,input);return wrap;
}
function initialize(){
 inspector.replaceChildren();
 const heading=document.createElement("div");heading.className="bali-builder-inspector-heading";
 heading.innerHTML='<strong id="baliBuilderSelected">Выберите элемент на сайте</strong><small id="baliBuilderSelector">Настройки применяются только к выбранному устройству</small>';
 inspector.append(heading);
 const homePicker=document.createElement("section");
 homePicker.className="bali-builder-home-picker";
 homePicker.innerHTML="<strong>ГЛАВНАЯ · ВСЕ БЛОКИ</strong><small>Размеры карточек остаются прежними. Выберите блок, надпись или кнопку; Alt + клик для вложенного элемента.</small>";
 const chooser=document.createElement("select");chooser.id="baliBuilderHomeBlock";
 chooser.setAttribute("aria-label","Выбор блока главной");
 chooser.append(new Option("Выберите блок или кнопку…",""));
 for(const [label,selector] of homeBlocks)chooser.append(new Option(label,selector));
 chooser.addEventListener("change",()=>{
  if(!chooser.value)return;
  const el=frameDoc()?.querySelector(chooser.value);
  if(!el){msg("Этот элемент недоступен в текущем предпросмотре.");return;}
  choose(el,{deep:true});el.scrollIntoView({block:"nearest",inline:"nearest"});
 });
 homePicker.append(chooser);inspector.append(homePicker);
 const trail=document.createElement("nav");
 trail.id="baliBuilderLayerTrail";
 trail.className="bali-builder-layer-trail";
 trail.setAttribute("aria-label","Иерархия элементов страницы");
 inspector.append(trail);
 promoEditor=createSimplePromoEditor({db,frame,canEdit:()=>authorized,notify:msg});
 inspector.append(promoEditor.root);
 const content=document.createElement("div");content.className="bali-builder-content";
 content.innerHTML='<label class="bali-builder-field"><span>Текст элемента</span><textarea data-builder-main="text" rows="3" placeholder="Новый текст"></textarea></label>'+
 '<label class="bali-builder-field"><span>Переход кнопки / ссылки</span><select data-builder-main="link"></select><input data-builder-main="url" type="text" placeholder="https://... или tel:+375..." hidden></label>'+
 '<label class="bali-builder-field"><span>Фоновое изображение или фото</span><input data-builder-main="image" type="text" placeholder="https://..."><input data-builder-main="upload" type="file" accept="image/png,image/jpeg,image/webp,image/heic,image/heif"><small>Загруженная картинка сжимается перед сохранением</small></label>';
 inspector.append(content);
 const iconBox=document.createElement("section");
 iconBox.className="bali-builder-icon-editor";
 iconBox.hidden=true;
 iconBox.innerHTML='<strong>Значок выбранной кнопки</strong>'+
  '<p>Выберите фирменную иконку или загрузите свою. Все переходы и действия кнопки сохранятся.</p>'+
  '<label class="bali-builder-field"><span>Готовые иконки BALI</span><select data-builder-icon-name></select></label>'+
  '<label class="bali-builder-field"><span>Своя иконка · HTTPS или WebP</span><input data-builder-icon-url type="text" placeholder="https://..."></label>'+
  '<label class="bali-builder-field"><span>Загрузить PNG / JPG / WebP</span><input data-builder-icon-file type="file" accept="image/png,image/jpeg,image/webp"></label>'+
  '<label class="bali-builder-field"><span>Размер иконки, px</span><input data-builder-icon-size type="number" min="12" max="72" value="24"></label>'+
  '<button type="button" data-builder-icon-reset>Вернуть исходную иконку</button>';
 const iconList=iconBox.querySelector("[data-builder-icon-name]");
 iconList.append(optionList([["","Исходная иконка"],...core.iconNames.map(name=>[name,name])]));
 iconList.addEventListener("change",()=>changeIcon("iconName",iconList.value));
 iconBox.querySelector("[data-builder-icon-url]").addEventListener("change",e=>changeIcon("icon",e.target.value.trim()));
 iconBox.querySelector("[data-builder-icon-size]").addEventListener("change",e=>changeProp("iconSize",e.target.value));
 iconBox.querySelector("[data-builder-icon-reset]").addEventListener("click",()=>commit(()=>{const it=ensureItem();if(it){delete it.props.icon;delete it.props.iconName;delete it.props.iconSize;}}));
 iconBox.querySelector("[data-builder-icon-file]").addEventListener("change",async e=>{
  const file=e.target.files?.[0];if(!file||!authorized||!selection)return;
  const identity=selection.id||selection.selector;
  writingImage=true;setControls();msg("Обрабатываем иконку…");
  try{
   const url=await prepareImage(file,"design-about");
   if(!core.safeUrl(url))throw Error("Слишком большой файл иконки");
   if((selection?.id||selection?.selector)===identity)changeIcon("icon",url);
  }catch(err){msg("Ошибка загрузки: "+(err.message||"ошибка"));}
  finally{writingImage=false;e.target.value="";setControls();}
 });
 inspector.append(iconBox);
 const linkSelect=inspector.querySelector('[data-builder-main="link"]');
 linkSelect.append(optionList([
 ["","Не менять переход"],["route:home","Главная"],["route:events","Календарь"],["route:menu","Меню"],
 ["route:info","Инфо / контакты"],["route:about","О клубе"],["route:profile","Профиль"],
 ["route:id","BALI ID"],["route:cart","Корзина"],["custom","Внешняя ссылка / телефон"]
 ]));
 content.querySelector('[data-builder-main="text"]').addEventListener("change",e=>changeMain("text",e.target.value));
 content.querySelector('[data-builder-main="image"]').addEventListener("change",e=>changeMain("image",e.target.value));
 content.querySelector('[data-builder-main="url"]').addEventListener("change",e=>changeMain("link",e.target.value.trim()));
 linkSelect.addEventListener("change",()=>{
  const value=linkSelect.value;
  content.querySelector('[data-builder-main="url"]').hidden=value!=="custom";
  if(value!=="custom"&&value)changeMain("link",value);
 });
 content.querySelector('[data-builder-main="upload"]').addEventListener("change",async e=>{
  const file=e.target.files?.[0];if(!file||!authorized||!selection)return;
  const identity=selection.id||selection.selector;
  writingImage=true;setControls();msg("Подготавливаем изображение…");
  try{
   const result=await prepareImage(file,"design-about");
   if(!core.safeUrl(result))throw new Error("Файл слишком большой после сжатия");
   if((selection?.id||selection?.selector)!==identity)return;
   changeMain("image",result);msg("Изображение подготовлено. Сохраните черновик или опубликуйте.");
  }catch(err){msg("Не удалось обработать изображение: "+(err.message||"ошибка"));}
  finally{writingImage=false;e.target.value="";setControls();}
 });
 for(const [title,ids] of titleGroups){
  const details=document.createElement("details");details.className="bali-builder-group";details.open=true;
  const summary=document.createElement("summary");summary.textContent=title;details.append(summary);
  const grid=document.createElement("div");grid.className="bali-builder-grid";
  for(const id of ids){
   const [key,label,kind,help,defaultValue]=metadata.find(f=>f[0]===id);
   grid.append(newField(key,label,kind,help,defaultValue));
  }
  details.append(grid);inspector.append(details);
 }
 const actions=document.createElement("div");actions.className="bali-builder-element-actions";
 actions.innerHTML='<button type="button" data-builder-action="copy">Копировать стиль элемента</button><button type="button" data-builder-action="paste">Применить скопированный стиль</button><button type="button" data-builder-action="reset">Сбросить оформление элемента</button><button type="button" data-builder-action="duplicate">Дублировать добавленный элемент</button><button type="button" data-builder-action="delete" class="danger">Удалить добавленный элемент</button>';
 actions.addEventListener("click",e=>{
  const button=e.target.closest("button");if(!button||!selection)return;
  const what=button.dataset.builderAction;
  if(what==="copy"){
   const props=core.sanitizeProps(getItem()?.props);
   if(!Object.keys(props).length){msg("Для копирования сначала настройте внешний вид элемента.");return;}
   styleClipboard=clone(props);
   msg("Оформление скопировано. Выберите другой элемент и нажмите «Применить скопированный стиль».");
  }else if(what==="paste"){
   if(!styleClipboard){msg("Сначала скопируйте оформление другого элемента.");return;}
   commit(()=>{const item=ensureItem();if(item)item.props={...(item.props||{}),...clone(styleClipboard)};});
   msg("Скопированное оформление применено. Изменения доступны в предпросмотре.");
  }
  else if(what==="delete"&&selection.id)commit(()=>{model[currentDevice].blocks=model[currentDevice].blocks.filter(b=>b.id!==selection.id);selection=null;});
  else if(what==="duplicate"&&selection.id){
   const item=getItem();if(!item)return;
   if(model[currentDevice].blocks.length>=30){msg("Достигнут лимит 30 дополнительных элементов для одного устройства.");return;}
   const copy=clone(item);
   copy.id="bali-"+copy.kind+"-"+Date.now().toString(36)+"-"+Math.floor(Math.random()*1e6).toString(36);
   copy.x=Math.min(95,copy.x+3);copy.y=Math.min(5000,copy.y+24);
   commit(()=>model[currentDevice].blocks.push(copy));
   selection={id:copy.id,selector:null,scope:item.page==="about"?"about":"main"};
  }
  else if(what==="reset")commit(()=>{
   if(selection.id){const b=getItem();if(b)b.props={};}
   else delete model[currentDevice].rules[selection.selector];
  });
  renderInspector();
 });
 inspector.append(actions);
 renderInspector();
}
function frameDoc(){try{return frame.contentDocument;}catch{return null;}}
function aboutDoc(){
 try{return frameDoc()?.getElementById("baliAboutFrame")?.contentDocument||null;}
 catch{return null;}
}
function activeDoc(){return selection?.scope==="about"?aboutDoc():frameDoc();}
function liveNode(){
 const d=activeDoc();if(!d||!selection)return null;
 if(selection.id)return d.querySelector('[data-bali-builder-id="'+selection.id+'"]');
 try{
  const selector=selection.scope==="about"&&selection.selector.startsWith("about::")?
   selection.selector.slice(7):selection.selector;
  return d.querySelector(selector);
 }catch{return null;}
}
function getItem(){
 if(!selection)return null;
 if(selection.id)return model[currentDevice].blocks.find(b=>b.id===selection.id);
 return model[currentDevice].rules[selection.selector]||null;
}
function ensureItem(){
 if(selection.id)return getItem();
 return model[currentDevice].rules[selection.selector] ||= {props:{}};
}
function changeIcon(k,value){
 if(!selection)return;
 if(k==="icon"&&value&&!core.safeUrl(value)){msg("Нужна HTTPS-ссылка или WebP.");return;}
 commit(()=>{
  const item=ensureItem();if(!item)return;
  item.props||={};
  if(k==="icon"&&value){item.props.icon=value;delete item.props.iconName;}
  else if(k==="iconName"&&value){item.props.iconName=value;delete item.props.icon;}
  else {delete item.props.icon;delete item.props.iconName;}
 });
}
function changeProp(k,v){
 if(!selection)return;
 commit(()=>{
  const item=ensureItem();if(!item)return;
  item.props||={};
  if(!v&&v!=="0"){delete item.props[k];return;}
  if(["width","height","minWidth","maxWidth","minHeight","maxHeight"].includes(k))item.props[k]=v;
  else if(["fontSize","padding","borderRadius","borderWidth","letterSpacing","translateX","translateY","marginTop","marginBottom","marginLeft","marginRight","gap","lineHeight","opacity","rotate","scale","animationDuration","animationDelay","zIndex"].includes(k))item.props[k]=Number(v);
  else item.props[k]=v;
 });
}
function changeMain(k,v){
 if(!selection)return;
 if(k==="image"&&v&&!core.safeUrl(v)){msg("Допускаются только изображения по HTTPS или обработанный WebP.");return;}
 if(k==="link"&&v&&!core.safeLink(v)){msg("Проверьте ссылку. Допустимы только HTTPS, телефон и разделы сайта.");return;}
 commit(()=>{
  const item=ensureItem();if(!item)return;
  if(k==="image"){
   if(selection.id)item.image=v;
   else {item.props||={};if(v)item.props.image=v;else delete item.props.image;}
  }else if(k==="text")item.text=v;
  else if(k==="link")item.link=v;
 });
}
function valueFromComputed(k,node){
 if(!node)return "";
 const st=node.ownerDocument.defaultView.getComputedStyle(node);
 if(k==="width")return Math.round(node.getBoundingClientRect().width)+"px";
 if(k==="height")return Math.round(node.getBoundingClientRect().height)+"px";
 const ref={fontFamily:"fontFamily",fontSize:"fontSize",fontWeight:"fontWeight",fontStyle:"fontStyle",
 textAlign:"textAlign",textTransform:"textTransform",lineHeight:"lineHeight",letterSpacing:"letterSpacing",color:"color",
 backgroundColor:"backgroundColor",borderColor:"borderColor",borderWidth:"borderWidth",
 opacity:"opacity",borderRadius:"borderTopLeftRadius",padding:"paddingTop",
 display:"display",flexDirection:"flexDirection",justifyContent:"justifyContent",
 alignItems:"alignItems",gap:"gap",objectFit:"objectFit",objectPosition:"objectPosition",backgroundPosition:"backgroundPosition",
 backgroundSize:"backgroundSize",aspectRatio:"aspectRatio",overflow:"overflow",zIndex:"zIndex",
 maxWidth:"maxWidth",minWidth:"minWidth",maxHeight:"maxHeight",
 marginTop:"marginTop",marginBottom:"marginBottom",marginLeft:"marginLeft",marginRight:"marginRight"};
 if(!ref[k])return "";
 const raw=st[ref[k]]||"";
 if(["fontSize","letterSpacing","borderWidth","borderRadius","padding","marginTop","marginBottom","marginLeft","marginRight","gap"].includes(k))return parseFloat(raw)||0;
 if(k==="lineHeight")return (parseFloat(raw)/(parseFloat(st.fontSize)||16)).toFixed(2);
 if(k==="backgroundColor"||k==="borderColor"||k==="color"){
  const rgb=raw.match(/^rgba?\((\d+),\s*(\d+),\s*(\d+)/);
  return rgb?"#"+rgb.slice(1,4).map(x=>Number(x).toString(16).padStart(2,"0")).join(""):"#ffffff";
 }
 return raw;
}
function renderLayerTrail(){
 const trail=inspector.querySelector("#baliBuilderLayerTrail");
 if(!trail)return;
 trail.replaceChildren();
 const node=liveNode();
 if(!selection||!node){trail.hidden=true;return;}
 trail.hidden=false;
 const parents=[];let current=node;
 while(current?.nodeType===1&&current!==current.ownerDocument.body&&parents.length<9){
  parents.push(current);current=current.parentElement;
 }
 parents.reverse();
 for(const [i,element] of parents.entries()){
  const button=document.createElement("button");
  button.type="button";button.className="bali-builder-layer-node";
  const shortId=element.id?"#"+element.id:element.classList?.length?"."+element.classList[0]:"";
  const name=element.tagName.toLowerCase()+shortId;
  button.textContent=name.length>38?name.slice(0,37)+"…":name;
  button.title="Выбрать "+name;
  button.setAttribute("aria-current",i===parents.length-1?"true":"false");
  button.addEventListener("click",()=>choose(element,{deep:true}));
  trail.append(button);
  if(i<parents.length-1){
   const sep=document.createElement("span");sep.textContent="›";sep.setAttribute("aria-hidden","true");
   trail.append(sep);
  }
 }
}
function renderInspector(){
 const node=liveNode(),item=getItem();
 renderLayerTrail();
 const iconBox=inspector.querySelector(".bali-builder-icon-editor");
 const isButton=Boolean(node?.matches("button,a")||(selection?.id&&item?.kind==="button"));
 iconBox.hidden=!isButton;
 iconBox.querySelector("[data-builder-icon-name]").value=item?.props?.iconName||"";
 iconBox.querySelector("[data-builder-icon-url]").value=item?.props?.icon||"";
 iconBox.querySelector("[data-builder-icon-size]").value=item?.props?.iconSize||24;
 const hero=node?.closest?.(".bali-pc-hero");
 const isManaged=Boolean(hero&&selection?.scope==="main");
 view.publish.textContent=isManaged?"Опубликовать рекламный слайд":"Опубликовать на сайте";
 const promo=inspector.querySelector("#baliBuilderManagedPromo");
 if(promo){
  inspector.classList.toggle("bali-builder-promo-mode",isManaged);
  inspector.querySelector(".bali-builder-content").hidden=isManaged;
  promoEditor?.select(isManaged?hero.dataset.baliOfferId||"bali-new-year-2026":null);
 }
 inspector.querySelector("#baliBuilderSelected").textContent=selection?(selection.id?"Новый "+(item?.kind||"элемент"):node?.tagName+" · "+(node?.classList?.[0]||node?.id||"элемент")):"Выберите элемент на сайте";
 inspector.querySelector("#baliBuilderSelector").textContent=selection?.id?selection.id:selection?.selector||"Нажмите на любой текст, кнопку, карточку или изображение";
 const text=inspector.querySelector('[data-builder-main="text"]');
 const link=inspector.querySelector('[data-builder-main="link"]');
 const url=inspector.querySelector('[data-builder-main="url"]');
 const image=inspector.querySelector('[data-builder-main="image"]');
 const preferredLabel=node?.matches("#menuNavBtn")?node.querySelector("strong"):
  node?.matches(".bali-social-btn")?node.querySelector(".bali-pc-contact-label"):
  node?.matches(".bali-home-map")?node.querySelector(".bali-yandex-address"):
  node?.matches(".bali-pc-id-card")?node.querySelector(".bali-id-showcase-copy > strong"):null;
 const textNode=(preferredLabel||node)&&[...(preferredLabel||node).childNodes].find(n=>n.nodeType===3&&n.textContent.trim());
 text.value=item?.text??(selection?.id?"":(
  node?.matches(".bali-bottom-nav [data-bali-nav]")?node.querySelector("small")?.textContent?.trim()||"":
  textNode?.textContent?.trim()||(!node?.children.length?node?.textContent?.trim():"")||""));
 const value=item?.link||"";
 link.dataset.customButton=selection?.id&&item?.kind==="button"?"true":"false";
 link.value=value.startsWith("route:")?value:value?"custom":"";
 url.hidden=link.value!=="custom";url.value=value&&link.value==="custom"?value:"";
 image.value=(selection?.id?item?.image:item?.props?.image)||"";
 for(const [k,input] of inputs){
  let v=item?.props?.[k];
  if(v===undefined&&selection&&node)v=valueFromComputed(k,node);
  if(input.type==="color"){
   input.value=typeof v==="string"&&/^#[0-9a-f]{6}$/i.test(v)?v:"#ffffff";
  }else if(input.tagName==="SELECT"){
   input.value=v===undefined?"":String(v);
   if(input.value!==String(v))input.value="";
  }else input.value=v??"";
 }
 inspector.querySelector('[data-builder-action="delete"]').hidden=!selection?.id;
 inspector.querySelector('[data-builder-action="duplicate"]').hidden=!selection?.id;
 setControls();
 inspector.querySelector('[data-builder-action="paste"]').disabled=!selection||!authorized||!styleClipboard;
 positionOverlay();
}
function clearOverlay(){
 overlay?.remove();overlay=null;
}
function positionOverlay(){
 if(!overlay)return;
 if(!selection){overlay.style.display="none";return;}
 const node=liveNode(),d=activeDoc();
 if(!node||!d||!node.getClientRects().length){overlay.style.display="none";return;}
 const rect=node.getBoundingClientRect();
 const added=Boolean(selection?.id);
 overlay.querySelector(".bali-builder-bounding-label").hidden=!added;
 overlay.querySelector(".bali-builder-handle").hidden=!added;
 overlay.style.display="block";
 Object.assign(overlay.style,{left:Math.max(0,rect.left)+"px",top:Math.max(0,rect.top)+"px",width:Math.max(8,rect.width)+"px",height:Math.max(8,rect.height)+"px"});
}
function attachOverlay(){
 clearOverlay();
 const d=activeDoc();if(!d)return;
 if(!d.getElementById("baliBuilderEditingOverlayStyle")){
  const st=d.createElement("style");st.id="baliBuilderEditingOverlayStyle";
  st.textContent=".bali-builder-selection-overlay{position:fixed;z-index:2147483000;pointer-events:none;outline:2px solid #b9ff51;outline-offset:1px}"+
  ".bali-builder-bounding-label{position:absolute;bottom:100%;left:0;transform:translateY(-4px);height:22px;min-width:100px;padding:3px 8px;display:flex;align-items:center;justify-content:center;background:#b9ff51;color:#152010;border-radius:5px;font:700 12px Arial,sans-serif;pointer-events:auto;cursor:grab;touch-action:none;user-select:none;box-sizing:border-box}"+
  ".bali-builder-bounding-label:active{cursor:grabbing}"+
  ".bali-builder-handle{position:absolute;right:-7px;bottom:-7px;width:17px;height:17px;background:#b9ff51;border:2px solid #101510;border-radius:4px;box-sizing:border-box;pointer-events:auto;cursor:nwse-resize;touch-action:none}";
  d.head.append(st);
 }
 overlay=d.createElement("div");overlay.className="bali-builder-selection-overlay";overlay.style.display="none";
 overlay.innerHTML='<div class="bali-builder-bounding-label">Переместить</div><div class="bali-builder-handle" title="Изменить размер" aria-label="Изменить размер"></div>';
 d.body.append(overlay);
 for(const [handle,mode] of [[overlay.querySelector(".bali-builder-bounding-label"),"move"],[overlay.querySelector(".bali-builder-handle"),"size"]]){
  handle.addEventListener("pointerdown",event=>{
   if(!authorized||!selection?.id)return;
   event.preventDefault();event.stopPropagation();
   const node=liveNode();if(!node)return;
   const rect=node.getBoundingClientRect();
   const item=getItem();
   const props=item?.props||{};
   drag={mode,sx:event.clientX,sy:event.clientY,width:rect.width,height:rect.height,x:props.translateX||0,y:props.translateY||0,blockX:item?.x||0,blockY:item?.y||0,rootWidth:node.parentElement?.getBoundingClientRect().width||1,started:false,origin:clone(model)};
   handle.setPointerCapture(event.pointerId);
  });
  handle.addEventListener("pointermove",event=>{
   if(!drag)return;
   const dx=event.clientX-drag.sx,dy=event.clientY-drag.sy;
   if(Math.abs(dx)+Math.abs(dy)<2&&!drag.started)return;
   if(!drag.started){history.push(drag.origin);if(history.length>40)history.shift();future=[];drag.started=true;}
   const item=ensureItem();if(!item)return;
   item.props||={};
   if(drag.mode==="size"){
    item.props.width=Math.max(20,Math.round(drag.width+dx))+"px";
    item.props.height=Math.max(20,Math.round(drag.height+dy))+"px";
   }else if(selection.id){
    item.x=Math.max(0,Math.min(95,drag.blockX+dx/drag.rootWidth*100));
    item.y=Math.max(0,drag.blockY+dy);
   }else{
    item.props.translateX=Math.round(drag.x+dx);
    item.props.translateY=Math.round(drag.y+dy);
   }
   // Direct style while dragging to avoid destroying the pointer capture overlay.
   const node=liveNode();
   if(node){
    if(drag.mode==="size"){node.style.setProperty("width",item.props.width,"important");node.style.setProperty("height",item.props.height,"important");}
    else if(selection.id){node.style.left=item.x+"%";node.style.top=item.y+"px";}
    else node.style.setProperty("translate",item.props.translateX+"px "+item.props.translateY+"px","important");
   }
   positionOverlay();
  });
  for(const type of ["pointerup","pointercancel"])handle.addEventListener(type,()=>{
   if(drag?.started){model=core.cleanModel(model);mark();refreshCanvas();}
   drag=null;
  });
 }
 d.addEventListener("scroll",positionOverlay,{passive:true,capture:true});
 d.defaultView.addEventListener("resize",positionOverlay,{passive:true});
}
function choose(target,{deep=false}={}){
 const d=target?.ownerDocument;if(!d||!target)return;
 // Promo artwork is often covered by transparent booking hotspots.
 // Select the entire campaign on normal click; Alt-click selects a nested layer.
 if(!deep&&d===frameDoc())target=target.closest(".bali-pc-hero")||target;
 if(!deep&&d===frameDoc()&&target.closest("button,a"))target=target.closest("button,a");
 const scope=d===aboutDoc()?"about":"main";
 const custom=target.closest("[data-bali-builder-id]");
 if(custom)selection={id:custom.dataset.baliBuilderId,selector:null,scope};
 else {
  const node=target.closest("a,button,h1,h2,h3,h4,p,span,strong,em,img,article,section,aside,div,li");
  if(!node||node===d.body)return;
  const selector=core.selectorFor(node);if(!selector)return;
  selection={id:null,selector:scope==="about"?"about::"+selector:selector,scope};
 }
 if(overlay?.ownerDocument!==activeDoc())attachOverlay();
 renderInspector();
}
function refreshCanvas(){
 const d=frameDoc();if(!d?.body)return;
 core.mount(d,model,currentDevice,{editor:true});
 const inner=aboutDoc();
 if(inner?.body)core.mount(inner,model,currentDevice,{editor:true,scope:"about"});
 if(overlay&&!overlay.isConnected)attachOverlay();
 if(selection)renderInspector();
}
const capturedDocs=new WeakSet();
function attachInteractions(d){
 if(!d?.body||capturedDocs.has(d))return;
 capturedDocs.add(d);
 d.addEventListener("click",event=>{
  if(!enabled||event.target===inlineEditor)return;
  event.preventDefault();event.stopImmediatePropagation();
  if(event.target.closest(".bali-builder-selection-overlay"))return;
  choose(event.target,{deep:event.altKey});
 },true);
 d.addEventListener("dblclick",event=>{
  if(!enabled||event.target===inlineEditor)return;
  event.preventDefault();event.stopImmediatePropagation();
  beginInlineText(event.target);
 },true);
 d.addEventListener("submit",event=>{
  if(enabled){event.preventDefault();event.stopImmediatePropagation();}
 },true);
 d.addEventListener("keydown",onBuilderShortcut,true);
}
function attachFrame(){
 const d=frameDoc();if(!d?.body)return;
 attachInteractions(d);
 const nested=d.getElementById("baliAboutFrame");
 if(nested&&!nested.dataset.baliBuilderFrameBound){
  nested.dataset.baliBuilderFrameBound="true";
  nested.addEventListener("load",()=>{
   const inside=aboutDoc();
   if(inside)attachInteractions(inside);
   refreshCanvas();
  });
 }
 if(aboutDoc()?.body)attachInteractions(aboutDoc());
 if(!overlay)attachOverlay();
 refreshCanvas();
}
function updatePage(page){
 currentPage=page;
 const w=frame.contentWindow;
 if(w?.navigateGuestPage)w.navigateGuestPage(page==="info"?"contacts":page);
 else{
  const sel=page==="info"?"contacts":page;
  w?.document?.querySelector('[data-bali-nav="'+sel+'"]')?.click();
 }
 selection=null;renderInspector();
 requestAnimationFrame(()=>{refreshCanvas();positionOverlay();});
}
function updateViewportFields(){
 const size=window.BaliDesignStudio?.getViewport?.();
 if(size&&view.viewportWidth&&view.viewportHeight){
  view.viewportWidth.value=size.width;view.viewportHeight.value=size.height;
 }
}
function updateDevice(dev){
 if(!listDevices.includes(dev))return;
 currentDevice=dev;
 updateViewportFields();
 selection=null;renderInspector();
 refreshCanvas();
 msg("Редактируется "+({desktop:"ПК",tablet:"планшет",phone:"телефон"}[dev])+". Изменения изолированы от других устройств.");
}
function doUndo(){
 if(!history.length)return;
 future.push(clone(model));model=history.pop();dirty=true;selection=null;refreshCanvas();renderInspector();mark();
}
function doRedo(){
 if(!future.length)return;
 history.push(clone(model));model=future.pop();dirty=true;selection=null;refreshCanvas();renderInspector();mark();
}
function add(kind){
 if(!authorized)return;
 if(!["text","button"].includes(kind)){
  msg("На главной добавляются текст и кнопки в существующие карточки. Фон задаётся для выбранного блока.");return;
 }
 const node=liveNode(),anchor=node?.closest(homeCardSelector);
 if(!anchor){msg("Сначала выберите блок главной, в который добавить текст или кнопку.");return;}
 if(anchor.matches("button,a")){
  msg("Эта карточка уже является кнопкой: меняйте надпись и иконку, не вкладывая одну кнопку в другую.");return;
 }
 const anchorSelector=core.selectorFor(anchor);
 if(!anchorSelector){msg("Не удалось определить область блока.");return;}
 const page=currentPage;
 const id="bali-"+kind+"-"+Date.now().toString(36)+"-"+Math.floor(Math.random()*1e5).toString(36);
 commit(()=>model[currentDevice].blocks.push({
  id,page:"home",kind,anchor:anchorSelector,x:8,y:20,text:kind==="button"?"Новая кнопка":"Новый текст",
  image:"",link:"route:home",props:{width:kind==="panel"?"300px":"220px",height:kind==="image"?"180px":kind==="panel"?"120px":"50px",fontSize:16}
 }));
 selection={id,selector:null,scope:"main"};renderInspector();
}
async function save(publish=false){
 if(!authorized||saving)return;
 const clean=core.cleanModel(model),payload={schemaVersion:1,...clean,updatedAt:serverTimestamp()};
 const size=new Blob([JSON.stringify(clean)]).size;
 if(size>600000){msg("Черновик слишком большой ("+Math.round(size/1024)+" КБ). Используйте HTTPS-картинки вместо встроенных файлов.");return;}
 saving=true;setControls();msg(publish?"Публикуем сайт для посетителей…":"Сохраняем черновик…");
 try{
  if(publish){
   const batch=writeBatch(db);
   batch.set(publishedRef,payload);
   batch.set(draftRef,payload);
   await batch.commit();
  }else await setDoc(draftRef,payload);
  if(publish)published=clone(clean);
  dirty=false;history=[];future=[];
  msg(publish?"Опубликовано в Firestore: изменения доступны посетителям на устройствах соответствующего типа.":"Черновик сохранён. Публичный сайт не изменился.");
 }catch(e){msg(e.code==="permission-denied"?"Недостаточно прав или правила Firestore не опубликованы.":"Ошибка сохранения: "+(e.code||e.message||"неизвестно"));}
 finally{saving=false;setControls();}
}
async function restore(){
 if(!authorized)return;
 if(!confirm("Заменить текущие правки последней опубликованной версией?"))return;
 remember();model=core.cleanModel(published);selection=null;mark();refreshCanvas();renderInspector();
 msg("В редактор загружена последняя опубликованная версия. Для сохранения нажмите «Сохранить черновик».");
}
function copyDevice(){
 if(!authorized)return;
 const to=listDevices.filter(d=>d!==currentDevice);
 const target=prompt("Куда скопировать оформление текущего устройства? Введите: "+to.join(" / "));
 if(!to.includes(target))return;
 if(!confirm("Заменить все настройки "+target+"?"))return;
 commit(()=>{model[target]=clone(model[currentDevice]);});msg("Настройки скопированы в "+target+". Для публикации сохраните изменения.");
}
function toggle(on){
 if(!on&&inlineEditor){inlineEditor.remove();inlineEditor=null;}
 enabled=on;
 panel.classList.toggle("bali-builder-active",on);
 view.mode.textContent=on?"Открыть прежние настройки блоков":"Вернуться в конструктор";
 if(on){selection=null;if(!overlay&&frameDoc()?.body)attachOverlay();refreshCanvas();renderInspector();}
 else {clearOverlay();frameDoc()?.__baliBuilderRestore?.();}
}
function onBuilderShortcut(event){
 if(!enabled||!authorized||document.body.dataset.baliAdminSection!=="design")return;
 const target=event.target;
 if(target?.closest?.("input,textarea,select,[contenteditable=true]"))return;
 const command=event.ctrlKey||event.metaKey;
 if(command&&!event.altKey&&(event.key.toLowerCase()==="z"||event.key.toLowerCase()==="y")){
  event.preventDefault();
  if(event.key.toLowerCase()==="y"||(event.shiftKey&&event.key.toLowerCase()==="z"))doRedo();
  else doUndo();
 }else if(event.key==="Escape"&&selection){
  event.preventDefault();selection=null;renderInspector();
 }
}
function init(){
 initialize();
 window.addEventListener("keydown",onBuilderShortcut);
 view.page.value="home";
 view.page.disabled=true;
 view.page.title="Конструктор первого этапа: главная страница";
 view.page.addEventListener("change",()=>updatePage("home"));
 for(const field of [view.viewportWidth,view.viewportHeight]){
  field?.addEventListener("change",()=>{
   window.BaliDesignStudio?.viewport?.(view.viewportWidth.value,view.viewportHeight.value);
   updateViewportFields();requestAnimationFrame(positionOverlay);
  });
 }
 updateViewportFields();
 const directPromo=$("baliBuilderOpenPromo");
 directPromo?.addEventListener("click",()=>{
  if(!authorized){msg("Для редактирования баннера нужен вход администратора.");return;}
  if(!enabled)toggle(true);
  const hero=frameDoc()?.querySelector(".bali-pc-hero");
  if(!hero){msg("Блок ещё загружается. Обновите предпросмотр и повторите.");return;}
  choose(hero,{deep:true});
  promoEditor?.root.scrollIntoView({block:"nearest",behavior:"smooth"});
 });
 view.mode.addEventListener("click",()=>toggle(!enabled));
 view.draft.addEventListener("click",()=>save(false));
 view.publish.addEventListener("click",()=>{
  if(selection?.scope==="main"&&liveNode()?.closest?.(".bali-pc-hero")){
   promoEditor?.root.querySelector("[data-promo-save]")?.click();
   return;
  }
  save(true);
 });
 view.restore.addEventListener("click",restore);
 view.undo.addEventListener("click",doUndo);view.redo.addEventListener("click",doRedo);
 view.copy.addEventListener("click",copyDevice);
 for(const b of view.addButtons)b.addEventListener("click",()=>add(b.dataset.baliBuilderAdd));
 panel.querySelectorAll("[data-studio-device]").forEach(b=>b.addEventListener("click",()=>updateDevice(b.dataset.studioDevice)));
 frame.addEventListener("load",()=>{overlay=null;inlineEditor=null;attachFrame();});
 if(frame.contentDocument?.readyState==="complete")attachFrame();
 window.addEventListener("bali:admin:section",e=>{if(e.detail?.section==="design")requestAnimationFrame(()=>{refreshCanvas();positionOverlay();});});
 window.BaliBuilderEditor={isActive:()=>enabled,refresh:refreshCanvas};
 toggle(true);
 onAuthStateChanged(auth,async user=>{
  const epoch=++authEpoch;authorized=false;loading=false;unsub?.();unsub=null;setControls();
  if(!user?.emailVerified){msg("Войдите в подтверждённый аккаунт администратора.");return;}
  try{
   const role=await getDoc(doc(db,"admins",user.uid));
   if(epoch!==authEpoch||auth.currentUser?.uid!==user.uid)return;
   if(role.data()?.active!==true){msg("Для работы с конструктором нужна активная роль администратора.");return;}
   authorized=true;loading=true;setControls();
   const pub=await getDoc(publishedRef);
   if(epoch!==authEpoch)return;
   published=core.cleanModel(pub.exists()?pub.data():core.emptyModel());
   unsub=onSnapshot(draftRef,snap=>{
    if(epoch!==authEpoch)return;
    loading=false;
    if(!dirty){model=core.cleanModel(snap.exists()?snap.data():published);refreshCanvas();renderInspector();}
    msg("Конструктор доступен: настройте элементы, затем сохраните черновик или опубликуйте.");
    setControls();
   },err=>{loading=false;msg("Не удалось загрузить черновик: "+(err.code||err.message));});
  }catch(err){if(epoch===authEpoch)msg("Не удалось проверить администратора: "+(err.code||err.message));}
 });
}
init();