/* BALI PRIVILEGE: published offers rotate independently of event posters. */
import {initializeApp,getApps,getApp} from "https://www.gstatic.com/firebasejs/10.14.1/firebase-app.js";
import {getFirestore,collection,query,where,onSnapshot} from "https://www.gstatic.com/firebasejs/10.14.1/firebase-firestore.js";

const image=document.getElementById("baliPcHeroPoster");
const tabletSource=document.getElementById("baliPcHeroTabletSource");
const mobileSource=document.getElementById("baliPcHeroMobileSource");
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
  const validImage=value=>typeof value==="string"&&
    ((value.startsWith("https://")&&value.length<=2048)||
     (value.startsWith("data:image/webp;base64,")&&value.length<=155000));
  function setPoster(offer){
    const primary=validImage(offer?.imageUrl)?offer.imageUrl:"";
    const tablet=validImage(offer?.imageTabletUrl)?offer.imageTabletUrl:primary;
    const mobile=validImage(offer?.imageMobileUrl)?offer.imageMobileUrl:primary;
    if(primary){
      image.src=primary;image.alt=offer?.title?"Иллюстрация к предложению «"+offer.title+"»":"Баннер BALI PRIVILEGE";
    }else{image.removeAttribute("src");image.alt="";}
    if(tabletSource){
      if(tablet)tabletSource.srcset=tablet;
      else tabletSource.removeAttribute("srcset");
    }
    if(mobileSource){
      if(mobile)mobileSource.srcset=mobile;
      else mobileSource.removeAttribute("srcset");
    }
  }
  function validOffer(v){
    return typeof v?.title==="string"&&(v.title.trim().length===0||v.title.trim().length>=2)&&
      typeof v.description==="string"&&typeof v.imageUrl==="string"&&
      ["none","menu","events","contacts"].includes(v.destination)&&
      typeof v.buttonText==="string"&&Number.isInteger(v.sort)&&v.published===true;
  }
  function show(){
    const offer=offers[index];
    if(!offer){
      setPoster(null);
      title.textContent="BALI PRIVILEGE";
      title.hidden=false;
      description.textContent=fallbackText;
      description.hidden=false;
      hero.classList.remove("has-artwork","is-image-only","has-no-action");
      counter.textContent="— / —";
      action.hidden=true;
    }else{
      setPoster(offer);
      const hasArtwork=validImage(offer.imageUrl);
      title.textContent=offer.title;
      title.hidden=!offer.title.trim();
      description.textContent=offer.description;
      description.hidden=!offer.description.trim();
      hero.classList.toggle("has-artwork",hasArtwork);
      hero.classList.toggle("is-image-only",hasArtwork&&!offer.title.trim()&&!offer.description.trim());
      hero.classList.toggle("has-no-action",offer.destination==="none");
      counter.textContent=String(index+1).padStart(2,"0")+" / "+String(offers.length).padStart(2,"0");
      action.hidden=offer.destination==="none";
      if(!action.hidden)action.firstChild.textContent=offer.buttonText||"Подробнее ";
    }
    const slideControls=hero.querySelector(".bali-pc-hero-controls");
    if(slideControls)slideControls.hidden=offers.length<2;
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
