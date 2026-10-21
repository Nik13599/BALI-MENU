/* BALI mobile homepage: published background photos from staff only.
 * Read-only Firestore query; no user upload, no background for PC.
 * A single photo is static; a gallery gently cycles in mobile view.
 */
import {getApp,getApps,initializeApp} from "./bali-public-reader.js?v=20261021-instant-pages1";
import {getFirestore,collection,query,where,onSnapshot} from "./bali-public-reader.js?v=20261021-instant-pages1";
const root=document.querySelector(".bali-mobile-home-hero");
const a=document.getElementById("baliMobileAboutBackgroundA");
const b=document.getElementById("baliMobileAboutBackgroundB");
const indicators=document.getElementById("baliMobileAboutBackgroundDots");
if(root&&a&&b&&indicators){
  const app=getApps().length?getApp():initializeApp(window.BALI_FIREBASE_CONFIG);
  const db=getFirestore(app);
  const media=window.matchMedia("(max-width:767px)");
  const calm=window.matchMedia("(prefers-reduced-motion:reduce)");
  const validUrl=x=>typeof x==="string"&&(
    /^https:\/\/[^\s"']{1,2048}$/.test(x)||
    /^data:image\/webp;base64,[A-Za-z0-9+/=]{1,124950}$/.test(x));
  let photos=[],current=-1,active=a,other=b,interval=null;
  function stop(){if(interval)clearInterval(interval);interval=null;}
  function reset(){
    stop();photos=[];current=-1;
    for(const image of [a,b]){image.classList.remove("is-active");image.removeAttribute("src");}
    active=a;other=b;
    indicators.hidden=true;
    indicators.replaceChildren();
  }
  function show(index){
    if(!photos.length)return;
    const n=(index+photos.length)%photos.length;
    if(n===current&&active.hasAttribute("src"))return;
    const first=current<0;
    const next=first?active:other;
    next.src=photos[n].imageUrl;
    next.classList.add("is-active");
    if(!first){
      active.classList.remove("is-active");
      [active,other]=[next,active];
    }
    current=n;
    for(const [i,button] of [...indicators.children].entries()){
      button.setAttribute("aria-pressed",String(i===current));
    }
  }
  function restart(){
    stop();
    if(photos.length<2||calm.matches||!media.matches||document.hidden)return;
    interval=setInterval(()=>{
      if(!document.hidden&&media.matches)show(current+1);
    },8500);
  }
  function setItems(snapshot){
    const previous=photos[current]?.id;
    const list=snapshot.docs.map(doc=>({id:doc.id,...doc.data()}))
      .filter(item=>item.published===true&&validUrl(item.imageUrl)&&
        Number.isInteger(item.sort)&&item.sort>=0&&item.sort<=100000)
      .sort((x,y)=>x.sort-y.sort||x.id.localeCompare(y.id))
      .slice(0,8);
    reset();
    photos=list;
    if(!list.length)return; // fall back to premium CSS gradient
    for(let i=0;i<list.length;i++){
      const button=document.createElement("button");
      button.type="button";
      button.setAttribute("aria-label","Показать фон "+(i+1)+" из "+list.length);
      button.setAttribute("aria-pressed","false");
      button.addEventListener("click",()=>{show(i);restart();});
      indicators.append(button);
    }
    indicators.hidden=list.length<2;
    const original=Math.max(0,list.findIndex(item=>item.id===previous));
    show(original);restart();
  }
  onSnapshot(query(collection(db,"mobileAboutBackgrounds"),where("published","==",true)),
    setItems,error=>{
      // A missing rules deployment leaves the original styled banner intact.
      if(error.code!=="permission-denied")console.warn("BALI mobile About backgrounds:",error.code);
      reset();
    });
  document.addEventListener("visibilitychange",restart);
  media.addEventListener?.("change",restart);
  calm.addEventListener?.("change",restart);
  root.addEventListener("pointerenter",stop);
  root.addEventListener("pointerleave",restart);
  root.addEventListener("focusin",stop);
  root.addEventListener("focusout",restart);
}
