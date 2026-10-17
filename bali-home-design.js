/* BALI v75 — published About BALI and rotating merchandise cards, read-only. */
import {getApp,getApps,initializeApp} from "https://www.gstatic.com/firebasejs/10.14.1/firebase-app.js";
import {getFirestore,doc,collection,query,where,onSnapshot} from "https://www.gstatic.com/firebasejs/10.14.1/firebase-firestore.js";
const app=getApps().length?getApp():initializeApp(window.BALI_FIREBASE_CONFIG);
const db=getFirestore(app),el=id=>document.getElementById(id);
const validImage=value=>typeof value==="string"&&(
  (value.startsWith("https://")&&value.length<=2048)||
  (value.startsWith("data:image/webp;base64,")&&value.length<=155000));
function setPicture(image,tablet,mobile,base){
  const primary=validImage(base.imageUrl)?base.imageUrl:"";
  const tabletImage=validImage(base.tabletUrl)?base.tabletUrl:primary;
  const mobileImage=validImage(base.mobileUrl)?base.mobileUrl:primary;
  if(image){
    if(primary){image.src=primary;image.hidden=false;}
    else{image.removeAttribute("src");image.hidden=true;}
  }
  if(tablet){if(tabletImage)tablet.srcset=tabletImage;else tablet.removeAttribute("srcset");}
  if(mobile){if(mobileImage)mobile.srcset=mobileImage;else mobile.removeAttribute("srcset");}
}
const aboutImage=el("baliPcAboutImage");
if(aboutImage){
  onSnapshot(doc(db,"settings","homeDesign"),snap=>{
    const v=snap.exists()?snap.data():{};
    if(typeof v.aboutTitle==="string"&&v.aboutTitle.trim())el("baliPcAboutTitle").textContent=v.aboutTitle;
    if(typeof v.aboutSubtitle==="string"&&v.aboutSubtitle.trim())el("baliPcAboutSubtitle").textContent=v.aboutSubtitle;
    if(typeof v.aboutDescription==="string"&&v.aboutDescription.trim())el("baliPcAboutDescription").textContent=v.aboutDescription;
    setPicture(aboutImage,el("baliPcAboutTabletSource"),el("baliPcAboutMobileSource"),{
      imageUrl:v.aboutImageUrl,tabletUrl:v.aboutImageTabletUrl,mobileUrl:v.aboutImageMobileUrl
    });
    document.querySelector(".bali-pc-about")?.classList.toggle("has-photo",validImage(v.aboutImageUrl));
  },error=>{if(error.code!=="permission-denied")console.warn("BALI home About:",error.code);});
}
const merchImage=el("baliPcMerchImage");
if(merchImage){
  const title=el("baliPcMerchTitle"),state=el("baliPcMerchState");
  const description=el("baliPcMerchDescription");
  const counter=el("baliPcMerchCounter"),controls=el("baliPcMerchControls");
  const collator=new Intl.Collator("ru",{numeric:true,sensitivity:"base"});
  const money=new Intl.NumberFormat("ru-RU",{minimumFractionDigits:2,maximumFractionDigits:2});
  let products=[],index=0,paused=false;
  const parent=merchImage.closest(".bali-pc-merch");
  function show(){
    const item=products[index];
    if(!item){
      title.textContent="BALI MERCH";state.textContent="Скоро в продаже";
      description.hidden=true;description.textContent="";
      setPicture(merchImage,el("baliPcMerchTabletSource"),el("baliPcMerchMobileSource"),{});
      controls.hidden=true;return;
    }
    title.textContent=item.name;
    state.textContent=item.status==="available"?money.format(item.price)+" BYN":"Скоро в продаже";
    description.textContent=item.description;description.hidden=!item.description;
    setPicture(merchImage,el("baliPcMerchTabletSource"),el("baliPcMerchMobileSource"),{
      imageUrl:item.imageUrl,tabletUrl:item.imageTabletUrl,mobileUrl:item.imageMobileUrl
    });
    merchImage.alt="Фотография товара "+item.name;
    controls.hidden=products.length<2;
    counter.textContent=String(index+1).padStart(2,"0")+" / "+String(products.length).padStart(2,"0");
    parent?.classList.toggle("has-photo",validImage(item.imageUrl));
  }
  function shift(step){
    if(products.length<2)return;
    index=(index+step+products.length)%products.length;show();
  }
  controls.querySelectorAll("[data-bali-merch-step]").forEach(button=>{
    button.addEventListener("click",()=>shift(Number(button.dataset.baliMerchStep)||1));
  });
  parent?.addEventListener("mouseenter",()=>{paused=true;});
  parent?.addEventListener("mouseleave",()=>{paused=false;});
  parent?.addEventListener("focusin",()=>{paused=true;});
  parent?.addEventListener("focusout",()=>{paused=false;});
  window.setInterval(()=>{
    if(!paused&&!document.hidden&&products.length>1&&
       !window.matchMedia("(prefers-reduced-motion:reduce)").matches)shift(1);
  },7000);
  onSnapshot(query(collection(db,"merch"),where("published","==",true)),snapshot=>{
    const prev=products[index]?.id;
    products=snapshot.docs.map(d=>({id:d.id,...d.data()})).filter(x=>
      typeof x.name==="string"&&typeof x.description==="string"&&
      typeof x.imageUrl==="string"&&["soon","available"].includes(x.status)&&
      typeof x.price==="number"&&Number.isInteger(x.sort)&&x.published===true)
      .sort((a,b)=>a.sort-b.sort||collator.compare(a.name,b.name));
    index=Math.max(0,products.findIndex(x=>x.id===prev));show();
  },error=>{if(error.code!=="permission-denied")console.warn("BALI merch:",error.code);});
  show();
}
