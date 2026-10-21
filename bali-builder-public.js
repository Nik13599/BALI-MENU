/* BALI visual page builder: published public presentation data only.
   Drafts never load here. Existing site logic remains authoritative. */
import {getApp,getApps,initializeApp} from "./bali-public-reader.js?v=20261021-instant-pages2";
import {getFirestore,doc,onSnapshot} from "./bali-public-reader.js?v=20261021-instant-pages2";
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
  try{
   const view=core.device(window);
   core.mount(document,data,view);
   const nested=document.querySelector("#baliAboutFrame");
   let aboutDoc=null;
   try{aboutDoc=nested?.contentDocument;}catch{}
   if(aboutDoc?.body)core.mount(aboutDoc,data,view,{scope:"about"});
   lastDevice=view;
  }finally{busy=false;}
 };
 const schedule=()=>{
  if(needs)return;needs=true;
  requestAnimationFrame(()=>{needs=false;render();});
 };
 onSnapshot(doc(db,"settings","siteBuilderPublished"),snapshot=>{
  data=core.cleanModel(snapshot.exists()?snapshot.data():core.emptyModel());
  schedule();
 },error=>console.warn("BALI published page builder:",error.code||error));
 const aboutFrame=document.getElementById("baliAboutFrame");
 aboutFrame?.addEventListener("load",schedule);
 window.addEventListener("resize",()=>{if(core.device(window)!==lastDevice)schedule();},{passive:true});
 for(const eventName of ["bali:home-interface","bali:menu-mode-changed","bali:events-updated"]){
  window.addEventListener(eventName,()=>schedule());
 }
 // Reapply when the site's normal page navigation changes displayed content.
 new MutationObserver(mutations=>{
  if(mutations.some(m=>m.attributeName==="data-bali-page"))schedule();
 }).observe(document.body,{attributes:true,attributeFilter:["data-bali-page"]});
}
