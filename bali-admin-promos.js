/* BALI PRIVILEGE · published, manually curated slides with local-image upload. */
import {initializeApp,getApps,getApp} from "https://www.gstatic.com/firebasejs/10.14.1/firebase-app.js";
import {getAuth,onAuthStateChanged} from "https://www.gstatic.com/firebasejs/10.14.1/firebase-auth.js";
import {getFirestore,collection,doc,getDoc,onSnapshot,setDoc,deleteDoc,serverTimestamp}
  from "https://www.gstatic.com/firebasejs/10.14.1/firebase-firestore.js";
import {compressImage} from "./image-compressor.js?v=20261018-107";
import {makeImageVariants} from "./bali-design-variants.js?v=20261018-107";

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
    if(validImage(image)&&image){
      const element=node("img");element.src=image;element.alt="Предпросмотр баннера BALI PRIVILEGE";
      preview.append(element);
    }else preview.append(node("span","","Предпросмотр баннера без обрезки"));
  }
  function clear(){
    imageSerial++;
    selectedImage="";
    processing=false;
    form.reset();
    el("baliPromoId").value="";
    el("baliPromoSort").value="100";
    save.textContent="Сохранить предложение";
    showPreview("");
    variants.set();
  }
  fileInput.addEventListener("change",async()=>{
    const file=fileInput.files?.[0];
    if(!file)return;
    const serial=++imageSerial;
    processing=true;save.disabled=true;say("Подготавливаем баннер, сохраняя исходные пропорции…");
    try{
      const result=await compressImage(file,"design-hero");
      if(serial!==imageSerial)return;
      selectedImage=result;urlInput.value="";showPreview(result);
      say("Баннер обработан без обрезки текста. Сохраните форму.");
    }catch(error){
      if(serial===imageSerial)say(error.message||"Не удалось обработать баннер.");
    }finally{
      if(serial===imageSerial){processing=false;save.disabled=false;}
    }
  });
  urlInput.addEventListener("input",()=>{
    imageSerial++;selectedImage="";fileInput.value="";showPreview(urlInput.value.trim());
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
    showPreview(item.imageUrl);
    variants.set({tablet:item.imageTabletUrl,mobile:item.imageMobileUrl});
    el("baliPromoDestination").value=item.destination;
    el("baliPromoButton").value=item.buttonText;
    el("baliPromoSort").value=item.sort;
    el("baliPromoPublished").checked=item.published;
    save.textContent="Сохранить изменения";
    form.scrollIntoView({behavior:"smooth",block:"start"});
    say("Редактирование: "+(item.title||"Баннер без заголовка"));
  }
  function draw(){
    list.replaceChildren();
    const sorted=[...records.values()].sort((a,b)=>a.sort-b.sort||collator.compare(a.title,b.title));
    if(!sorted.length){
      list.append(node("p","hint","Предложений пока нет. Добавьте первый баннер и опубликуйте его."));
      return;
    }
    for(const item of sorted){
      const row=node("div","bali-promo-item");
      if(validImage(item.imageUrl)&&item.imageUrl){
        const picture=node("img","bali-promo-preview");
        picture.loading="lazy";picture.src=item.imageUrl;picture.alt="";
        row.append(picture);
      }
      const info=node("div","bali-promo-copy");
      info.append(node("strong","",item.title||"Баннер без заголовка"),
        node("small","",item.published?"Опубликовано":"Черновик"),
        ...(item.description?[node("p","",item.description)]:[]));
      const controls=node("div","bali-promo-actions");
      const editButton=node("button","","Изменить");editButton.type="button";
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
      controls.append(editButton,remove);row.append(info,controls);list.append(row);
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
    const sort=Number(el("baliPromoSort").value);
    const published=el("baliPromoPublished").checked;
    if((title.length!==0&&title.length<2)||title.length>100||description.length>260
       ||!validImage(imageUrl)||!variants.valid()||!["none","events","menu","contacts"].includes(destination)
       ||buttonText.length>35||!Number.isInteger(sort)||sort<0||sort>100000||
       !(title||description||imageUrl)){
      say("Загрузите изображение или добавьте текст; проверьте адрес изображения, кнопку и сортировку.");return;
    }
    const id=el("baliPromoId").value;
    const ref=id?doc(db,"promotions",id):doc(collection(db,"promotions"));
    saving=true;saveFeedback="";save.disabled=true;say("Сохраняем предложение в Firebase…");
    try{
      await setDoc(ref,{title,description,imageUrl,imageTabletUrl:versions.tablet,
        imageMobileUrl:versions.mobile,destination,buttonText,sort,published,updatedAt:serverTimestamp()});
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
