/* BALI — live About card only. BALI ID is provided by its own authenticated module. */
import {getApp,getApps,initializeApp} from "./bali-public-reader.js?v=20261021-fast1";
import {getFirestore,doc,onSnapshot} from "./bali-public-reader.js?v=20261021-fast1";
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
    // Empty Firestore copy is intentional: do not restore hard-coded overlay labels.
    for(const [id,field] of [
      ["baliPcAboutTitle","aboutTitle"],
      ["baliPcAboutSubtitle","aboutSubtitle"],
      ["baliPcAboutDescription","aboutDescription"]
    ]){
      const element=el(id);
      if(!element||typeof v[field]!=="string")continue;
      element.textContent=v[field];
      element.hidden=!v[field].trim();
    }
    setPicture(aboutImage,el("baliPcAboutTabletSource"),el("baliPcAboutMobileSource"),{
      imageUrl:v.aboutImageUrl,tabletUrl:v.aboutImageTabletUrl,mobileUrl:v.aboutImageMobileUrl
    });
    const card=document.querySelector(".bali-pc-about");
    // The redesigned PC preview has two distinct links, not an accordion.
    // Keep the accessible card name and promotional copy independent of art.
    if(card)card.setAttribute("aria-label",(v.aboutTitle?.trim()||"О клубе BALI")+". Площадка для мероприятий и вечеринки.");
    const hasArtwork=validImage(v.aboutImageUrl);
    card?.classList.toggle("has-photo",hasArtwork);
    card?.classList.remove("is-image-only");
  },error=>{if(error.code!=="permission-denied")console.warn("BALI home About:",error.code);});
}
