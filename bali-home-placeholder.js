/* Shared public homepage-only event placeholder template.
   A single administrator-authored document controls ALL empty PC-home slots. */
import {getApp,getApps,initializeApp} from "./bali-public-reader.js?v=20261021-live-content1";
import {getFirestore,doc,onSnapshot} from "./bali-public-reader.js?v=20261021-live-content1";
export const BALI_PLACEHOLDER_DEFAULTS=Object.freeze({
  posterTitle:"SECRET",kicker:"SECRET",
  footerTitle:"СКОРО В BALI",footerSubtitle:"Совсем скоро узнаете",
  imageUrl:"",accentColor:"#b9ff51",backgroundColor:"#12171c"
});
const defaults=BALI_PLACEHOLDER_DEFAULTS;
const safeImage=x=>x===""||(
  typeof x==="string"&&(
    (x.startsWith("https://")&&x.length<=2048)||
    (x.startsWith("data:image/webp;base64,")&&x.length<=120000)
  )
);
const validColor=x=>typeof x==="string"&&/^#[0-9a-fA-F]{6}$/.test(x);
function normalize(data){
  const result={...defaults};
  if(!data||typeof data!=="object")return result;
  for(const [key,limit] of Object.entries({
    posterTitle:40,kicker:42,footerTitle:52,footerSubtitle:85
  })){
    const v=data[key];
    if(typeof v==="string"&&v.trim()&&v.length<=limit)result[key]=v.trim();
  }
  if(safeImage(data.imageUrl))result.imageUrl=data.imageUrl;
  for(const key of ["accentColor","backgroundColor"]){
    if(validColor(data[key]))result[key]=data[key];
  }
  return result;
}
function publish(data){
  window.BaliHomePlaceholder=normalize(data);
  window.dispatchEvent(new CustomEvent("bali:home-placeholder"));
}
publish(defaults);
const app=getApps().length?getApp():initializeApp(window.BALI_FIREBASE_CONFIG);
const db=getFirestore(app);
onSnapshot(doc(db,"settings","homeEventPlaceholder"),snapshot=>{
  publish(snapshot.exists()?snapshot.data():defaults);
},error=>{
  // If new rules haven't been deployed yet, fall back to the built-in art.
  console.warn("BALI shared event placeholder:",error.code||error);
});
