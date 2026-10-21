/* BALI v82 — public read-only realtime text and icon overrides.
   The live design preview loads this same file: no fake data or screenshots. */
import {getApp,getApps,initializeApp} from "./bali-public-reader.js?v=20261021-instant-pages1";
import {getFirestore,doc,onSnapshot} from "./bali-public-reader.js?v=20261021-instant-pages1";
const app=getApps().length?getApp():initializeApp(window.BALI_FIREBASE_CONFIG);
const db=getFirestore(app);
const one=s=>document.querySelector(s);
const validIcon=s=>typeof s==="string"&&(
  (s.startsWith("https://")&&s.length<=2048)||
  (s.startsWith("data:image/webp;base64,")&&s.length<=24000));
function label(selector,value){
  const node=one(selector);
  if(node&&typeof value==="string"&&value.trim())node.textContent=value;
}
function preserveButtonChildren(selector,value){
  const node=one(selector);
  if(!node||typeof value!=="string"||!value.trim())return;
  const text=[...node.childNodes].find(n=>n.nodeType===3);
  if(text)text.textContent=value;
  else node.append(document.createTextNode(value));
}
function setIcon(selector,url){
  const host=one(selector);
  if(!host)return;
  const good=validIcon(url);
  let img=host.querySelector(":scope > .bali-custom-upload-icon");
  if(!good){
    img?.remove();host.classList.remove("has-custom-icon");return;
  }
  if(!img){
    img=document.createElement("img");img.className="bali-custom-upload-icon";
    img.alt="";img.decoding="async";
    host.insertBefore(img,host.firstChild);
  }
  if(img.src!==url)img.src=url;
  host.classList.add("has-custom-icon");
}
function apply(data){
  if(!data)return;
  // The original BALI artwork is an image, not an editable text label.
  // Do not append legacy Firestore brandTitle/brandSubtitle to the logo button.
  for(const [key,name] of [
    ["navHomeText","home"],["navCalendarText","events"],
    ["navMenuText","menu"]]){
    preserveButtonChildren('.bali-pc-navigation [data-bali-nav="'+name+'"]',data[key]);
  }
  preserveButtonChildren("#baliPcCartBtn",data.navCartText);
  preserveButtonChildren(".bali-pc-events-title h2 button",data.calendarPreviewTitle);
  label("#eventsHeadingGuest",data.calendarPageTitle);
  label("#baliMenuHeading",data.menuPageTitle);
  label("#menuNavBtn strong",data.menuBannerTitle);
  if(typeof data.menuBannerCta==="string"&&data.menuBannerCta.trim()){
    const node=one("#menuNavBtn .bali-pc-menu-cta");
    if(node)node.textContent=data.menuBannerCta+" →";
  }
  // The desktop contact headings use exactly two normal spaces between
  // words, even when older Firestore settings contain one or many spaces.
  const contactWords=value=>{
    if(typeof value!=="string")return value;
    const clean=value.replace(/[\s\u200B-\u200D\u2060]+/g," ").trim();
    if(clean.toLocaleLowerCase("ru-RU")==="контактная информация")
      return "Контактная  информация";
    return clean.replace(/ /g,"  ");
  };
  label(".bali-pc-sidebar-contacts>.bali-pc-contacts-heading",contactWords(data.contactHeading));
  label(".bali-pc-contact-phone span",data.phoneText);
  label(".bali-pc-contact-location>.bali-pc-contacts-heading",contactWords(data.findHeading));
  const floor=one(".bali-pc-contact-location a>span small");
  if(typeof data.addressFloor==="string"&&data.addressFloor.trim()){
    // The surrounding text needs a separate text node to preserve the small caption.
    const host=one(".bali-pc-contact-location a>span");
    if(host){
      host.textContent="";
      host.append(document.createTextNode(data.addressText||"Минск, ул. Кирова, 13"));
      const small=document.createElement("small");
      small.textContent=data.addressFloor;host.append(small);
    }
  }else if(floor)floor.textContent="3-й этаж · Яндекс Карты ↗";
  const phone=one(".bali-pc-contact-phone");
  const phoneHref=typeof data.phoneHref==="string"&&/^tel:\+?[0-9]{5,22}$/.test(data.phoneHref)
    ?data.phoneHref:"tel:+375296700300";
  if(phone)phone.href=phoneHref;
  const digits=phoneHref.replace(/[^0-9]/g,"");
  const wa=one('[data-bali-contact="whatsapp"]');
  const viber=one('[data-bali-contact="viber"]');
  if(wa)wa.href="https://wa.me/"+digits;
  if(viber)viber.href="viber://chat?number=%2B"+digits;
  // Keep the Telegram conversation separate from the broadcast channel.
  const links=[
    ['[data-bali-contact="telegram-chat"]',"telegramChatUrl"],
    ['[data-bali-contact="telegram-channel"]',"telegramUrl"],
    ['[data-bali-contact="instagram"]',"instagramUrl"],
    [".bali-pc-contact-location a","mapUrl"]
  ];
  for(const [selector,key] of links){
    const node=one(selector);
    if(!node||typeof data[key]!=="string"||!data[key])continue;
    try{
      const url=new URL(data[key]);if(url.protocol==="https:")node.href=url.href;
    }catch{}
  }
  const tiktok=one('[data-bali-contact="tiktok"]');
  const placeholder=one('[data-bali-contact="tiktok-pending"]');
  let tiktokUrl="";
  if(typeof data.tiktokUrl==="string"&&data.tiktokUrl){
    try{
      const parsed=new URL(data.tiktokUrl);
      if(parsed.protocol==="https:"&&/^(www\.)?tiktok\.com$/i.test(parsed.hostname))
        tiktokUrl=parsed.href;
    }catch{}
  }
  if(tiktok){tiktok.hidden=!tiktokUrl;if(tiktokUrl)tiktok.href=tiktokUrl;}
  if(placeholder)placeholder.hidden=!!tiktokUrl;
  const icons=data.icons||{};
  const targets={
    navHome:'.bali-pc-navigation [data-bali-nav="home"] .bali-pc-nav-icon',
    navCalendar:'.bali-pc-navigation [data-bali-nav="events"] .bali-pc-nav-icon',
    navMenu:'.bali-pc-navigation [data-bali-nav="menu"] .bali-pc-nav-icon',
    navCart:'#baliPcCartBtn .bali-pc-nav-icon',
    calendar:'.bali-pc-events-title h2 button',
    menuBanner:'#menuNavBtn .bali-menu-banner-icon',
    phone:'.bali-pc-contact-phone',
    telegram:'.bali-pc-contact-socials a[aria-label*="Telegram"]',
    instagram:'.bali-pc-contact-socials a[aria-label*="Instagram"]',
    map:'.bali-pc-contact-location a'
  };
  for(const [name,selector] of Object.entries(targets)){
    if(typeof icons[name]==="string")setIcon(selector,icons[name]);
  }
  if(typeof icons.telegram==="string")
    setIcon('[data-bali-contact="telegram-chat"]',icons.telegram);
  window.dispatchEvent(new CustomEvent("bali:home-interface",{detail:{saved:true}}));
}
onSnapshot(doc(db,"settings","homeInterface"),snapshot=>{
  if(snapshot.exists())apply(snapshot.data());
},error=>console.warn("BALI home interface: ",error.code||error));
