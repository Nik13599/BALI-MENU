/* BALI visual page builder: published public presentation data only.
   Drafts never load here. Existing site logic remains authoritative. */
import {getApp,getApps,initializeApp} from "https://www.gstatic.com/firebasejs/10.14.1/firebase-app.js";
import {getFirestore,doc,onSnapshot} from "https://www.gstatic.com/firebasejs/10.14.1/firebase-firestore.js";
const core=window.BaliBuilderCore;
if(!core)throw new Error("BALI Builder renderer missing");
const isAdminPreview=new URLSearchParams(location.search).has("bali-admin-design-preview");
if(!isAdminPreview){
 const app=getApps().length?getApp():initializeApp(window.BALI_FIREBASE_CONFIG);
 const db=getFirestore(app);
 let data=null,lastDevice="",busy=false,needs=false;
 const render=()=>{
  if(!data||busy)return;
  busy=true;
  try{core.mount(document,data,core.device(window));lastDevice=core.device(window);}
  finally{busy=false;}
 };
 const schedule=()=>{
  if(needs)return;needs=true;
  requestAnimationFrame(()=>{needs=false;render();});
 };
 onSnapshot(doc(db,"settings","siteBuilderPublished"),snapshot=>{
  data=core.cleanModel(snapshot.exists()?snapshot.data():core.emptyModel());
  schedule();
 },error=>console.warn("BALI published page builder:",error.code||error));
 window.addEventListener("resize",()=>{if(core.device(window)!==lastDevice)schedule();},{passive:true});
 // Reapply when the site's normal page navigation changes displayed content.
 new MutationObserver(mutations=>{
  if(mutations.some(m=>m.attributeName==="data-bali-page"))schedule();
 }).observe(document.body,{attributes:true,attributeFilter:["data-bali-page"]});
}
