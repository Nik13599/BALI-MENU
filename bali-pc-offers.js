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
  const holidayId="bali-new-year-2026";
  const holidayArt="assets/BALI_banner_badge_rectangular_only.png";
  const holidayExtraSpot={left:41,top:55,width:25,height:29};
  const holidayThirdSpot={left:67,top:55,width:27,height:29};
  // The campaign lives in the shipped site until staff replace it with
  // a published Firestore offer. No existing offers are overwritten.
  const holidayOffer={
    id:holidayId,title:"БРОНИРОВАНИЕ НОВОГОДНИХ КОРПОРАТИВОВ",
    description:"Проведите незабываемый праздник в центре Минска. Выберите дату заранее.",
    imageUrl:"",imageTabletUrl:"",imageMobileUrl:"",
    destination:"contact-modal",buttonText:"Забронировать заранее",
    contactTitle:"Забронировать новогодний корпоратив",
    contactLinks:{},contactEnabled:{phone:true,telegram:true,instagram:true,whatsapp:true,viber:true},
    contactHotspot:{enabled:true,left:4,top:69,width:30,height:17},
    sort:-1,published:true
  };
  let offers=[holidayOffer],index=0,pause=false,activeHotspot=null,activeSecondarySpot=null,activeThirdSpot=null;
  let previewOffer=null;
  const slideIntervalMs=15000;
  let lastInteraction=Date.now(),gesture=null,suppressGestureClick=false;
  const artHotspot=document.createElement("button");
  artHotspot.type="button";
  artHotspot.className="bali-pc-artwork-hotspot";
  artHotspot.hidden=true;
  hero.append(artHotspot);
  artHotspot.addEventListener("click",()=>action.click());
  const secondaryHotspot=document.createElement("button");
  secondaryHotspot.type="button";
  secondaryHotspot.className="bali-pc-artwork-hotspot bali-pc-artwork-hotspot-secondary";
  secondaryHotspot.hidden=true;
  secondaryHotspot.setAttribute("aria-label","Связаться с BALI для новогоднего корпоратива");
  hero.append(secondaryHotspot);
  secondaryHotspot.addEventListener("click",()=>action.click());
  const thirdHotspot=document.createElement("button");
  thirdHotspot.type="button";
  thirdHotspot.className="bali-pc-artwork-hotspot bali-pc-artwork-hotspot-third";
  thirdHotspot.hidden=true;
  thirdHotspot.setAttribute("aria-label","Совместный новогодний корпоратив — забронировать заранее");
  hero.append(thirdHotspot);
  thirdHotspot.addEventListener("click",()=>action.click());
  function positionHotspot(){
    if(!activeHotspot||artHotspot.hidden)return;
    const h=hero.getBoundingClientRect(),box=image.getBoundingClientRect();
    const imgW=image.naturalWidth||box.width,imgH=image.naturalHeight||box.height;
    if(!imgW||!imgH||!box.width||!box.height)return;
    const style=getComputedStyle(image);
    const ratio=(style.objectFit==="cover"?Math.max:Math.min)(box.width/imgW,box.height/imgH);
    const drawW=imgW*ratio,drawH=imgH*ratio;
    // On a narrow phone the approved artwork uses left-aligned cover cropping.
    // On desktop/tablet it remains the original uncropped, centered image.
    const coverLeft=hero.classList.contains("is-seasonal")&&window.matchMedia("(max-width:767px)").matches;
    const x=box.left-h.left+(coverLeft?0:(box.width-drawW)/2),y=box.top-h.top+(box.height-drawH)/2;
    for(const [button,spot] of [[artHotspot,activeHotspot],[secondaryHotspot,activeSecondarySpot],[thirdHotspot,activeThirdSpot]]){
      if(!spot||button.hidden)continue;
      button.style.left=(x+drawW*spot.left/100)+"px";
      button.style.top=(y+drawH*spot.top/100)+"px";
      button.style.width=(drawW*spot.width/100)+"px";
      button.style.height=(drawH*spot.height/100)+"px";
    }
  }
  image.addEventListener("load",positionHotspot);
  window.addEventListener("resize",positionHotspot);
  if(typeof ResizeObserver!=="undefined")new ResizeObserver(positionHotspot).observe(hero);
  const fallbackText="Особые предложения клуба. Скоро здесь появятся новые возможности для гостей.";
  const validImage=value=>typeof value==="string"&&
    ((value.startsWith("https://")&&value.length<=2048)||
     (value.startsWith("data:image/webp;base64,")&&value.length<=155000));
  function setPoster(offer){
    // Keep the approved PNG as fallback; let a published holiday offer replace it.
    const primary=validImage(offer?.imageUrl)?offer.imageUrl:(offer?.id===holidayId?holidayArt:"");
    const tablet=validImage(offer?.imageTabletUrl)?offer.imageTabletUrl:primary;
    const mobile=validImage(offer?.imageMobileUrl)?offer.imageMobileUrl:primary;
    image.hidden=!primary;
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
      ["none","menu","events","contacts","contact-modal"].includes(v.destination)&&
      typeof v.buttonText==="string"&&Number.isInteger(v.sort)&&v.published===true;
  }
  function show(){
    const stored=offers[index];
    const offer=previewOffer?.id===stored?.id?previewOffer:stored;
    // Identifies the active slide to the administrator’s live visual editor.
    hero.dataset.baliOfferId=offer?.id||"";
    hero.dataset.baliManagedPromo="true";
    hero.dataset.baliCarouselCount=String(offers.length);
    hero.dataset.baliCarouselInterval=String(slideIntervalMs);
    if(!offer){
      hero.classList.remove("is-seasonal","is-composed");
      hero.removeAttribute("aria-label");
      setPoster(null);
      title.textContent="BALI PRIVILEGE";
      title.hidden=false;
      description.textContent=fallbackText;
      description.hidden=false;
      hero.classList.remove("has-artwork","is-image-only","has-no-action");
      counter.textContent="— / —";
      action.hidden=true;
      artHotspot.hidden=true;secondaryHotspot.hidden=true;thirdHotspot.hidden=true;activeHotspot=null;activeSecondarySpot=null;activeThirdSpot=null;
    }else{
      const seasonal=offer.id===holidayId;
      const layer=offer.overlay&&offer.overlay.enabled===true;
      hero.classList.toggle("is-seasonal",seasonal);
      hero.classList.toggle("is-composed",layer);
      const safeColor=x=>typeof x==="string"&&/^#[0-9a-fA-F]{6}$/.test(x)?x:null;
      const safeSize=(x,min,max,fallback)=>Number.isInteger(x)&&x>=min&&x<=max?x:fallback;
      hero.style.setProperty("--bali-promo-title-size",safeSize(offer.overlay?.fontSize,12,80,38)+"px");
      hero.style.setProperty("--bali-promo-title-color",safeColor(offer.overlay?.textColor)||"#ffffff");
      hero.style.setProperty("--bali-promo-button-bg",safeColor(offer.overlay?.buttonBackground)||"#c3f36d");
      hero.style.setProperty("--bali-promo-button-color",safeColor(offer.overlay?.buttonColor)||"#111810");
      hero.style.setProperty("--bali-promo-button-radius",safeSize(offer.overlay?.buttonRadius,0,48,10)+"px");
      hero.dataset.baliPromoAlign=["left","center","right"].includes(offer.overlay?.align)?offer.overlay.align:"left";
      hero.setAttribute("aria-label",seasonal?"Бронирование новогодних корпоративов BALI":"Специальное предложение BALI");
      const kicker=hero.querySelector(".bali-pc-kicker");
      if(kicker)kicker.textContent=seasonal?"НОВЫЙ ГОД · BALI":"BALI NIGHT CLUB";
      setPoster(offer);
      const hasArtwork=seasonal||validImage(offer.imageUrl);
      title.textContent=offer.title;
      title.hidden=(!layer&&seasonal)||!offer.title.trim();
      description.textContent=offer.description;
      description.hidden=layer||seasonal||!offer.description.trim();
      hero.classList.toggle("has-artwork",hasArtwork);
      hero.classList.toggle("is-image-only",hasArtwork&&!offer.title.trim()&&!offer.description.trim());
      hero.classList.toggle("has-no-action",offer.destination==="none");
      counter.textContent=String(index+1).padStart(2,"0")+" / "+String(offers.length).padStart(2,"0");
      const spot=offer.contactHotspot;
      activeHotspot=!layer&&hasArtwork&&offer.destination==="contact-modal"&&spot?.enabled===true
        &&["left","top","width","height"].every(k=>Number.isInteger(spot[k]))
        &&spot.left>=0&&spot.top>=0&&spot.width>=1&&spot.height>=1
        &&spot.left+spot.width<=100&&spot.top+spot.height<=100?spot:null;
      activeSecondarySpot=seasonal&&!layer?holidayExtraSpot:null;
      activeThirdSpot=seasonal&&!layer?holidayThirdSpot:null;
      artHotspot.hidden=!activeHotspot;
      secondaryHotspot.hidden=!activeSecondarySpot;
      thirdHotspot.hidden=!activeThirdSpot;
      artHotspot.setAttribute("aria-label",offer.buttonText||"Связаться с менеджером BALI");
      // Keep a readable real CTA on mobile seasonal artwork; desktop uses the
      // invisible clickable regions drawn over the original three tile areas.
      action.hidden=offer.destination==="none"||(!layer&&!seasonal&&!!activeHotspot);
      if(!action.hidden)action.firstChild.textContent=offer.buttonText||"Подробнее ";
      if(activeHotspot)positionHotspot();
    }
    const slideControls=hero.querySelector(".bali-pc-hero-controls");
    if(slideControls)slideControls.hidden=offers.length<2;
    arrows.forEach(button=>{
      button.disabled=offers.length<2;
      button.setAttribute("aria-disabled",String(offers.length<2));
    });
  }
  function advance(step,manual=false){
    if(offers.length<2)return;
    if(manual)lastInteraction=Date.now();
    index=(index+step+offers.length)%offers.length;
    show();
  }
  arrows.forEach(button=>{
    button.addEventListener("click",()=>advance(Number(button.dataset.baliHeroStep)||1,true));
  });
  action.addEventListener("click",()=>{
    const page=offers[index]?.destination;
    if(!page||page==="none")return;
    if(page==="contact-modal"){
      window.dispatchEvent(new CustomEvent("bali:promo-contacts",{detail:{offer:offers[index]}}));
      return;
    }
    document.querySelector('.bali-pc-navigation [data-bali-nav="'+page+'"]')?.click();
  });
  // Horizontal swipe works on phones/tablets and mouse drag on the desktop.
  // Do not interfere with vertical scrolling, short clicks or contact hotspots.
  hero.addEventListener("pointerdown",event=>{
    if(event.pointerType==="mouse"&&event.button!==0)return;
    gesture={id:event.pointerId,x:event.clientX,y:event.clientY,dragged:false};
  });
  hero.addEventListener("pointermove",event=>{
    if(!gesture||gesture.id!==event.pointerId)return;
    const dx=event.clientX-gesture.x,dy=event.clientY-gesture.y;
    if(!gesture.dragged&&Math.abs(dx)>14&&Math.abs(dx)>Math.abs(dy)*1.25){
      gesture.dragged=true;
      try{hero.setPointerCapture(event.pointerId);}catch{}
    }
    if(gesture.dragged&&event.cancelable)event.preventDefault();
  });
  hero.addEventListener("pointerup",event=>{
    if(!gesture||gesture.id!==event.pointerId)return;
    const dx=event.clientX-gesture.x,dy=event.clientY-gesture.y;
    if(gesture.dragged&&Math.abs(dx)>44&&Math.abs(dx)>Math.abs(dy)){
      suppressGestureClick=true;
      advance(dx<0?1:-1,true);
      window.setTimeout(()=>{suppressGestureClick=false;},0);
    }
    gesture=null;
  });
  hero.addEventListener("pointercancel",()=>{gesture=null;});
  hero.addEventListener("click",event=>{
    if(suppressGestureClick){
      event.preventDefault();event.stopImmediatePropagation();suppressGestureClick=false;
    }
  },true);
  hero.addEventListener("mouseenter",()=>{pause=true;});
  hero.addEventListener("mouseleave",()=>{pause=false;});
  hero.addEventListener("focusin",()=>{pause=true;});
  hero.addEventListener("focusout",()=>{pause=false;});
  window.setInterval(()=>{
    if(offers.length>1&&!pause&&!document.hidden
        &&Date.now()-lastInteraction>=slideIntervalMs
        &&!window.matchMedia("(prefers-reduced-motion:reduce)").matches)advance(1);
  },slideIntervalMs);
  // Preview is confined to the administrator iframe and never writes guest data.
  window.addEventListener("bali:promo-preview",event=>{
    if(!new URLSearchParams(window.location.search).has("bali-admin-design-preview"))return;
    const candidate=event.detail?.offer;
    previewOffer=candidate&&candidate.id===offers[index]?.id?candidate:null;
    show();
  });
  const source=query(collection(db,"promotions"),where("published","==",true));
  onSnapshot(source,snapshot=>{
    const currentId=offers[index]?.id;
    const published=snapshot.docs.map(doc=>({id:doc.id,...doc.data()})).filter(validOffer);
    const overridden=published.some(o=>o.id===holidayId||/новогодн/i.test(o.title));
    offers=[...(overridden?[]:[holidayOffer]),...published]
      .sort((a,b)=>a.sort-b.sort||collator.compare(a.title,b.title));
    index=Math.max(0,offers.findIndex(o=>o.id===currentId));
    show();
  },error=>{
    offers=[holidayOffer];index=0;show();
    if(error.code!=="permission-denied")console.warn("BALI offers unavailable:",error.code);
  });
  show();
}
