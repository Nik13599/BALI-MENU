/* BALI guest-only menu visibility through the public Cloudflare snapshot.
 * The admin editor continues using authenticated Firestore writes.
 */
import {getApp,getApps,initializeApp,getFirestore,doc,onSnapshot}
  from "./bali-public-reader.js?v=20261022-menuvisibility1";
const app=getApps().length?getApp():initializeApp(window.BALI_FIREBASE_CONFIG);
const db=getFirestore(app);
const keys=["kitchen","bar","hookah","tea"];
const allVisible=()=>({kitchen:true,bar:true,hookah:true,tea:true});
function fromDoc(data){
  const sections=data?.sections;
  if(!sections||typeof sections!=="object"||
    !keys.every(k=>typeof sections[k]==="boolean"))return allVisible();
  return Object.fromEntries(keys.map(k=>[k,sections[k]]));
}
function publish(state){
  window.BaliMenuVisibility={...state};
  window.dispatchEvent(new CustomEvent("bali:menu-visibility",{detail:{...state}}));
}
onSnapshot(doc(db,"settings","menuVisibility"),snapshot=>{
  publish(fromDoc(snapshot.exists()?snapshot.data():null));
},error=>{
  // Preserve all guest sections on transient Cloudflare or Firebase outages.
  publish(allVisible());
  console.warn("BALI public menu visibility unavailable:",error?.code||"unavailable");
});
