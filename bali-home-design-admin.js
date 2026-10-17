/* BALI v74 — Home Design: club card and multiple merchandise slides.
   Image uploads are compressed locally and stored as WebP in Firestore. */
import {getApp,getApps,initializeApp} from "https://www.gstatic.com/firebasejs/10.14.1/firebase-app.js";
import {getAuth,onAuthStateChanged} from "https://www.gstatic.com/firebasejs/10.14.1/firebase-auth.js";
import {getFirestore,doc,collection,getDoc,onSnapshot,setDoc,deleteDoc,serverTimestamp}
  from "https://www.gstatic.com/firebasejs/10.14.1/firebase-firestore.js";
import {compressImage} from "./image-compressor.js?v=20261017-79";
import {makeImageVariants} from "./bali-design-variants.js";
const app=getApps().length?getApp():initializeApp(window.BALI_FIREBASE_CONFIG);
const db=getFirestore(app),auth=getAuth(app),el=id=>document.getElementById(id);
const aboutForm=el("baliHomeAboutForm"),merchForm=el("baliHomeMerchForm");
if(aboutForm&&merchForm){
  const aboutRef=doc(db,"settings","homeDesign");
  const merchRef=collection(db,"merch");
  const merchItems=new Map();
  const collator=new Intl.Collator("ru",{numeric:true,sensitivity:"base"});
  const defaults={aboutTitle:"О клубе",aboutSubtitle:"Атмосфера, музыка, люди",
    aboutDescription:"Ночной клуб BALI в Минске. Музыка, события и встречи в одной атмосфере.",aboutImageUrl:""};
  let authorized=false,epoch=0,aboutUnsub=null,merchUnsub=null;
  let aboutImage="",merchImage="",aboutFileSerial=0,merchFileSerial=0,aboutProcessing=false,merchProcessing=false;
  const validImage=value=>value===""||
    (value.startsWith("https://")&&value.length<=2048)||
    (value.startsWith("data:image/webp;base64,")&&value.length<=125000);
  const say=(id,message)=>{const target=el(id);if(target)target.textContent=message;};
  const make=(tag,className,text)=>{const e=document.createElement(tag);if(className)e.className=className;if(text!==undefined)e.textContent=text;return e;};
  function preview(id,image,label){
    const host=el(id);host.replaceChildren();
    if(validImage(image)&&image){const img=make("img");img.src=image;img.alt=label;host.append(img);}
    else host.append(make("span","",label));
  }
  function setAccess(value){
    for(const form of [aboutForm,merchForm]){
      for(const input of form.querySelectorAll("input,textarea,select,button"))input.disabled=!value;
    }
  }
  setAccess(false);
  const aboutVariants=makeImageVariants("baliHomeAbout","design-about",message=>say("baliHomeAboutStatus",message));
  const merchVariants=makeImageVariants("baliHomeMerch","design-merch",message=>say("baliHomeMerchFeedback",message));
  function resetMerch(){
    merchFileSerial++;merchImage="";merchProcessing=false;merchForm.reset();
    el("baliHomeMerchId").value="";el("baliHomeMerchPrice").value="0";
    el("baliHomeMerchSort").value="100";el("baliHomeMerchSave").textContent="Сохранить товар";
    preview("baliHomeMerchPreview","","Фото товара 3:2");
    merchVariants.set();
  }
  function setAbout(data){
    aboutFileSerial++;
    const values=data||defaults;
    el("baliHomeAboutTitle").value=values.aboutTitle||defaults.aboutTitle;
    el("baliHomeAboutSubtitle").value=values.aboutSubtitle||defaults.aboutSubtitle;
    el("baliHomeAboutDescription").value=values.aboutDescription||defaults.aboutDescription;
    aboutImage=values.aboutImageUrl?.startsWith("data:image/webp;base64,")?values.aboutImageUrl:"";
    el("baliHomeAboutImageUrl").value=values.aboutImageUrl?.startsWith("https://")?values.aboutImageUrl:"";
    el("baliHomeAboutFile").value="";
    preview("baliHomeAboutPreview",values.aboutImageUrl||"","Фото клуба ПК 9:14");
    aboutVariants.set({tablet:values.aboutImageTabletUrl,mobile:values.aboutImageMobileUrl});
  }
  async function fileChange(file,kind,isAbout){
    if(!file)return;
    const serial=isAbout?++aboutFileSerial:++merchFileSerial;
    if(isAbout)aboutProcessing=true;else merchProcessing=true;
    const id=isAbout?"baliHomeAboutStatus":"baliHomeMerchFeedback";
    const target=isAbout?"baliHomeAboutPreview":"baliHomeMerchPreview";
    const urlId=isAbout?"baliHomeAboutImageUrl":"baliHomeMerchImageUrl";
    say(id,"Обрабатываем изображение…");
    try{
      const image=await compressImage(file,kind);
      if((isAbout?aboutFileSerial:merchFileSerial)!==serial)return;
      if(isAbout)aboutImage=image;else merchImage=image;
      el(urlId).value="";
      preview(target,image,isAbout?"Фото клуба 1:1":"Фото товара 3:2");
      say(id,"Фотография подготовлена. Сохраните форму для публикации.");
    }catch(error){
      if((isAbout?aboutFileSerial:merchFileSerial)===serial)
        say(id,error.message||"Не удалось загрузить фото.");
    }finally{
      if((isAbout?aboutFileSerial:merchFileSerial)===serial){
        if(isAbout)aboutProcessing=false;else merchProcessing=false;
      }
    }
  }
  el("baliHomeAboutFile").addEventListener("change",e=>void fileChange(e.target.files?.[0],"design-about",true));
  el("baliHomeMerchFile").addEventListener("change",e=>void fileChange(e.target.files?.[0],"design-merch",false));
  for(const about of [true,false]){
    const urlInput=el(about?"baliHomeAboutImageUrl":"baliHomeMerchImageUrl");
    const fileInput=el(about?"baliHomeAboutFile":"baliHomeMerchFile");
    const previewId=about?"baliHomeAboutPreview":"baliHomeMerchPreview";
    const removal=el(about?"baliHomeAboutRemoveImage":"baliHomeMerchRemoveImage");
    urlInput.addEventListener("input",()=>{
      if(about){aboutFileSerial++;aboutImage="";}
      else{merchFileSerial++;merchImage="";}
      fileInput.value="";
      preview(previewId,urlInput.value.trim(),about?"Фото клуба 1:1":"Фото товара 3:2");
    });
    removal.addEventListener("click",()=>{
      if(about){aboutFileSerial++;aboutImage="";}
      else{merchFileSerial++;merchImage="";}
      urlInput.value="";fileInput.value="";
      preview(previewId,"",about?"Фото клуба 1:1":"Фото товара 3:2");
      say(about?"baliHomeAboutStatus":"baliHomeMerchFeedback","Изображение убрано из формы. Сохраните изменение.");
    });
  }
  aboutForm.addEventListener("submit",async e=>{
    e.preventDefault();
    if(!authorized||aboutProcessing||aboutVariants.busy()){say("baliHomeAboutStatus","Подождите окончания обработки фотографии или войдите как администратор.");return;}
    const aboutTitle=el("baliHomeAboutTitle").value.trim();
    const aboutSubtitle=el("baliHomeAboutSubtitle").value.trim();
    const aboutDescription=el("baliHomeAboutDescription").value.trim();
    const aboutImageUrl=aboutImage||el("baliHomeAboutImageUrl").value.trim();
    const versions=aboutVariants.read();
    if(!aboutTitle||!aboutSubtitle||!aboutDescription||!validImage(aboutImageUrl)||!aboutVariants.valid()){
      say("baliHomeAboutStatus","Заполните тексты и проверьте изображение.");return;
    }
    const button=el("baliHomeAboutSave");button.disabled=true;
    say("baliHomeAboutStatus","Сохраняем блок «О клубе»…");
    try{
      await setDoc(aboutRef,{aboutTitle,aboutSubtitle,aboutDescription,aboutImageUrl,
        aboutImageTabletUrl:versions.tablet,aboutImageMobileUrl:versions.mobile,
        updatedAt:serverTimestamp()});
      say("baliHomeAboutStatus","Сохранено. Карточка клуба обновлена на сайте.");
    }catch(error){
      say("baliHomeAboutStatus",error.code==="permission-denied"
        ?"Нет доступа. Опубликуйте обновлённые Firestore Rules."
        :"Ошибка сохранения: "+(error.code||"неизвестная"));
    }finally{button.disabled=false;}
  });
  function editMerch(item){
    resetMerch();
    el("baliHomeMerchId").value=item.id;
    el("baliHomeMerchName").value=item.name;
    el("baliHomeMerchDescription").value=item.description;
    el("baliHomeMerchStatus").value=item.status;
    el("baliHomeMerchPrice").value=item.price;
    el("baliHomeMerchSort").value=item.sort;
    el("baliHomeMerchPublished").checked=item.published;
    merchImage=item.imageUrl.startsWith("data:image/webp;base64,")?item.imageUrl:"";
    el("baliHomeMerchImageUrl").value=item.imageUrl.startsWith("https://")?item.imageUrl:"";
    preview("baliHomeMerchPreview",item.imageUrl,"Фото товара 3:2");
    merchVariants.set({tablet:item.imageTabletUrl,mobile:item.imageMobileUrl});
    el("baliHomeMerchSave").textContent="Сохранить изменения";
    merchForm.scrollIntoView({block:"start",behavior:"smooth"});
    say("baliHomeMerchFeedback","Редактирование товара: "+item.name);
  }
  function renderMerch(){
    const host=el("baliHomeMerchList");host.replaceChildren();
    const items=[...merchItems.values()].sort((a,b)=>a.sort-b.sort||collator.compare(a.name,b.name));
    if(!items.length){host.append(make("p","hint","Товаров пока нет. Добавьте первый мерч."));return;}
    for(const item of items){
      const row=make("div","bali-design-merch-entry");
      if(validImage(item.imageUrl)&&item.imageUrl){
        const img=make("img");img.src=item.imageUrl;img.alt="";img.loading="lazy";row.append(img);
      }
      const info=make("div","bali-design-merch-entry-info");
      info.append(make("strong","",item.name),
        make("small","",item.published?"Показывается":"Черновик"),
        make("span","",item.status==="available"?item.price.toFixed(2)+" BYN":"Скоро в продаже"));
      const buttons=make("div","bali-design-merch-entry-actions");
      const edit=make("button","","Изменить");edit.type="button";edit.addEventListener("click",()=>editMerch(item));
      const remove=make("button","","Удалить");remove.type="button";
      remove.addEventListener("click",async()=>{
        if(!authorized||!confirm("Удалить «"+item.name+"»?"))return;
        remove.disabled=true;
        try{await deleteDoc(doc(db,"merch",item.id));if(el("baliHomeMerchId").value===item.id)resetMerch();}
        catch(error){say("baliHomeMerchFeedback","Ошибка удаления: "+(error.code||"неизвестная"));}
        finally{remove.disabled=false;}
      });
      buttons.append(edit,remove);row.append(info,buttons);host.append(row);
    }
  }
  el("baliHomeMerchReset").addEventListener("click",()=>{resetMerch();say("baliHomeMerchFeedback","Новый товар.");});
  merchForm.addEventListener("submit",async e=>{
    e.preventDefault();
    if(!authorized||merchProcessing||merchVariants.busy()){say("baliHomeMerchFeedback","Дождитесь обработки фотографии или войдите как администратор.");return;}
    const name=el("baliHomeMerchName").value.trim();
    const description=el("baliHomeMerchDescription").value.trim();
    const status=el("baliHomeMerchStatus").value;
    const price=Number(el("baliHomeMerchPrice").value);
    const sort=Number(el("baliHomeMerchSort").value);
    const published=el("baliHomeMerchPublished").checked;
    const imageUrl=merchImage||el("baliHomeMerchImageUrl").value.trim();
    const versions=merchVariants.read();
    if(name.length<2||name.length>95||description.length>180||!["soon","available"].includes(status)||
       !Number.isFinite(price)||price<0||price>20000||
       !Number.isInteger(sort)||sort<0||sort>100000||!validImage(imageUrl)||!merchVariants.valid()||
       (status==="available"&&price<=0)){
      say("baliHomeMerchFeedback","Проверьте название, цену, фото и сортировку. Для товара в продаже цена должна быть больше нуля.");return;
    }
    const id=el("baliHomeMerchId").value;
    const ref=id?doc(db,"merch",id):doc(merchRef);
    const button=el("baliHomeMerchSave");button.disabled=true;
    say("baliHomeMerchFeedback","Сохраняем товар…");
    try{
      await setDoc(ref,{name,description,imageUrl,imageTabletUrl:versions.tablet,
        imageMobileUrl:versions.mobile,status,price,sort,published,updatedAt:serverTimestamp()});
      resetMerch();say("baliHomeMerchFeedback",published?"Товар опубликован.":"Черновик сохранён.");
    }catch(error){say("baliHomeMerchFeedback",error.code==="permission-denied"
      ?"Недостаточно прав. Опубликуйте обновлённые Firestore Rules."
      :"Ошибка сохранения: "+(error.code||"неизвестная"));}
    finally{button.disabled=false;}
  });
  onAuthStateChanged(auth,async user=>{
    const serial=++epoch;authorized=false;
    if(aboutUnsub)aboutUnsub();if(merchUnsub)merchUnsub();
    aboutUnsub=null;merchUnsub=null;merchItems.clear();renderMerch();setAccess(false);
    if(!user?.emailVerified){
      say("baliHomeAboutStatus","Войдите в подтверждённый аккаунт администратора.");
      say("baliHomeMerchFeedback","Ожидаем авторизацию администратора.");return;
    }
    try{
      const role=await getDoc(doc(db,"admins",user.uid));
      if(serial!==epoch||auth.currentUser?.uid!==user.uid)return;
      if(role.data()?.active!==true){
        say("baliHomeAboutStatus","Нет роли администратора.");
        say("baliHomeMerchFeedback","Нет роли администратора.");return;
      }
      authorized=true;setAccess(true);
      aboutUnsub=onSnapshot(aboutRef,snapshot=>{
        setAbout(snapshot.exists()?snapshot.data():defaults);
        say("baliHomeAboutStatus","Карточка клуба синхронизирована с сайтом.");
      },error=>say("baliHomeAboutStatus","Не удалось загрузить настройки: "+(error.code||"ошибка")));
      merchUnsub=onSnapshot(merchRef,snapshot=>{
        merchItems.clear();for(const d of snapshot.docs){
          const item={id:d.id,...d.data()};
          if(typeof item.name==="string"&&typeof item.description==="string"&&
             typeof item.imageUrl==="string"&&typeof item.status==="string"&&
             typeof item.price==="number"&&typeof item.sort==="number"&&
             typeof item.published==="boolean")merchItems.set(d.id,item);
        }
        renderMerch();
        say("baliHomeMerchFeedback","Товаров мерча: "+merchItems.size+". Данные синхронизируются с сайтом.");
      },error=>say("baliHomeMerchFeedback","Не удалось загрузить мерч: "+(error.code||"ошибка")));
    }catch(error){
      if(serial===epoch){
        say("baliHomeAboutStatus","Проверка прав не удалась: "+(error.code||"ошибка"));
        say("baliHomeMerchFeedback","Проверка прав не удалась.");
      }
    }
  });
  setAbout(defaults);resetMerch();
}
