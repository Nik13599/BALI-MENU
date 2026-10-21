/* BALI v82 — verified-admin editor for the actual website's labels,
   contact buttons and uploaded button icons. Realtime Firestore persistence. */
import {getApp,getApps,initializeApp} from "https://www.gstatic.com/firebasejs/10.14.1/firebase-app.js";
import {getAuth,onAuthStateChanged} from "https://www.gstatic.com/firebasejs/10.14.1/firebase-auth.js";
import {getFirestore,doc,getDoc,onSnapshot,setDoc,serverTimestamp} from "https://www.gstatic.com/firebasejs/10.14.1/firebase-firestore.js";
import {prepareImage as compressImage} from "./image-compressor.js?v=20261020-2";

const el=id=>document.getElementById(id);
const host=el("adminDesignPanel");
if(host){
  const config={
    brandTitle:"B A L I",brandSubtitle:"NIGHT CLUB",
    navHomeText:"ГЛАВНАЯ",navCalendarText:"КАЛЕНДАРЬ",navMenuText:"МЕНЮ",navCartText:"КОРЗИНА",
    calendarPreviewTitle:"BALI календарь",calendarPageTitle:"BALI КАЛЕНДАРЬ",
    menuPageTitle:"BALI МЕНЮ",menuBannerTitle:"Меню",menuBannerCta:"Посмотреть меню",
    contactHeading:"Контактная информация",phoneText:"+375 29 670-03-00",
    phoneHref:"tel:+375296700300",telegramChatUrl:"https://t.me/BALI_MINSK",
    telegramUrl:"https://t.me/baliclubminsk",tiktokUrl:"",
    instagramUrl:"https://www.instagram.com/baliminsk/",
    findHeading:"Как нас найти",addressText:"Минск, ул. Кирова, 13",
    addressFloor:"3-й этаж · Яндекс Карты ↗",
    mapUrl:"https://yandex.by/maps/org/bali_night_club/104137822369/"
  };
  const iconTypes={
    navigation:[["navHome","Значок «Главная»"],["navCalendar","Значок «Календарь»"],
      ["navMenu","Значок «Меню»"],["navCart","Значок «Корзина»"]],
    calendar:[["calendar","Значок календаря"]],
    menuBanner:[["menuBanner","Значок большой кнопки меню"]],
    contacts:[["phone","Значок телефона"],["telegram","Значок Telegram"],
      ["instagram","Значок Instagram"],["map","Значок карты"]]
  };
  const iconNames=Object.values(iconTypes).flat().map(entry=>entry[0]);
  const maxLengths={
    brandTitle:32,brandSubtitle:35,navHomeText:30,navCalendarText:30,
    navMenuText:30,navCartText:30,calendarPreviewTitle:55,calendarPageTitle:55,
    menuPageTitle:55,menuBannerTitle:45,menuBannerCta:65,contactHeading:55,phoneText:32,
    phoneHref:48,telegramChatUrl:250,telegramUrl:250,instagramUrl:250,tiktokUrl:250,findHeading:50,
    addressText:110,addressFloor:80,mapUrl:300
  };
  const copyInputs=[...host.querySelectorAll("[data-site-field]")];
  const forms=[...host.querySelectorAll("[data-studio-copy-form]")];
  const controls={};
  let authorized=false,pending=false,unsub=null,serial=0,loaded=false;
  const app=getApps().length?getApp():initializeApp(window.BALI_FIREBASE_CONFIG);
  const db=getFirestore(app),auth=getAuth(app),ref=doc(db,"settings","homeInterface");
  const safeIcon=s=>typeof s==="string"&&
    (s===""||(s.startsWith("https://")&&s.length<=2048)||
      (s.startsWith("data:image/webp;base64,")&&s.length<=24000));
  const statuses=()=>host.querySelectorAll("[data-studio-save-status]");
  function report(message){for(const target of statuses())target.textContent=message;}
  function make(tag,cls,text){
    const node=document.createElement(tag);
    if(cls)node.className=cls;
    if(text!==undefined)node.textContent=text;
    return node;
  }
  function makeIcon(slot,name,title){
    const group=make("div","bali-studio-icon-field");
    const titleEl=make("strong","",title+" · 128×128 px");
    const preview=make("div","bali-studio-icon-preview","Стандартный значок");
    const input=make("input");
    input.type="file";input.accept="image/png,image/jpeg,image/webp,image/heic,image/heif";
    input.setAttribute("aria-label","Загрузить "+title);
    const browse=make("label","bali-studio-icon-picker");
    browse.append(make("span","","Загрузить изображение"),input);
    const url=make("input");url.type="url";url.placeholder="Или HTTPS-ссылка";
    url.maxLength=2048;url.setAttribute("aria-label",title+": HTTPS-ссылка");
    const remove=make("button","","Вернуть стандартный значок");
    remove.type="button";
    group.append(titleEl,preview,browse,url,remove);
    slot.append(group);
    let local="",busy=false,sequence=0;
    const display=value=>{
      preview.replaceChildren();
      if(value&&safeIcon(value)){
        const img=make("img");img.src=value;img.alt=title;preview.append(img);
      }else preview.append(make("span","","Стандартный значок"));
    };
    function set(value=""){
      sequence++;local="";busy=false;
      url.value=value.startsWith("https://")?value:"";
      local=value.startsWith("data:image/webp;base64,")?value:"";
      input.value="";display(value);
    }
    input.addEventListener("change",async()=>{
      const file=input.files?.[0];if(!file)return;
      const requested=++sequence;busy=true;
      report("Подготавливаем значок "+title+"…");
      try{
        const image=await compressImage(file,"design-icon");
        if(requested!==sequence)return;
        local=image;url.value="";display(image);report("Значок подготовлен. Нажмите «Сохранить».");
      }catch(error){if(requested===sequence)report(error.message||"Не удалось обработать значок.");}
      finally{if(requested===sequence)busy=false;}
    });
    url.addEventListener("input",()=>{sequence++;busy=false;local="";input.value="";display(url.value.trim());});
    remove.addEventListener("click",()=>{set("");report("Стандартный значок восстановлен в форме. Сохраните изменение.");});
    controls[name]={set,get:()=>local||url.value.trim(),busy:()=>busy,inputs:[input,url,remove]};
    set("");
  }
  for(const [section,iconData] of Object.entries(iconTypes)){
    const slot=host.querySelector('[data-studio-icons="'+section+'"]');
    if(!slot)continue;
    slot.classList.add("bali-studio-icons");
    for(const [name,title] of iconData)makeIcon(slot,name,title);
  }
  function lock(){
    for(const input of copyInputs)input.disabled=!authorized||pending;
    for(const icon of Object.values(controls)){
      for(const input of icon.inputs)input.disabled=!authorized||pending;
    }
    for(const form of forms)form.querySelector('button[type="submit"]').disabled=!authorized||pending||!loaded;
  }
  function read(){
    const next={};
    for(const input of copyInputs)next[input.dataset.siteField]=input.value.trim();
    const icons={};
    for(const name of iconNames)icons[name]=controls[name]?.get()||"";
    return {...next,icons};
  }
  function validate(d){
    for(const [key,max] of Object.entries(maxLengths)){
      if(typeof d[key]!=="string"||(key!=="tiktokUrl"&&d[key].length<1)||d[key].length>max){
        return "Проверьте поле: "+key+" (от 1 до "+max+" символов).";
      }
    }
    if(!/^tel:\+?[0-9]{5,22}$/.test(d.phoneHref))
      return "Телефонная ссылка должна иметь вид tel:+375296700300.";
    for(const key of ["telegramChatUrl","telegramUrl","instagramUrl","mapUrl","tiktokUrl"]){
      if(key==="tiktokUrl"&&!d[key])continue;
      try{const url=new URL(d[key]);if(url.protocol!=="https:")return "Для "+key+" нужна HTTPS-ссылка.";}
      catch{return "Неверная ссылка: "+key;}
    }
    if(d.tiktokUrl){
      try{
        const profile=new URL(d.tiktokUrl);
        if(!/^(www\.)?tiktok\.com$/i.test(profile.hostname))
          return "Укажите ссылку на профиль tiktok.com, а не на другой сайт.";
      }catch{return "Неверная ссылка TikTok.";}
    }
    for(const name of iconNames)if(!safeIcon(d.icons[name]))return "Некорректная картинка значка: "+name;
    return "";
  }
  function populate(raw){
    const values=raw||{};
    for(const input of copyInputs){
      const key=input.dataset.siteField;
      input.value=typeof values[key]==="string"?values[key]:config[key];
    }
    for(const name of iconNames)controls[name]?.set(values.icons?.[name]||"");
  }
  for(const form of forms){
    form.addEventListener("submit",async event=>{
      event.preventDefault();
      if(!authorized||pending||!loaded)return report("Проверьте вход администратора и загрузку настроек.");
      if(Object.values(controls).some(icon=>icon.busy()))return report("Дождитесь обработки всех значков.");
      const payload=read(),error=validate(payload);
      if(error)return report(error);
      pending=true;lock();report("Сохраняем оформление сайта…");
      try{
        await setDoc(ref,{...payload,updatedAt:serverTimestamp()});
        window.BaliPublicPublish?.queue("settings/homeInterface");
        report("Сохранено. Живой сайт и его схема обновляются автоматически.");
      }catch(err){
        report(err.code==="permission-denied"
          ?"Нет доступа. Необходимо опубликовать актуальные firestore.rules в Firebase Console."
          :"Не удалось сохранить: "+(err.code||"неизвестная ошибка"));
      }finally{pending=false;lock();}
    });
  }
  onAuthStateChanged(auth,async user=>{
    const id=++serial;
    authorized=false;loaded=false;if(unsub)unsub();unsub=null;lock();
    if(!user?.emailVerified){report("Войдите в подтверждённый аккаунт администратора.");return;}
    try{
      const role=await getDoc(doc(db,"admins",user.uid));
      if(id!==serial||user.uid!==auth.currentUser?.uid)return;
      if(role.data()?.active!==true){report("Для редактирования нужна активная роль администратора.");return;}
      authorized=true;lock();
      unsub=onSnapshot(ref,snapshot=>{
        if(!pending)populate(snapshot.exists()?snapshot.data():config);
        loaded=true;lock();if(!pending)report("Редактирование доступно. Сохранённые данные синхронизированы.");
      },error=>{
        loaded=false;lock();report(error.code==="permission-denied"
          ?"Опубликуйте обновлённые правила Firestore для settings/homeInterface."
          :"Не удалось получить настройки: "+(error.code||"ошибка"));
      });
    }catch(error){if(id===serial)report("Не удалось проверить права администратора: "+(error.code||"ошибка"));}
  });
  populate(config);lock();
}
