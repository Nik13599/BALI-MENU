/* BALI PRIVILEGE · published, manually curated slides with local-image upload. */
import {initializeApp,getApps,getApp} from "https://www.gstatic.com/firebasejs/10.14.1/firebase-app.js";
import {getAuth,onAuthStateChanged} from "https://www.gstatic.com/firebasejs/10.14.1/firebase-auth.js";
import {getFirestore,collection,doc,getDoc,onSnapshot,setDoc,deleteDoc,serverTimestamp}
  from "https://www.gstatic.com/firebasejs/10.14.1/firebase-firestore.js";
import {prepareImage as compressImage} from "./image-compressor.js?v=20261020-2";
import {makeImageVariants} from "./bali-design-variants.js?v=20261018-107";
import {PROMO_POSITION_PRESETS,promoEditorMode,promoEditorXY,promoStorePlacement}
  from "./bali-promo-placement.js?v=20261021-1";

const el=id=>document.getElementById(id);
const form=el("baliPromoForm"),list=el("baliPromoList"),status=el("baliPromoStatus");
if(form&&list&&status){
  const app=getApps().length?getApp():initializeApp(window.BALI_FIREBASE_CONFIG);
  const auth=getAuth(app),db=getFirestore(app),records=new Map();
  const collator=new Intl.Collator("ru",{numeric:true,sensitivity:"base"});
  let canEdit=false,unsubscribe=null,serial=0,selectedImage="",processing=false,imageSerial=0;
  let saving=false,saveFeedback="";
  const say=message=>{status.textContent=message;};
  const writeError=error=>{
    const code=error?.code||"unknown";
    if(code==="permission-denied")return "Firebase не разрешил сохранить предложение (permission-denied). Проверьте опубликованные правила Firestore для promotions и активную роль администратора.";
    if(code==="resource-exhausted"||code==="invalid-argument")return "Ошибка данных ("+code+"). Проверьте размер баннера и допустимые значения полей.";
    if(code==="unavailable"||code==="deadline-exceeded")return "Нет связи с Firebase ("+code+"). Попробуйте сохранить ещё раз.";
    return "Ошибка сохранения ("+code+"): "+String(error?.message||"Неизвестная ошибка").slice(0,220);
  };
  const save=el("baliPromoSave");
  const preview=el("baliPromoImagePreview");
  const urlInput=el("baliPromoImage");
  const fileInput=el("baliPromoImageFile");
  const variants=makeImageVariants("baliPromo","design-hero",message=>say(message));

  // Each promotional slide can define its own contact dialog.
  const holidayId="bali-new-year-2026";
  const holidayArt="assets/BALI_banner_badge_rectangular_only.png";
  const holidayPreset={
    id:holidayId,title:"БРОНИРОВАНИЕ НОВОГОДНИХ КОРПОРАТИВОВ",
    description:"Проведите незабываемый праздник в центре Минска. Выберите дату заранее.",
    imageUrl:"",imageTabletUrl:"",imageMobileUrl:"",
    destination:"contact-modal",buttonText:"Забронировать заранее",
    contactTitle:"Забронировать новогодний корпоратив",contactLinks:{},
    contactEnabled:{phone:true,telegram:true,instagram:true,whatsapp:true,viber:true},
    contactHotspot:{enabled:true,left:4,top:69,width:30,height:17},
    sort:0,published:true
  };
  const contactKinds=["phone","telegram","instagram","whatsapp","viber"];
  const contactId=name=>"baliPromoContact"+name.charAt(0).toUpperCase()+name.slice(1);
  const contactSettings=el("baliPromoContactSettings");
  const destinationInput=el("baliPromoDestination");
  const hotspotEnabled=el("baliPromoHotspotEnabled");
  const hotspotFields=el("baliPromoHotspotFields");
  function syncContactSettings(){
    contactSettings.hidden=destinationInput.value!=="contact-modal";
    hotspotFields.hidden=contactSettings.hidden||!hotspotEnabled.checked;
  }
  destinationInput.addEventListener("change",syncContactSettings);
  hotspotEnabled.addEventListener("change",syncContactSettings);
  const placement=el("baliPromoButtonPlacement");
  const placementPreview=el("baliPromoButtonPlacementPreview");
  const placementImage=el("baliPromoButtonPlacementImage");
  const placementHandle=el("baliPromoButtonPlacementHandle");
  const placementX=el("baliPromoButtonX"),placementY=el("baliPromoButtonY");
  const placementCoords=el("baliPromoButtonPlacementCoordinates");
  const clamp=(value,min,max)=>Math.max(min,Math.min(max,value));
  function drawPlacement(){
    const mode=placement.value;
    placementCoords.hidden=mode!=="manual";
    placementHandle.hidden=mode==="none"||mode==="original"||destinationInput.value==="none";
    placementHandle.textContent=el("baliPromoButton").value.trim()||"Подробнее";
    const point=promoEditorXY(mode,placementX.value,placementY.value);
    if(mode!=="manual"){placementX.value=point.x;placementY.value=point.y;}
    placementHandle.style.left=point.x+"%";
    placementHandle.style.top=point.y+"%";
    const source=selectedImage||urlInput.value.trim()||(el("baliPromoId").value===holidayId?holidayArt:"");
    placementImage.src=validImage(source)&&source?source:(el("baliPromoId").value===holidayId?holidayArt:"");
  }
  placement.addEventListener("change",drawPlacement);
  destinationInput.addEventListener("change",drawPlacement);
  for(const input of [placementX,placementY,el("baliPromoButton")])input.addEventListener("input",drawPlacement);
  let moving=false;
  placementHandle.addEventListener("pointerdown",event=>{
    if(placement.value!=="manual")return;
    moving=true;placementHandle.setPointerCapture(event.pointerId);event.preventDefault();
  });
  placementHandle.addEventListener("pointermove",event=>{
    if(!moving||placement.value!=="manual")return;
    const rect=placementPreview.getBoundingClientRect();
    placementX.value=Math.round(clamp((event.clientX-rect.left)/rect.width*100,5,95));
    placementY.value=Math.round(clamp((event.clientY-rect.top)/rect.height*100,5,95));
    drawPlacement();
  });
  for(const kind of ["pointerup","pointercancel","lostpointercapture"])placementHandle.addEventListener(kind,()=>moving=false);
  function readContacts(){
    const contactLinks={},contactEnabled={};
    for(const name of contactKinds){
      contactLinks[name]=el(contactId(name)).value.trim();
      contactEnabled[name]=el(contactId(name)+"Enabled").checked;
    }
    const contactHotspot={
      enabled:hotspotEnabled.checked,
      left:Number(el("baliPromoHotspotLeft").value),
      top:Number(el("baliPromoHotspotTop").value),
      width:Number(el("baliPromoHotspotWidth").value),
      height:Number(el("baliPromoHotspotHeight").value)
    };
    return {contactLinks,contactEnabled,contactTitle:el("baliPromoContactTitle").value.trim(),contactHotspot};
  }
  function validContactLink(name,value){
    if(!value)return true; // Empty field inherits the club's global contact.
    if(name==="phone")return /^tel:\+?[0-9]{5,22}$/.test(value);
    if(name==="viber"){
      try{
        const url=new URL(value);
        return url.protocol==="viber:"&&url.hostname==="chat"&&
          /^\+[0-9]{5,22}$/.test(url.searchParams.get("number")||"");
      }catch{return false;}
    }
    try{
      const url=new URL(value);
      if(url.protocol!=="https:")return false;
      const host=url.hostname.toLowerCase().replace(/^www\./,"");
      const hosts={
        telegram:["t.me","telegram.me"],
        instagram:["instagram.com"],
        whatsapp:["wa.me","api.whatsapp.com"]
      };
      return (hosts[name]||[]).includes(host)&&url.pathname.length>1;
    }catch{return false;}
  }

  const validImage=value=>value===""||
    (value.startsWith("https://")&&value.length<=2048)||
    (value.startsWith("data:image/webp;base64,")&&value.length<=155000);
  function node(tag,cls,label){
    const n=document.createElement(tag);
    if(cls)n.className=cls;
    if(label!==undefined)n.textContent=label;
    return n;
  }
  function showPreview(image){
    preview.replaceChildren();
    if((validImage(image)&&image)||image===holidayArt){
      const element=node("img");element.src=image;element.alt="Предпросмотр баннера BALI PRIVILEGE";
      preview.append(element);
    }else preview.append(node("span","","Предпросмотр баннера без обрезки"));
  }
  function clear(){
    saveFeedback="";
    imageSerial++;
    selectedImage="";
    processing=false;
    form.reset();
    el("baliPromoId").value="";
    el("baliPromoSort").value="100";
    save.textContent="Сохранить предложение";
    showPreview("");
    variants.set();
    syncContactSettings();
    placement.value="original";placementX.value=50;placementY.value=82;drawPlacement();
  }
  fileInput.addEventListener("change",async()=>{
    const file=fileInput.files?.[0];
    if(!file)return;
    const serial=++imageSerial;
    processing=true;save.disabled=true;say("Подготавливаем баннер, сохраняя исходные пропорции…");
    try{
      const result=await compressImage(file,"design-hero");
      if(serial!==imageSerial)return;
      selectedImage=result;urlInput.value="";showPreview(result);drawPlacement();
      say("Баннер обработан без обрезки текста. Сохраните форму.");
    }catch(error){
      if(serial===imageSerial)say(error.message||"Не удалось обработать баннер.");
    }finally{
      if(serial===imageSerial){processing=false;save.disabled=false;}
    }
  });
  urlInput.addEventListener("input",()=>{
    imageSerial++;selectedImage="";fileInput.value="";showPreview(urlInput.value.trim());drawPlacement();
  });
  el("baliPromoRemoveImage").addEventListener("click",()=>{
    imageSerial++;selectedImage="";urlInput.value="";fileInput.value="";showPreview("");
    say("Изображение очищено в форме. Сохраните предложение, чтобы применить изменение.");
  });
  el("baliPromoReset").addEventListener("click",()=>{clear();say("Форма очищена.");});
  function edit(item){
    clear();
    el("baliPromoId").value=item.id;
    el("baliPromoTitle").value=item.title??"";
    el("baliPromoDescription").value=item.description??"";
    selectedImage=item.imageUrl.startsWith("data:image/")?item.imageUrl:"";
    urlInput.value=item.imageUrl.startsWith("https://")?item.imageUrl:"";
    showPreview(item.imageUrl||(item.id===holidayId?holidayArt:""));
    variants.set({tablet:item.imageTabletUrl,mobile:item.imageMobileUrl});
    el("baliPromoDestination").value=item.destination;
    el("baliPromoButton").value=item.buttonText;
    el("baliPromoContactTitle").value=item.contactTitle||"Выберите удобный способ связи";
    for(const name of contactKinds){
      el(contactId(name)).value=item.contactLinks?.[name]||"";
      el(contactId(name)+"Enabled").checked=item.contactEnabled?.[name]!==false;
    }
    hotspotEnabled.checked=item.contactHotspot?.enabled===true;
    for(const side of ["left","top","width","height"]){
      const control=el("baliPromoHotspot"+side.charAt(0).toUpperCase()+side.slice(1));
      const value=item.contactHotspot?.[side];
      if(Number.isInteger(value))control.value=value;
    }
    syncContactSettings();
    placement.value=promoEditorMode(item.buttonPlacement);
    placementX.value=item.buttonPlacement?.x??50;
    placementY.value=item.buttonPlacement?.y??82;
    drawPlacement();
    el("baliPromoSort").value=item.sort;
    el("baliPromoPublished").checked=item.published;
    save.textContent="Сохранить изменения";
    form.scrollIntoView({behavior:"smooth",block:"start"});
    say("Редактирование: "+(item.title||"Баннер без заголовка")+(item.id===holidayId?" · Исходная картинка сохранится, пока вы не загрузите новую.":""));
  }
  // The holiday campaign exists on the public site even before anyone saves it
  // in Firestore. Make that shipped campaign editable instead of invisible here.
  window.addEventListener("bali:admin:edit-promo",event=>{
    if(!canEdit){say("Войдите как активный администратор.");return;}
    const id=event.detail?.id;
    const item=records.get(id)||(id===holidayId?holidayPreset:null);
    if(!item){say("Это предложение не найдено. Выберите его в списке ниже.");return;}
    edit(item);
  });
  function draw(){
    list.replaceChildren();
    const otherNewYear=[...records.values()].some(item=>item.id!==holidayId&&/новогодн/i.test(item.title));
    const sorted=[...records.values()];
    if(!records.has(holidayId)&&!otherNewYear)sorted.unshift(holidayPreset);
    sorted.sort((a,b)=>a.sort-b.sort||collator.compare(a.title,b.title));
    if(!sorted.length){
      list.append(node("p","hint","Предложений пока нет. Добавьте первый баннер и опубликуйте его."));
      return;
    }
    for(const item of sorted){
      const row=node("div","bali-promo-item");
      const displayArt=item.imageUrl||(item.id===holidayId?holidayArt:"");
      if((validImage(displayArt)&&displayArt)||displayArt===holidayArt){
        const picture=node("img","bali-promo-preview");
        picture.loading="lazy";picture.src=displayArt;picture.alt="";
        row.append(picture);
      }
      const info=node("div","bali-promo-copy");
      const isBuiltin=item.id===holidayId&&!records.has(holidayId);
      info.append(node("strong","",item.title||"Баннер без заголовка"),
        node("small","",isBuiltin?"Встроенный баннер · можно настроить":item.published?"Опубликовано":"Черновик"),
        ...(item.description?[node("p","",item.description)]:[]));
      const controls=node("div","bali-promo-actions");
      const editButton=node("button","",isBuiltin?"Настроить":"Изменить");editButton.type="button";
      editButton.addEventListener("click",()=>edit(item));
      const remove=node("button","","Удалить");remove.type="button";
      remove.addEventListener("click",async()=>{
        if(!canEdit||!confirm("Удалить предложение «"+(item.title||"Баннер без заголовка")+"»?"))return;
        remove.disabled=true;
        try{
          await deleteDoc(doc(db,"promotions",item.id));
          if(el("baliPromoId").value===item.id)clear();
          say("Предложение удалено.");
        }catch(error){say("Не удалось удалить: "+(error.code||"ошибка"));}
        finally{remove.disabled=false;}
      });
      controls.append(editButton);
      if(!isBuiltin)controls.append(remove);
      row.append(info,controls);list.append(row);
    }
  }
  form.addEventListener("submit",async event=>{
    event.preventDefault();
    if(!canEdit){say("Необходимы активные права администратора.");return;}
    if(processing||variants.busy()){say("Подождите, изображение ещё обрабатывается.");return;}
    const title=el("baliPromoTitle").value.trim();
    const description=el("baliPromoDescription").value.trim();
    const imageUrl=selectedImage||urlInput.value.trim();
    const versions=variants.read();
    const destination=el("baliPromoDestination").value;
    const buttonText=el("baliPromoButton").value.trim();
    const {contactLinks,contactEnabled,contactTitle,contactHotspot}=readContacts();
    const buttonPlacement=promoStorePlacement(placement.value,placementX.value,placementY.value);
    const sort=Number(el("baliPromoSort").value);
    const published=el("baliPromoPublished").checked;
    if((title.length!==0&&title.length<2)||title.length>100||description.length>260
       ||!validImage(imageUrl)||!variants.valid()||!["none","events","menu","contacts","contact-modal"].includes(destination)
       ||buttonText.length>65||!(placement.value==="original"||placement.value==="none"||placement.value==="manual"||
         Object.hasOwn(PROMO_POSITION_PRESETS,placement.value))
       ||(buttonPlacement&&(!Number.isInteger(buttonPlacement.x)||!Number.isInteger(buttonPlacement.y)
       ||buttonPlacement.x<5||buttonPlacement.x>95||buttonPlacement.y<5||buttonPlacement.y>95))||contactTitle.length>70
       ||contactKinds.some(name=>contactLinks[name].length>300||!validContactLink(name,contactLinks[name]))
       ||(destination==="contact-modal"&&!contactKinds.some(name=>contactEnabled[name]))
       ||["left","top","width","height"].some(side=>!Number.isInteger(contactHotspot[side]))
       ||contactHotspot.left<0||contactHotspot.top<0
       ||contactHotspot.width<1||contactHotspot.height<1
       ||contactHotspot.left+contactHotspot.width>100
       ||contactHotspot.top+contactHotspot.height>100||!Number.isInteger(sort)||sort<0||sort>100000||
       !(title||description||imageUrl)){
      say("Загрузите изображение или добавьте текст; проверьте адрес изображения, кнопку и сортировку.");return;
    }
    const id=el("baliPromoId").value;
    const ref=id?doc(db,"promotions",id):doc(collection(db,"promotions"));
    saving=true;saveFeedback="";save.disabled=true;say("Сохраняем предложение в Firebase…");
    try{
      // Old, ordinary slides keep their original Firestore shape so editing them
      // remains possible before production rules for contact-modal are deployed.
      const payload={title,description,imageUrl,imageTabletUrl:versions.tablet,
        imageMobileUrl:versions.mobile,destination,buttonText,
        ...(buttonPlacement?{buttonPlacement}:{}),sort,published,updatedAt:serverTimestamp()};
      // Keep text/button styling created in the simple banner composer.
      const existing=records.get(id);
      if(existing?.overlay)payload.overlay=existing.overlay;
      if(existing&&Object.prototype.hasOwnProperty.call(existing,"imageRemoved")){
        payload.imageRemoved=imageUrl||versions.mobile||versions.tablet?false:existing.imageRemoved;
      }
      if(destination==="contact-modal"){
        Object.assign(payload,{contactTitle,contactLinks,contactEnabled,contactHotspot});
      }
      await setDoc(ref,payload);
      clear();saveFeedback=published?"Предложение опубликовано и сохранено в Firebase.":"Черновик сохранён в Firebase.";
      say(saveFeedback);
    }catch(error){
      saveFeedback=writeError(error);
      say(saveFeedback);
      console.warn("BALI PRIVILEGE save failed:",error?.code||"unknown");
    }finally{saving=false;save.disabled=false;}
  });
  onAuthStateChanged(auth,async user=>{
    const run=++serial;
    if(unsubscribe){unsubscribe();unsubscribe=null;}
    canEdit=false;records.clear();draw();
    if(!user?.emailVerified){say("Войдите как администратор.");return;}
    try{
      const role=await getDoc(doc(db,"admins",user.uid));
      if(run!==serial||auth.currentUser?.uid!==user.uid)return;
      if(role.data()?.active!==true){say("Нет роли администратора.");return;}
      canEdit=true;
      unsubscribe=onSnapshot(collection(db,"promotions"),snapshot=>{
        records.clear();
        for(const d of snapshot.docs){
          const i={id:d.id,...d.data()};
          if(typeof i.title==="string"&&typeof i.description==="string"
             &&typeof i.imageUrl==="string"&&typeof i.destination==="string"
             &&typeof i.buttonText==="string"&&typeof i.published==="boolean"
             &&Number.isInteger(i.sort))records.set(d.id,i);
        }
        draw();if(!saving&&!saveFeedback)say("Предложений: "+records.size+". Данные синхронизированы с Firebase.");
      },error=>say(error.code==="permission-denied"
        ?"Нет доступа к promotions. Необходимо опубликовать Firestore Rules."
        :"Не удалось загрузить предложения: "+(error.code||"ошибка")));
    }catch(error){
      if(run===serial)say("Не удалось проверить доступ: "+(error.code||"ошибка"));
    }
  });
  showPreview("");
}
