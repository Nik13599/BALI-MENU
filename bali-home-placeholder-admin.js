/* BALI v91: one Firestore-backed SECRET artwork shared by all empty PC Home slots.
   Independent of actual events and their calendar records. */
import {getApp,getApps,initializeApp} from "https://www.gstatic.com/firebasejs/10.14.1/firebase-app.js";
import {getAuth,onAuthStateChanged} from "https://www.gstatic.com/firebasejs/10.14.1/firebase-auth.js";
import {getFirestore,doc,getDoc,onSnapshot,setDoc,serverTimestamp}
  from "https://www.gstatic.com/firebasejs/10.14.1/firebase-firestore.js";
import {prepareImage as compressImage} from "./image-compressor.js?v=20261021-square1";

const $=id=>document.getElementById(id);
const form=$("baliEventPlaceholderForm");
if(form){
  const app=getApps().length?getApp():initializeApp(window.BALI_FIREBASE_CONFIG);
  const db=getFirestore(app),auth=getAuth(app);
  const ref=doc(db,"settings","homeEventPlaceholder");
  const defaults={
    posterTitle:"SECRET", kicker:"SECRET",
    footerTitle:"СКОРО В BALI",footerSubtitle:"Совсем скоро узнаете",
    imageUrl:"",accentColor:"#b9ff51",backgroundColor:"#12171c"
  };
  const keys={
    posterTitle:"baliPlaceholderPosterTitle",
    footerTitle:"baliPlaceholderFooterTitle",
    footerSubtitle:"baliPlaceholderFooterSubtitle",
    accentColor:"baliPlaceholderAccentColor",
    backgroundColor:"baliPlaceholderBackgroundColor"
  };
  const image=$("baliPlaceholderPreviewImage"),file=$("baliPlaceholderImageFile"),
    url=$("baliPlaceholderImageUrl"),save=$("baliPlaceholderSave"),status=$("baliPlaceholderStatus");
  const safeImage=x=>x===""||
    (typeof x==="string"&&x.startsWith("https://")&&x.length<=2048)||
    (typeof x==="string"&&x.startsWith("data:image/webp;base64,")&&x.length<=120000);
  let authorized=false,loaded=false,processing=false,pending=false,localImage="",fileSerial=0,
    authSerial=0,unsubscribe=null,dirty=false;
  function say(value){status.textContent=value;}
  function read(){
    const data={};
    for(const [key,id] of Object.entries(keys))data[key]=$(id).value.trim();
    // Keep the legacy Firestore key for existing published rules; it is no
    // longer displayed as a separate overline on the card.
    data.kicker="SECRET";
    data.imageUrl=localImage||url.value.trim();
    return data;
  }
  function preview(){
    const data=read();
    $("baliPlaceholderPreviewTitle").textContent=data.posterTitle||defaults.posterTitle;
    $("baliPlaceholderPreviewFooterTitle").textContent=data.footerTitle||defaults.footerTitle;
    $("baliPlaceholderPreviewFooterSubtitle").textContent=data.footerSubtitle||defaults.footerSubtitle;
    const customPicture=safeImage(data.imageUrl)&&data.imageUrl?data.imageUrl:"";
    image.hidden=!customPicture;
    if(customPicture)image.src=customPicture;
    else image.removeAttribute("src");
    $("baliPlaceholderPreviewArt").style.setProperty("--bali-secret-accent",data.accentColor);
    $("baliPlaceholderPreviewFooter").style.backgroundColor=data.backgroundColor;
    $("baliPlaceholderPreviewFooterSubtitle").style.color=data.accentColor;
  }
  function populate(value){
    const data={...defaults,...value};
    fileSerial++;processing=false;localImage="";
    for(const [key,id] of Object.entries(keys))$(id).value=data[key]||defaults[key];
    const src=safeImage(data.imageUrl)?data.imageUrl:"";
    if(src.startsWith("data:image/webp;base64,"))localImage=src;
    url.value=src.startsWith("https://")?src:"";
    file.value="";dirty=false;preview();
  }
  function access(){
    for(const control of form.querySelectorAll("input,button"))control.disabled=!authorized||pending;
    save.disabled=!authorized||!loaded||processing||pending;
  }
  function validate(d){
    for(const [key,max] of Object.entries({
      posterTitle:40,kicker:42,footerTitle:52,footerSubtitle:85
    })){
      if(!d[key]||d[key].length>max)return "Проверьте поле «"+key+"»: до "+max+" символов.";
    }
    if(!safeImage(d.imageUrl))return "Изображение должно быть HTTPS-ссылкой или сжатым WebP.";
    if(!/^#[0-9a-fA-F]{6}$/.test(d.accentColor)||!/^#[0-9a-fA-F]{6}$/.test(d.backgroundColor))
      return "Выберите корректные цвета.";
    return "";
  }
  for(const input of Object.values(keys).map(id=>$(id))){
    input.addEventListener("input",()=>{dirty=true;preview();});
  }
  url.addEventListener("input",()=>{
    ++fileSerial;localImage="";file.value="";
    dirty=true;preview();
  });
  file.addEventListener("change",async()=>{
    const upload=file.files?.[0];if(!upload)return;
    const serial=++fileSerial;processing=true;access();
    say("Подготавливаем квадратную афишу SECRET 1:1…");
    try{
      const data=await compressImage(upload,"design-placeholder");
      if(serial!==fileSerial)return;
      localImage=data;url.value="";dirty=true;preview();
      say("Картинка загружена. Нажмите «Сохранить все заглушки».");
    }catch(error){
      if(serial===fileSerial)say(error.message||"Не удалось обработать изображение.");
    }finally{
      if(serial===fileSerial){processing=false;access();}
    }
  });
  $("baliPlaceholderResetImage").addEventListener("click",()=>{
    fileSerial++;localImage="";file.value="";url.value="";dirty=true;
    preview();say("Чёрный фон SECRET выбран. Сохраните изменения.");
  });
  $("baliPlaceholderRestoreDefaults").addEventListener("click",()=>{
    populate(defaults);dirty=true;access();
    say("Исходные тексты, изображение и цвета восстановлены в форме. Сохраните их.");
  });
  form.addEventListener("submit",async event=>{
    event.preventDefault();
    if(!authorized||!loaded||processing||pending){
      say("Дождитесь загрузки или войдите в аккаунт администратора.");return;
    }
    const values=read(),error=validate(values);
    if(error){say(error);return;}
    pending=true;access();say("Сохраняем общий шаблон…");
    try{
      await setDoc(ref,{...values,updatedAt:serverTimestamp()});
      dirty=false;
      say("Сохранено! Все незанятые места главной ПК теперь используют этот шаблон.");
    }catch(error){
      say(error.code==="permission-denied"
        ?"Нет доступа. Опубликуйте обновлённые firestore.rules в консоли Firebase."
        :"Ошибка сохранения: "+(error.code||error.message));
    }finally{pending=false;access();}
  });
  populate(defaults);access();
  onAuthStateChanged(auth,async user=>{
    const ticket=++authSerial;
    if(unsubscribe){unsubscribe();unsubscribe=null;}
    authorized=false;loaded=false;access();
    if(!user?.emailVerified){say("Для редактирования войдите в подтверждённый аккаунт администратора.");return;}
    try{
      const role=await getDoc(doc(db,"admins",user.uid));
      if(ticket!==authSerial||auth.currentUser?.uid!==user.uid)return;
      if(role.data()?.active!==true){say("Для сохранения нужна активная роль администратора.");return;}
      authorized=true;access();
      unsubscribe=onSnapshot(ref,snapshot=>{
        if(!dirty&&!pending)populate(snapshot.exists()?snapshot.data():defaults);
        loaded=true;access();
        if(!dirty&&!pending)say("Общий шаблон загружен. Изменения доступны к сохранению.");
      },error=>{
        loaded=false;access();
        say(error.code==="permission-denied"
          ?"Опубликуйте обновлённые правила Firestore для settings/homeEventPlaceholder."
          :"Не удалось получить настройки: "+(error.code||error.message));
      });
    }catch(error){
      if(ticket===authSerial)say("Ошибка проверки администратора: "+(error.code||error.message));
    }
  });
}
