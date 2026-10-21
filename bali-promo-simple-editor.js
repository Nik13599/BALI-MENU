/* BALI simple banner composer — directly in the visual site builder. */
import {doc,getDoc,setDoc,serverTimestamp} from "https://www.gstatic.com/firebasejs/10.14.1/firebase-firestore.js";
import {prepareImage} from "./image-compressor.js?v=20261020-2";
import {PROMO_POSITION_OPTIONS,promoEditorMode,promoEditorXY,promoStorePlacement,promoPositionStyle} from "./bali-promo-placement.js?v=20261021-3";

const holidayId="bali-new-year-2026";
const holidayPoster="assets/BALI_banner_badge_rectangular_only.png";
const defaults=()=>({
 title:"БРОНИРОВАНИЕ НОВОГОДНИХ КОРПОРАТИВОВ",
 description:"Проведите незабываемый праздник в центре Минска. Выберите дату заранее.",
 imageUrl:"",imageMobileUrl:"",imageTabletUrl:"",imageRemoved:false,
 destination:"contact-modal",buttonText:"Забронировать заранее",
 contactTitle:"Забронировать новогодний корпоратив",
 contactLinks:{phone:"",telegram:"",instagram:"",whatsapp:"",viber:""},
 contactEnabled:{phone:true,telegram:true,instagram:true,whatsapp:true,viber:true},
 contactHotspot:{enabled:true,left:4,top:69,width:30,height:17},
 sort:0,published:true
});
const initialOverlay=()=>({enabled:false,fontSize:38,textColor:"#ffffff",
 buttonBackground:"#c3f36d",buttonColor:"#111810",buttonRadius:10,align:"left"});
const safeImage=x=>typeof x==="string"&&(
 /^https:\/\/[^\s"'<>]{1,2048}$/i.test(x)||
 /^data:image\/webp;base64,[A-Za-z0-9+/=]{1,155000}$/.test(x));
const escapeText=x=>String(x||"").slice(0,120);
const bounded=(x,min,max,fallback)=>Number.isFinite(Number(x))?Math.round(Math.max(min,Math.min(max,Number(x)))):fallback;

export function createSimplePromoEditor({db,frame,canEdit,notify}){
 const root=document.createElement("section");
 root.id="baliBuilderManagedPromo";
 root.className="bali-builder-managed-promo bali-simple-banner-editor";
 root.hidden=true;
 root.innerHTML=`
  <strong>РЕДАКТОР РЕКЛАМНОГО СЛАЙДА</strong>
  <p>Исходные размеры блока не меняются. Загрузите картинку, напишите заголовок поверх неё и настройте кнопку.</p>
  <div class="bali-promo-simple-preview" aria-label="Предпросмотр исходного изображения"><img alt="Изображение баннера"></div>
  <small data-promo-size>Размеры блока определяются по текущему предпросмотру.</small>
  <label class="bali-builder-field">1. Фоновая картинка
   <input type="file" data-promo-file accept="image/png,image/jpeg,image/webp,image/heic,image/heif">
   <small>Загрузка не меняет размер блока. Изображение показывается на всех устройствах; при необходимости используйте исходник нужных пропорций.</small>
  </label>
  <div class="bali-promo-simple-image-actions">
   <button type="button" class="bali-promo-simple-remove" data-promo-remove-image>Удалить изображение</button>
   <button type="button" class="bali-promo-simple-reset" data-promo-reset-image>Вернуть исходную картинку</button>
  </div>
  <label class="bali-builder-field">Или HTTPS-ссылка на изображение
   <input type="url" data-promo-image-url placeholder="https://...">
  </label>
  <label class="bali-builder-field">2. Текст поверх картинки
   <textarea data-promo-title rows="3" maxlength="100" placeholder="Введите надпись на баннере"></textarea>
  </label>
  <div class="bali-promo-simple-grid">
    <label class="bali-builder-field">Размер текста, px<input data-promo-font-size type="number" min="12" max="80" value="38"></label>
    <label class="bali-builder-field">Цвет текста<input data-promo-text-color type="color" value="#ffffff"></label>
  </div>
  <label class="bali-builder-field bali-promo-simple-overlay-toggle"><input data-promo-overlay-enabled type="checkbox"> Показать дополнительный текст поверх изображения
   <small>Не включайте, если надпись уже есть на загруженной картинке.</small>
  </label>
  <label class="bali-builder-field">Выравнивание текста
   <select data-promo-align><option value="left">Слева</option><option value="center">По центру</option><option value="right">Справа</option></select>
  </label>
  <label class="bali-builder-field">3. Надпись на кнопке
   <input data-promo-button-text type="text" maxlength="65" placeholder="Забронировать заранее">
  </label>
  <label class="bali-builder-field">Положение кнопки для выбранного баннера
   <select data-promo-position aria-label="Выбор положения кнопки на баннере"></select>
  </label>
  <div data-promo-position-stage class="bali-promo-simple-position-stage" aria-label="Просмотр положения кнопки">
   <img data-promo-position-image alt="">
   <span data-promo-position-handle>Подробнее</span>
  </div>
  <div data-promo-position-coordinates class="bali-promo-simple-position-coordinates" hidden>
   <label class="bali-builder-field">Слева, %<input data-promo-x type="number" min="5" max="95" step="1" value="50"></label>
   <label class="bali-builder-field">Сверху, %<input data-promo-y type="number" min="5" max="95" step="1" value="82"></label>
  </div>
  <small class="bali-promo-simple-note">Девять готовых позиций, скрытие и ручное перетаскивание. Если кнопка напечатана прямо на изображении, для её полного визуального удаления замените изображение.</small>
  <div class="bali-promo-simple-grid">
    <label class="bali-builder-field">Цвет кнопки<input data-promo-button-background type="color" value="#c3f36d"></label>
    <label class="bali-builder-field">Цвет текста кнопки<input data-promo-button-color type="color" value="#111810"></label>
    <label class="bali-builder-field">Скругление, px<input data-promo-button-radius type="number" min="0" max="48" value="10"></label>
  </div>
  <button type="button" class="bali-promo-simple-publish" data-promo-save>Сохранить и опубликовать слайд</button>
  <button type="button" class="bali-promo-simple-reload" data-promo-reload>Перезагрузить данные из Firebase</button>
  <p data-promo-status role="status" aria-live="polite">Выберите рекламный блок в предпросмотре.</p>
 `;
 const $=key=>root.querySelector("[data-promo-"+key+"]");
 const status=$("status"),preview=root.querySelector(".bali-promo-simple-preview img");
 const pos=$("position"),posStage=$("position-stage"),posHandle=$("position-handle");
 const posImage=$("position-image"),posCoords=$("position-coordinates");
 for(const [value,label] of PROMO_POSITION_OPTIONS)pos.add(new Option(label,value));
 let activeId=null,record=null,busy=false,serial=0,updating=false,dragging=false,previewScheduled=false;
 const setPlacementUI=()=>{
   const mode=pos.value,point=promoEditorXY(mode,$("x").value,$("y").value);
   posCoords.hidden=mode!=="manual";
   posHandle.hidden=mode==="none"||mode==="original"||record?.destination==="none";
   posHandle.textContent=$("button-text").value.trim()||"Подробнее";
   const aligned=promoPositionStyle({mode:"manual",x:point.x,y:point.y});
   if(aligned)for(const [key,value] of Object.entries(aligned)){
     if(key!=="lowerRight")posHandle.style.setProperty(key==="maxWidth"?"max-width":key,value);
   }
   if(mode!=="manual"){$("x").value=point.x;$("y").value=point.y;}
   const src=record?.imageRemoved?"":record?.imageUrl||(activeId===holidayId?holidayPoster:"");
   posImage.hidden=!src;
   if(src&&posImage.getAttribute("src")!==src)posImage.src=src;
   if(!src)posImage.removeAttribute("src");
 };
 const say=text=>{status.textContent=text;};
 const showPreview=()=>{
   const url=record?.imageRemoved?"":record?.imageUrl||(activeId===holidayId?holidayPoster:"");
   preview.hidden=!url;
   if(url&&preview.getAttribute("src")!==url)preview.src=url;
   if(!url&&preview.hasAttribute("src"))preview.removeAttribute("src");
   setPlacementUI();
 };
 const collect=()=>{
   if(!record)return;
   record.title=escapeText($("title").value).slice(0,100);
   record.buttonText=escapeText($("button-text").value).slice(0,65);
   const placement=promoStorePlacement(pos.value,$("x").value,$("y").value);
   if(placement)record.buttonPlacement=placement;
   else delete record.buttonPlacement;
   record.overlay={
     enabled:$("overlay-enabled").checked,
     fontSize:bounded($("font-size").value,12,80,38),
     textColor:$("text-color").value,
     buttonBackground:$("button-background").value,
     buttonColor:$("button-color").value,
     buttonRadius:bounded($("button-radius").value,0,48,10),
     align:["left","center","right"].includes($("align").value)?$("align").value:"left"
   };
 };
 const publishPreview=()=>{
  try{
   const win=frame.contentWindow;
   if(win){
    win.dispatchEvent(new win.CustomEvent("bali:promo-preview",
      {detail:{offer:record?{id:activeId,...record}:null}}));
   }
  }catch{}
  showPreview();
 };
 const draw=()=>{
  if(!record)return;
  updating=true;
  const layer={...initialOverlay(),...record.overlay};
  $("title").value=record.title||"";
  $("button-text").value=record.buttonText||"";
  $("image-url").value=record.imageUrl?.startsWith("https://")?record.imageUrl:"";
  $("font-size").value=layer.fontSize;
  $("text-color").value=layer.textColor;
  $("button-background").value=layer.buttonBackground;
  $("button-color").value=layer.buttonColor;
  $("button-radius").value=layer.buttonRadius;
  $("align").value=layer.align;
  $("overlay-enabled").checked=layer.enabled===true;
  pos.value=promoEditorMode(record.buttonPlacement);
  $("x").value=record.buttonPlacement?.x??50;
  $("y").value=record.buttonPlacement?.y??82;
  showPreview();
  updating=false;
 };
 function displaySize(){
  try{
   const hero=frame.contentDocument?.querySelector(".bali-pc-hero");
   const bounds=hero?.getBoundingClientRect();
   if(!bounds||bounds.width<2||bounds.height<2)return;
   const w=Math.round(bounds.width),h=Math.round(bounds.height);
   $("size").textContent="Размер блока на этом устройстве: "+w+" × "+h+
      " px. Для чёткой картинки рекомендуем "+w*2+" × "+h*2+" px.";
  }catch{}
 }
 async function select(id){
  root.hidden=!id;
  if(!id){
   serial++;activeId=null;record=null;busy=false;
   return;
  }
  displaySize();
  if(id===activeId&&(record||busy))return;
  const request=++serial;
  activeId=id;record=null;busy=true;say("Загружаем настройки слайда…");
  try{
   if(!canEdit())throw Error("Войдите под учётной записью администратора.");
   const snap=await getDoc(doc(db,"promotions",id));
   if(request!==serial)return;
   if(!snap.exists()&&id!==holidayId)throw Error("Предложение не найдено в базе данных.");
   record=snap.exists()?snap.data():defaults();
   if(!record.overlay)record.overlay=initialOverlay();
   draw();say("Изменения отображаются в предпросмотре. Нажмите «Сохранить и опубликовать слайд» для гостей.");
  }catch(e){
   if(request===serial)say("Не удалось открыть баннер: "+(e.code||e.message||"ошибка")+". Нажмите «Перезагрузить данные из Firebase» для повтора.");
  }finally{if(request===serial)busy=false;}
 }
 const refresh=()=>{
  if(updating||busy||!record)return;
  collect();
  // Avoid repainting iframe and decoding the same banner for each pixel of drag.
  if(!previewScheduled){
   previewScheduled=true;
   requestAnimationFrame(()=>{
    previewScheduled=false;
    if(record&&!busy)publishPreview();
   });
  }
  say("Предпросмотр обновлён. Для публикации нажмите кнопку ниже.");
 };
 for(const key of ["title","button-text","font-size","text-color","button-background","button-color",
   "button-radius","align","overlay-enabled","position","x","y"]){
  $(key).addEventListener("input",refresh);
  if(key==="position")$(key).addEventListener("change",refresh);
 }
 posStage.addEventListener("pointerdown",event=>{
   if(pos.value!=="manual"||!record||!canEdit())return;
   dragging=true;posStage.setPointerCapture(event.pointerId);event.preventDefault();
   const rect=posStage.getBoundingClientRect();
   $("x").value=Math.round(Math.max(5,Math.min(95,(event.clientX-rect.left)/rect.width*100)));
   $("y").value=Math.round(Math.max(5,Math.min(95,(event.clientY-rect.top)/rect.height*100)));
   refresh();
 });
 posStage.addEventListener("pointermove",event=>{
   if(!dragging||pos.value!=="manual")return;
   const rect=posStage.getBoundingClientRect();
   $("x").value=Math.round(Math.max(5,Math.min(95,(event.clientX-rect.left)/rect.width*100)));
   $("y").value=Math.round(Math.max(5,Math.min(95,(event.clientY-rect.top)/rect.height*100)));
   refresh();
 });
 for(const type of ["pointerup","pointercancel","lostpointercapture"])
  posStage.addEventListener(type,()=>{dragging=false;});
 $("remove-image").addEventListener("click",()=>{
  if(!record||!canEdit())return;
  record.imageUrl="";record.imageTabletUrl="";record.imageMobileUrl="";
  record.imageRemoved=true;
  $("overlay-enabled").checked=true;
  record.overlay={...initialOverlay(),...record.overlay,enabled:true};
  $("image-url").value="";
  publishPreview();
  say("Картинка удалена в предпросмотре. Чтобы удалить её на сайте, нажмите «Сохранить и опубликовать слайд».");
 });
 $("reload").addEventListener("click",()=>{
  if(!activeId)return;
  const id=activeId;activeId=null;record=null;busy=false;select(id);
 });
 $("reset-image").addEventListener("click",()=>{
  if(!record)return;
  record.imageUrl="";
  record.imageTabletUrl="";record.imageMobileUrl="";
  record.imageRemoved=false;
  record.overlay={...initialOverlay(),enabled:false};
  $("image-url").value="";
  draw();publishPreview();
  say("Исходная картинка восстановлена в предпросмотре. Для применения на сайте нажмите публикацию.");
 });
 $("image-url").addEventListener("change",()=>{
  if(!record)return;
  const value=$("image-url").value.trim();
  if(value&&!safeImage(value)){say("Используйте изображение по HTTPS.");return;}
  record.imageUrl=value;
  if(value){record.imageRemoved=false;record.imageTabletUrl="";record.imageMobileUrl="";}
  refresh();
 });
 $("file").addEventListener("change",async event=>{
  const file=event.target.files?.[0];if(!file||!record||!canEdit())return;
  const id=activeId,revision=serial;busy=true;say("Обрабатываем и загружаем фотографию…");
  try{
   const image=await prepareImage(file,"design-hero");
   if(id!==activeId||revision!==serial)return;
   if(!safeImage(image))throw Error("Слишком большой файл после сжатия");
   record.imageUrl=image;record.imageMobileUrl="";record.imageTabletUrl="";record.imageRemoved=false;
   record.overlay={...initialOverlay(),...record.overlay,enabled:$("overlay-enabled").checked};
   $("image-url").value=image.startsWith("https://")?image:"";
   collect();publishPreview();
   say("Картинка загружена в предпросмотр. Теперь настройте текст и кнопку.");
  }catch(e){say("Не удалось загрузить картинку: "+(e.code||e.message||"ошибка"));}
  finally{if(id===activeId)busy=false;event.target.value="";}
 });
 $("save").addEventListener("click",async()=>{
  if(!canEdit()){say("Публикация недоступна: войдите под активным администратором.");return;}
  if(busy){say("Загрузка или сохранение ещё выполняется. Проверьте статус операции.");return;}
  if(!record){say("Не удалось загрузить слайд. Нажмите «Перезагрузить данные из Firebase» и повторите.");return;}
  collect();
  const id=activeId;
  if(record.title.length!==0&&record.title.length<2){say("Текст должен состоять минимум из 2 символов или быть пустым.");return;}
  if(!safeImage(record.imageUrl)&&record.imageUrl!==""){say("Загрузите картинку или укажите HTTPS-ссылку.");return;}
  if(!record.title&&!record.description&&!record.imageUrl&&!record.imageRemoved){say("Добавьте картинку или надпись.");return;}
  // Keep the original booking route/contact channels unchanged.
  const payload={...record,
    imageUrl:record.imageUrl||"",imageTabletUrl:record.imageTabletUrl||"",imageMobileUrl:record.imageMobileUrl||"",
    published:true,updatedAt:serverTimestamp()};
  busy=true;$("save").disabled=true;say("Сохраняем слайд в Firebase…");
  try{
   await setDoc(doc(db,"promotions",id),payload);
   if(id!==activeId)return;
   const check=await getDoc(doc(db,"promotions",id));
   if(!check.exists())throw Error("После сохранения Firebase не вернул слайд.");
   const saved=check.data();
   if(saved.title!==payload.title||saved.imageUrl!==payload.imageUrl||
      saved.imageRemoved!==payload.imageRemoved||
      saved.buttonPlacement?.mode!==payload.buttonPlacement?.mode||
      saved.buttonPlacement?.x!==payload.buttonPlacement?.x||
      saved.buttonPlacement?.y!==payload.buttonPlacement?.y||
      saved.overlay?.buttonRadius!==payload.overlay?.buttonRadius){
      throw Error("Сохранённые данные отличаются от опубликованных. Обновите редактор и повторите.");
   }
   record={...saved,published:true};
   say(record.imageRemoved?"Изображение удалено и публикация подтверждена Firebase.":"Слайд опубликован — сохранение подтверждено повторным чтением Firebase.");
   notify?.("Рекламный слайд опубликован отдельно от черновика оформления.");
  }catch(e){
   say(e.code==="permission-denied"?"Нет разрешения Firebase. Проверьте публикацию правил для баннеров.":"Ошибка сохранения: "+(e.code||e.message||"неизвестная ошибка"));
  }finally{busy=false;$("save").disabled=false;}
 });
 return {root,select};
}
