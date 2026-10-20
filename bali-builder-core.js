/* BALI Builder: responsive visual overrides without changing business logic. */
(() => {
"use strict";
const ROOTS={home:"#homeSection",events:"#eventsSection",menu:"#menuPage",info:"#contactsSection",profile:"#profileSection",id:"#baliIdSection",about:"#baliAboutSection"};
const fonts=["Manrope, sans-serif","Inter, sans-serif","Arial, sans-serif","Georgia, serif","Trebuchet MS, sans-serif","system-ui, sans-serif","monospace"];
const safeUrl=x=>typeof x==="string"&&(/^https:\/\/[^\s"'<>]{1,2048}$/i.test(x)||/^data:image\/webp;base64,[A-Za-z0-9+/=]{1,180000}$/.test(x));
const safeLink=x=>typeof x==="string"&&(/^(route:(home|events|menu|info|profile|id|about|cart))$/.test(x)||/^https:\/\/[^\s"'<>]{1,2048}$/i.test(x)||/^tel:\+?[0-9]{5,22}$/.test(x));
const emptyDevice=()=>({rules:{},blocks:[]});
const emptyModel=()=>({desktop:emptyDevice(),tablet:emptyDevice(),phone:emptyDevice()});
const device=win=>win.innerWidth<=767?"phone":win.innerWidth<=1179?"tablet":"desktop";
const num=(v,min,max)=>Number.isFinite(Number(v))?Math.min(max,Math.max(min,Number(v))):null;
const dim=(v,min,max)=>typeof v==="string"&&/^[-\d.]+(px|%)$/.test(v)&&num(parseFloat(v),min,max)!==null?num(parseFloat(v),min,max)+(v.endsWith("%")?"%":"px"):null;
const col=v=>typeof v==="string"&&/^(#[0-9a-fA-F]{6}|#[0-9a-fA-F]{8}|transparent)$/.test(v)?v:null;
function sanitizeProps(src){
 const r={};if(!src||typeof src!=="object")return r;
 for(const [k,v] of Object.entries(src)){
   if(["width","height","minHeight"].includes(k)){const a=dim(v,0,4000);if(a)r[k]=a;}
   else if(["fontSize","padding","borderRadius","borderWidth","letterSpacing","translateX","translateY"].includes(k)){
     const a=num(v,["translateX","translateY"].includes(k)?-2000: k==="letterSpacing"?-10:0,k==="fontSize"?200:k==="borderWidth"?20:k==="letterSpacing"?35:3000);
     if(a!==null)r[k]=a;
   }else if(["color","backgroundColor","borderColor"].includes(k)){const a=col(v);if(a)r[k]=a;}
   else if(k==="fontFamily"&&fonts.includes(v))r[k]=v;
   else if(k==="fontWeight"&&["300","400","500","600","700","800","900"].includes(String(v)))r[k]=String(v);
   else if(k==="fontStyle"&&["normal","italic"].includes(v))r[k]=v;
   else if(k==="textAlign"&&["left","center","right","justify"].includes(v))r[k]=v;
   else if(["lineHeight","opacity","rotate","scale"].includes(k)){const limits={lineHeight:[0.7,3],opacity:[0,1],rotate:[-360,360],scale:[0.2,3]};const a=num(v,...limits[k]);if(a!==null)r[k]=a;}
   else if(k==="shadow"&&["none","soft","deep","glow"].includes(v))r[k]=v;
   else if(k==="animation"&&["none","fade","float","pulse","glow","slide-left","slide-right","zoom","bounce","tilt","shimmer","spin","heartbeat","flicker","reveal"].includes(v))r[k]=v;
   else if(k==="effect"&&["none","glass","neon","grayscale","sepia","blur","saturate","hover-lift","hover-glow"].includes(v))r[k]=v;
   else if(k==="buttonStyle"&&["none","solid","outline","glass","pill"].includes(v))r[k]=v;
   else if(k==="image"&&safeUrl(v))r[k]=v;
 }
 return r;
}
function sanitizeDevice(raw){
 const out=emptyDevice();if(!raw||typeof raw!=="object")return out;
 for(const [selector,item] of Object.entries(raw.rules||{}).slice(0,140)){
   if(!selector||selector.length>300||/[{}<>;\n\r]/.test(selector)||!item||typeof item!=="object")continue;
   out.rules[selector]={props:sanitizeProps(item.props)};
   if(typeof item.text==="string")out.rules[selector].text=item.text.slice(0,1500);
   if(safeLink(item.link))out.rules[selector].link=item.link;
 }
 out.blocks=(Array.isArray(raw.blocks)?raw.blocks:[]).slice(0,30)
 .filter(b=>b&&typeof b==="object"&&/^[a-z0-9-]{4,60}$/i.test(b.id||"")&&["text","button","image","panel"].includes(b.kind)&&ROOTS[b.page])
 .map(b=>({id:b.id,kind:b.kind,page:b.page,text:typeof b.text==="string"?b.text.slice(0,1500):"",
 link:safeLink(b.link)?b.link:"route:home",image:safeUrl(b.image)?b.image:"",
 x:num(b.x,0,95)||0,y:num(b.y,0,5000)||0,props:sanitizeProps(b.props)}));
 return out;
}
function cleanModel(v){return {desktop:sanitizeDevice(v?.desktop),tablet:sanitizeDevice(v?.tablet),phone:sanitizeDevice(v?.phone)};}
function css(node,props,save){
 props=sanitizeProps(props);
 const propsCss={fontFamily:"font-family",fontWeight:"font-weight",fontStyle:"font-style",textAlign:"text-align",color:"color",backgroundColor:"background-color",borderColor:"border-color",width:"width",height:"height",minHeight:"min-height"};
 const put=(k,v)=>{save?.(node,k);node.style.setProperty(k,v,"important");};
 for(const [k,c] of Object.entries(propsCss))if(props[k]!==undefined)put(c,props[k]);
 for(const k of ["fontSize","padding","borderRadius","borderWidth","letterSpacing"]){
   const c={fontSize:"font-size",padding:"padding",borderRadius:"border-radius",borderWidth:"border-width",letterSpacing:"letter-spacing"}[k];
   if(props[k]!==undefined)put(c,props[k]+"px");
 }
 if(props.borderWidth>0)put("border-style","solid");
 for(const k of ["lineHeight","opacity"])if(props[k]!==undefined)put(k==="lineHeight"?"line-height":"opacity",String(props[k]));
 if(["translateX","translateY","rotate","scale"].some(k=>props[k]!==undefined))
   put("transform","translate("+(props.translateX||0)+"px,"+(props.translateY||0)+"px) rotate("+(props.rotate||0)+"deg) scale("+(props.scale||1)+")");
 if(props.shadow)put("box-shadow",{none:"none",soft:"0 8px 24px rgba(0,0,0,.35)",deep:"0 18px 48px rgba(0,0,0,.6)",glow:"0 0 25px rgba(185,255,81,.48)"}[props.shadow]);
 if(props.animation)put("animation",props.animation==="none"?"none":"bali-builder-"+props.animation+" "+(["fade","slide-left","slide-right","zoom","reveal"].includes(props.animation)?"0.85s ease both":"3s ease-in-out infinite"));
 if(props.effect){save?.(node,"@effect");if(props.effect==="none")node.removeAttribute("data-bali-builder-effect");else node.setAttribute("data-bali-builder-effect",props.effect);}
 if(props.buttonStyle&&props.buttonStyle!=="none"){
   const type=props.buttonStyle;
   put("border",type==="outline"?"1px solid currentColor":type==="glass"?"1px solid rgba(255,255,255,.33)":"1px solid transparent");
   put("background",type==="outline"?"transparent":type==="glass"?"rgba(255,255,255,.14)":"#b9ff51");
   put("color",["solid","pill"].includes(type)?"#0b100c":"#fff");
   put("border-radius",type==="pill"?"999px":"9px");put("backdrop-filter",type==="glass"?"blur(14px)":"none");
 }
 if(props.image){
   if(node.tagName==="IMG"){save?.(node,"@src");node.src=props.image;}
   else{put("background-image",'url("'+props.image.replace(/"/g,"%22")+'")');put("background-size","cover");put("background-position","center");}
 }
}
function makeStyle(doc){
 if(doc.getElementById("baliBuilderBaseStyle"))return;
 const s=doc.createElement("style");s.id="baliBuilderBaseStyle";
 s.textContent="@keyframes bali-builder-fade{from{opacity:0;translate:0 12px}to{opacity:1;translate:0 0}}"+
 "@keyframes bali-builder-slide-left{from{opacity:0;translate:40px 0}to{opacity:1;translate:0 0}}"+
 "@keyframes bali-builder-slide-right{from{opacity:0;translate:-40px 0}to{opacity:1;translate:0 0}}"+
 "@keyframes bali-builder-zoom{from{opacity:0;scale:.8}to{opacity:1;scale:1}}"+
 "@keyframes bali-builder-reveal{from{opacity:0;clip-path:inset(0 100% 0 0)}to{opacity:1;clip-path:inset(0 0 0 0)}}"+
 "@keyframes bali-builder-bounce{0%,100%{translate:0 0}50%{translate:0 -13px}}"+
 "@keyframes bali-builder-tilt{0%,100%{rotate:-2deg}50%{rotate:2deg}}"+
 "@keyframes bali-builder-shimmer{0%,100%{filter:brightness(1)}50%{filter:brightness(1.45)}}"+
 "@keyframes bali-builder-spin{to{rotate:360deg}}"+
 "@keyframes bali-builder-heartbeat{0%,100%{scale:1}35%{scale:1.09}60%{scale:1}}"+
 "@keyframes bali-builder-flicker{0%,100%{opacity:1}11%,18%,32%{opacity:.7}13%,22%{opacity:1}}"+
 "@keyframes bali-builder-float{50%{translate:0 -9px}}@keyframes bali-builder-pulse{50%{opacity:.65}}"+
 "@keyframes bali-builder-glow{50%{box-shadow:0 0 32px rgba(185,255,81,.6)}}"+
 ".bali-builder-added{box-sizing:border-box;max-width:none;z-index:7}"+
 ".bali-builder-added[data-kind=panel]{background:#141b20;border:1px solid #5a7160;white-space:pre-wrap}"+
 ".bali-builder-added[data-kind=text]{white-space:pre-wrap}"+
 ".bali-builder-added[data-kind=button]{display:flex;align-items:center;justify-content:center;text-align:center;text-decoration:none;background:#b9ff51;color:#10140f;border:0;border-radius:8px;padding:12px;font-weight:750}"+
 ".bali-builder-added[data-kind=image]{object-fit:cover;display:block}"+
 "[data-bali-builder-effect=glass]{background:rgba(255,255,255,.12)!important;backdrop-filter:blur(15px)!important;border:1px solid rgba(255,255,255,.25)!important}"+
 "[data-bali-builder-effect=neon]{text-shadow:0 0 12px currentColor;box-shadow:0 0 20px rgba(185,255,81,.38)}"+
 "[data-bali-builder-effect=grayscale]{filter:grayscale(1)}[data-bali-builder-effect=sepia]{filter:sepia(.8)}"+
 "[data-bali-builder-effect=blur]{filter:blur(2px)}[data-bali-builder-effect=saturate]{filter:saturate(1.8)}"+
 "[data-bali-builder-effect=hover-lift],[data-bali-builder-effect=hover-glow]{transition:translate .25s,box-shadow .25s}"+
 "[data-bali-builder-effect=hover-lift]:hover{translate:0 -8px}"+
 "[data-bali-builder-effect=hover-glow]:hover{box-shadow:0 0 28px rgba(185,255,81,.55)}"+
 "@media(prefers-reduced-motion:reduce){.bali-builder-added{animation:none!important}}";
 doc.head.append(s);
}
function navigate(win,link){
 if(!safeLink(link))return;
 if(link.startsWith("route:")){
  const route=link.slice(6);
  if(route==="cart"){win.document.querySelector("#baliPcCartBtn, #cartBtn")?.click();return;}
  const selectors={home:'[data-bali-nav="home"]',events:'[data-bali-nav="events"]',menu:'[data-bali-nav="menu"]',
   info:'[data-bali-nav="contacts"],[data-bali-nav="info"]',profile:'[data-bali-nav="profile"]',id:'[data-bali-nav="id"],#baliMobileIdBtn',
   about:'[data-bali-nav="about"]'};
  const button=win.document.querySelector(selectors[route]);
  if(button){button.click();return;}
  if(route==="id"&&!win.BaliAuth?.isRegistered?.()){win.BaliAuth?.open?.();return;}
  if(typeof win.navigateGuestPage==="function")win.navigateGuestPage(route==="info"?"contacts":route);
  return;
 }
 if(link.startsWith("tel:"))win.location.href=link;
 else win.open(link,"_blank","noopener,noreferrer");
}
function selectorFor(el){
 if(el.id)return "#"+CSS.escape(el.id);
 const seg=[];let curr=el;
 for(let d=0;curr?.tagName&&d<12;d++){
  if(curr.id){seg.unshift("#"+CSS.escape(curr.id));break;}
  const siblings=curr.parentElement?[...curr.parentElement.children].filter(n=>n.tagName===curr.tagName):[];
  seg.unshift(curr.tagName.toLowerCase()+":nth-of-type("+(siblings.indexOf(curr)+1)+")");
  curr=curr.parentElement;
 }
 const val=seg.join(" > ");return val.length<=300?val:null;
}
function findPage(el){for(const [page,sel] of Object.entries(ROOTS))if(el.closest(sel))return page;return "home";}
function mount(doc,model,view,options={}){
 if(!doc?.body)return;
 const data=sanitizeDevice(cleanModel(model)[view||device(doc.defaultView)]);
 doc.__baliBuilderRestore?.();makeStyle(doc);
 const restored=[],seen=new WeakMap(),added=[];
 const save=(node,p)=>{
  let set=seen.get(node);if(!set){set=new Set();seen.set(node,set);}
  if(set.has(p))return;set.add(p);
  if(p==="@src"||p==="@effect"){const attr=p==="@src"?"src":"data-bali-builder-effect";const prev=node.getAttribute(attr);restored.push(()=>prev===null?node.removeAttribute(attr):node.setAttribute(attr,prev));}
  else {const val=node.style.getPropertyValue(p),priority=node.style.getPropertyPriority(p);
   restored.push(()=>val?node.style.setProperty(p,val,priority):node.style.removeProperty(p));}
 };
 for(const [selector,rule] of Object.entries(data.rules)){
  let nodes=[];try{nodes=[...doc.querySelectorAll(selector)].slice(0,40);}catch{continue;}
  for(const node of nodes){
   if(node.closest(".bali-builder-added"))continue;
   css(node,rule.props,save);
   if(typeof rule.text==="string"){
    if(node.matches("input,textarea")){const prev=node.placeholder;node.placeholder=rule.text;restored.push(()=>node.placeholder=prev);}
    else{
     const t=[...node.childNodes].find(n=>n.nodeType===3);
     if(t){const old=t.textContent;t.textContent=rule.text;restored.push(()=>t.textContent=old);}
     else if(!node.children.length){const old=node.textContent;node.textContent=rule.text;restored.push(()=>node.textContent=old);}
    }
   }
   if(rule.link&&node.matches("a,button")){
    const old=node.getAttribute("href");
    if(node.tagName==="A")node.setAttribute("href",rule.link.startsWith("route:")?"#":rule.link);
    const handler=e=>{e.preventDefault();e.stopImmediatePropagation();if(!options.editor)navigate(doc.defaultView,rule.link);};
    node.addEventListener("click",handler,true);
    restored.push(()=>{node.removeEventListener("click",handler,true);if(node.tagName==="A"){if(old===null)node.removeAttribute("href");else node.setAttribute("href",old);}});
   }
  }
 }
 for(const block of data.blocks){
  const root=doc.querySelector(ROOTS[block.page]);if(!root)continue;
  save(root,"position");root.style.setProperty("position","relative");
  const el=doc.createElement(block.kind==="image"?"img":block.kind==="button"?"a":"div");
  el.className="bali-builder-added";el.dataset.kind=block.kind;el.dataset.baliBuilderId=block.id;
  if(block.kind==="image"){if(block.image)el.src=block.image;el.alt=block.text||"";}
  else el.textContent=block.text||({button:"Кнопка",panel:"Новый блок",text:"Ваш текст"}[block.kind]);
  el.style.position="absolute";el.style.left=block.x+"%";el.style.top=block.y+"px";
  el.style.width=block.props.width||"240px";el.style.minHeight=block.kind==="panel"?"80px":"32px";
  if(block.kind==="image")el.style.height=block.props.height||"150px";
  css(el,block.props);
  if(block.kind==="button"){
   el.href=block.link.startsWith("route:")?"#":block.link;
   el.addEventListener("click",e=>{e.preventDefault();if(!options.editor)navigate(doc.defaultView,block.link);});
  }
  root.append(el);added.push(el);
 }
 doc.__baliBuilderRestore=()=>{for(const n of added)n.remove();for(const f of restored.reverse())f();};
}
window.BaliBuilderCore=Object.freeze({emptyModel,cleanModel,sanitizeDevice,sanitizeProps,safeUrl,safeLink,device,mount,selectorFor,findPage,ROOTS,fonts,navigate});
})();