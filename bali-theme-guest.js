/* BALI browser guest theme: public presentation through Cloudflare only.
 * The admin still edits the canonical Firestore theme with owner permissions.
 * No Firebase SDK, authentication or Firestore subscription on the guest page.
 */
import {getApps,getApp,initializeApp,getFirestore,doc,onSnapshot}
  from "./bali-public-reader.js?v=20261022-theme-public1";
const palettes=Object.freeze({
  cobalt:Object.freeze({primary:"#7585FF",secondary:"#536AE0",text:"#C3CAFF",border:"#8192FF"}),
  lime:Object.freeze({primary:"#B9FF51",secondary:"#88D43E",text:"#D8FF9F",border:"#B2EF5F"}),
  white:Object.freeze({primary:"#F0F0EE",secondary:"#D6D7DB",text:"#F1F1F0",border:"#E1E2E2"})
});
const keys=["primary","secondary","text","border"];
const hex=/^#[0-9a-fA-F]{6}$/;
function selection(theme,colors){
  if(theme==="custom"&&colors&&
     keys.every(k=>typeof colors[k]==="string"&&hex.test(colors[k])))
    return {theme,colors:Object.fromEntries(keys.map(k=>[k,colors[k].toUpperCase()]))};
  const chosen=Object.hasOwn(palettes,theme)?theme:"lime";
  return {theme:chosen,colors:palettes[chosen]};
}
function rgb(value,opacity){
  return "rgba("+[1,3,5].map(i=>parseInt(value.slice(i,i+2),16)).join(",")+","+opacity+")";
}
function contrasting(hexColor){
  const channels=[1,3,5].map(i=>parseInt(hexColor.slice(i,i+2),16)/255)
    .map(v=>v<=.04045?v/12.92:((v+.055)/1.055)**2.4);
  return .2126*channels[0]+.7152*channels[1]+.0722*channels[2]>.179?
    "#10131A":"#FFFFFF";
}
function apply(value){
  const theme=selection(value?.theme,value?.colors);
  const style=document.documentElement.style,c=theme.colors;
  style.setProperty("--bt-primary",c.primary);
  style.setProperty("--bt-secondary",c.secondary);
  style.setProperty("--bt-text",c.text);
  style.setProperty("--bt-border",c.border);
  style.setProperty("--bt-on-primary",contrasting(c.primary));
  style.setProperty("--bt-on-secondary",contrasting(c.secondary));
  style.setProperty("--bt-tint",rgb(c.primary,.17));
  style.setProperty("--bt-stroke",rgb(c.border,.60));
  document.documentElement.dataset.baliTheme=theme.theme;
}
apply({theme:"lime"});
const instance=getApps().length?getApp():initializeApp(window.BALI_FIREBASE_CONFIG);
onSnapshot(doc(getFirestore(instance),"settings","appearance"),
  snapshot=>apply(snapshot.exists()?snapshot.data():{theme:"lime"}),
  ()=>{}); // Keep the LIME SHADOW fallback when public content is unavailable.
