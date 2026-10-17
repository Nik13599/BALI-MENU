/* BALI PRIVILEGE: published offers rotate independently of event posters. */
import {initializeApp,getApps,getApp} from "https://www.gstatic.com/firebasejs/10.14.1/firebase-app.js";
import {getFirestore,collection,query,where,onSnapshot} from "https://www.gstatic.com/firebasejs/10.14.1/firebase-firestore.js";

const image=document.getElementById("baliPcHeroPoster");
const title=document.getElementById("baliPcOfferTitle");
const description=document.getElementById("baliPcOfferDescription");
const counter=document.getElementById("baliPcHeroCounter");
const action=document.getElementById("baliPcOfferAction");
const hero=document.querySelector(".bali-pc-hero");
const arrows=[...document.querySelectorAll("[data-bali-hero-step]")];
if(image&&title&&description&&counter&&action&&hero){
  const app=getApps().length?getApp():initializeApp(window.BALI_FIREBASE_CONFIG);
  const db=getFirestore(app);
  const collator=new Intl.Collator("ru",{numeric:true,sensitivity:"base"});
  let offers=[],index=0,pause=false;
  const fallbackText="Особые предложения клуба. Скоро здесь появятся новые возможности для гостей.";
  function validOffer(v){
    return typeof v?.title==="string"&&v.title.trim().length>=2&&
      typeof v.description==="string"&&typeof v.imageUrl==="string"&&
      ["none","menu","events","contacts"].includes(v.destination)&&
      typeof v.buttonText==="string"&&Number.isInteger(v.sort)&&v.published===true;
  }
  function show(){
    const offer=offers[index];
    if(!offer){
      image.removeAttribute("src");
      image.alt="";
      title.textContent="BALI PRIVILEGE";
      description.textContent=fallbackText;
      counter.textContent="— / —";
      action.hidden=true;
    }else{
      if(offer.imageUrl.startsWith("https://")){
        image.src=offer.imageUrl;
        image.alt="Иллюстрация к предложению «"+offer.title+"»";
      }else{image.removeAttribute("src");image.alt="";}
      title.textContent=offer.title;
      description.textContent=offer.description;
      counter.textContent=String(index+1).padStart(2,"0")+" / "+String(offers.length).padStart(2,"0");
      action.hidden=offer.destination==="none";
      if(!action.hidden)action.firstChild.textContent=offer.buttonText||"Подробнее ";
    }
    arrows.forEach(button=>{
      button.disabled=offers.length<2;
      button.setAttribute("aria-disabled",String(offers.length<2));
    });
  }
  function advance(step){
    if(offers.length<2)return;
    index=(index+step+offers.length)%offers.length;
    show();
  }
  arrows.forEach(button=>{
    button.addEventListener("click",()=>advance(Number(button.dataset.baliHeroStep)||1));
  });
  action.addEventListener("click",()=>{
    const page=offers[index]?.destination;
    if(!page||page==="none")return;
    document.querySelector('.bali-pc-navigation [data-bali-nav="'+page+'"]')?.click();
  });
  hero.addEventListener("mouseenter",()=>{pause=true;});
  hero.addEventListener("mouseleave",()=>{pause=false;});
  hero.addEventListener("focusin",()=>{pause=true;});
  hero.addEventListener("focusout",()=>{pause=false;});
  window.setInterval(()=>{
    if(!pause&&!document.hidden&&window.matchMedia("(min-width:1180px)").matches
        &&!window.matchMedia("(prefers-reduced-motion:reduce)").matches)advance(1);
  },8000);
  const source=query(collection(db,"promotions"),where("published","==",true));
  onSnapshot(source,snapshot=>{
    const currentId=offers[index]?.id;
    offers=snapshot.docs.map(doc=>({id:doc.id,...doc.data()})).filter(validOffer)
      .sort((a,b)=>a.sort-b.sort||collator.compare(a.title,b.title));
    index=Math.max(0,offers.findIndex(o=>o.id===currentId));
    show();
  },error=>{
    offers=[];index=0;show();
    if(error.code!=="permission-denied")console.warn("BALI offers unavailable:",error.code);
  });
  show();
}
