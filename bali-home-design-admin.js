/* BALI · Admin editor for the About card only. BALI ID is managed through
   the existing Privilege admin interface; the old store editor is retired.
   Historical Firestore merch data is not modified or deleted. */
import {getApp,getApps,initializeApp} from "https://www.gstatic.com/firebasejs/10.14.1/firebase-app.js";
import {getAuth,onAuthStateChanged} from "https://www.gstatic.com/firebasejs/10.14.1/firebase-auth.js";
import {getFirestore,doc,getDoc,onSnapshot,setDoc,serverTimestamp}
  from "https://www.gstatic.com/firebasejs/10.14.1/firebase-firestore.js";
import {prepareImage as compressImage} from "./image-compressor.js?v=20261020-2";
import {makeImageVariants} from "./bali-design-variants.js?v=20261018-107";

const app=getApps().length?getApp():initializeApp(window.BALI_FIREBASE_CONFIG);
const db=getFirestore(app),auth=getAuth(app),el=id=>document.getElementById(id);
const form=el("baliHomeAboutForm");
if(form){
 const aboutRef=doc(db,"settings","homeDesign");
 const defaults={aboutTitle:"О клубе",aboutSubtitle:"Атмосфера, музыка, люди",
   aboutDescription:"Ночной клуб BALI в Минске. Музыка, события и встречи в одной атмосфере.",aboutImageUrl:""};
 let authorized=false,epoch=0,aboutUnsub=null,imageData="",fileSerial=0,processing=false;
 const validImage=value=>typeof value==="string"&&(
   value===""||(value.startsWith("https://")&&value.length<=2048)||
   (value.startsWith("data:image/webp;base64,")&&value.length<=125000));
 const say=message=>{const node=el("baliHomeAboutStatus");if(node)node.textContent=message;};
 const variants=makeImageVariants("baliHomeAbout","design-about",say);
 function preview(value){
   const host=el("baliHomeAboutPreview");
   if(!host)return;
   host.replaceChildren();
   if(validImage(value)&&value){
     const img=document.createElement("img");img.src=value;img.alt="Фотография клуба";
     host.append(img);
   }else{
     const label=document.createElement("span");label.textContent="Фото клуба";host.append(label);
   }
 }
 function setAccess(value){
   for(const element of form.querySelectorAll("input,textarea,select,button"))element.disabled=!value;
 }
 function setAbout(data){
   fileSerial++;
   const values=data||defaults;
   el("baliHomeAboutTitle").value=values.aboutTitle??defaults.aboutTitle;
   el("baliHomeAboutSubtitle").value=values.aboutSubtitle??defaults.aboutSubtitle;
   el("baliHomeAboutDescription").value=values.aboutDescription??defaults.aboutDescription;
   const image=typeof values.aboutImageUrl==="string"?values.aboutImageUrl:"";
   imageData=image.startsWith("data:image/webp;base64,")?image:"";
   el("baliHomeAboutImageUrl").value=image.startsWith("https://")?image:"";
   el("baliHomeAboutFile").value="";
   preview(image);
   variants.set({tablet:values.aboutImageTabletUrl,mobile:values.aboutImageMobileUrl});
 }
 el("baliHomeAboutFile").addEventListener("change",async event=>{
   const file=event.target.files?.[0];
   if(!file)return;
   const serial=++fileSerial;processing=true;say("Обрабатываем изображение…");
   try{
     const image=await compressImage(file,"design-about");
     if(serial!==fileSerial)return;
     imageData=image;el("baliHomeAboutImageUrl").value="";preview(image);
     say("Фотография подготовлена. Сохраните форму для публикации.");
   }catch(error){
     if(serial===fileSerial)say(error.message||"Не удалось загрузить фото.");
   }finally{if(serial===fileSerial)processing=false;}
 });
 el("baliHomeAboutImageUrl").addEventListener("input",event=>{
   fileSerial++;imageData="";el("baliHomeAboutFile").value="";
   preview(event.target.value.trim());
 });
 el("baliHomeAboutRemoveImage").addEventListener("click",()=>{
   fileSerial++;imageData="";el("baliHomeAboutFile").value="";
   el("baliHomeAboutImageUrl").value="";preview("");
   say("Изображение убрано из формы. Сохраните изменение.");
 });
 form.addEventListener("submit",async event=>{
   event.preventDefault();
   if(!authorized||processing||variants.busy()){
     say("Подождите окончания обработки фотографии или войдите как администратор.");return;
   }
   const aboutTitle=el("baliHomeAboutTitle").value.trim();
   const aboutSubtitle=el("baliHomeAboutSubtitle").value.trim();
   const aboutDescription=el("baliHomeAboutDescription").value.trim();
   const aboutImageUrl=imageData||el("baliHomeAboutImageUrl").value.trim();
   const versions=variants.read();
   if(!validImage(aboutImageUrl)||!variants.valid()||
      !(aboutTitle||aboutSubtitle||aboutDescription||aboutImageUrl)){
     say("Добавьте изображение или хотя бы один текстовый блок. Проверьте формат изображений.");return;
   }
   const button=el("baliHomeAboutSave");button.disabled=true;
   say("Сохраняем блок «О клубе»…");
   try{
     await setDoc(aboutRef,{aboutTitle,aboutSubtitle,aboutDescription,aboutImageUrl,
       aboutImageTabletUrl:versions.tablet,aboutImageMobileUrl:versions.mobile,
       updatedAt:serverTimestamp()});
     window.BaliPublicPublish?.queue("settings/homeDesign");
     say("Сохранено. Карточка клуба обновлена на сайте.");
   }catch(error){
     say(error.code==="permission-denied"?
       "Нет доступа. Опубликуйте обновлённые Firestore Rules.":
       "Ошибка сохранения: "+(error.code||"неизвестная"));
   }finally{button.disabled=false;}
 });
 setAccess(false);setAbout(defaults);
 onAuthStateChanged(auth,async user=>{
   const serial=++epoch;authorized=false;
   aboutUnsub?.();aboutUnsub=null;setAccess(false);
   if(!user?.emailVerified){say("Войдите в подтверждённый аккаунт администратора.");return;}
   try{
     const role=await getDoc(doc(db,"admins",user.uid));
     if(serial!==epoch||auth.currentUser?.uid!==user.uid)return;
     if(role.data()?.active!==true){say("Нет роли администратора.");return;}
     authorized=true;setAccess(true);
     aboutUnsub=onSnapshot(aboutRef,snapshot=>{
       setAbout(snapshot.exists()?snapshot.data():defaults);
       say("Карточка клуба синхронизирована с сайтом.");
     },error=>say("Не удалось загрузить настройки: "+(error.code||"ошибка")));
   }catch(error){
     if(serial===epoch)say("Проверка прав не удалась: "+(error.code||"ошибка"));
   }
 });
}
