/* BALI bar price list — public, strictly informational and read-only.
 * Separate Firestore collection means alcoholic products NEVER enter the food
 * preorder catalog or basket. No product prices are fabricated.
 */
import {initializeApp,getApps,getApp} from "https://www.gstatic.com/firebasejs/10.14.1/firebase-app.js";
import {getFirestore,collection,onSnapshot} from "https://www.gstatic.com/firebasejs/10.14.1/firebase-firestore.js";

import {categoryLabel,catalogCard,catalogGroup} from "./bali-menu-cards.js?v=20261020-1";

const app=getApps().length?getApp():initializeApp(window.BALI_FIREBASE_CONFIG);
const db=getFirestore(app);
const host=document.getElementById("baliBarList");
const tabs=document.getElementById("baliBarCategoryFilter");
const current={items:[],category:"all",term:""};
const search=document.getElementById("baliMenuSearch");
const validText=(value,max=120)=>typeof value==="string"&&value.trim().length>0&&value.trim().length<=max;
const validPrice=value=>typeof value==="number"&&Number.isFinite(value)&&value>=0&&value<=20000;
const collator=new Intl.Collator("ru",{numeric:true,sensitivity:"base"});
const make=(tag,cls,text)=>{
  const el=document.createElement(tag);
  if(cls)el.className=cls;
  if(text!==undefined)el.textContent=text;
  return el;
};
function validItem(raw,id){
  if(!validText(raw?.name)||!validText(raw?.category,60)
    ||!validText(raw?.volume1,30)||!validPrice(raw?.price1)
    ||typeof raw?.volume2!=="string"||raw.volume2.length>30
    ||!validPrice(raw?.price2))return null;
  return {
    id,name:raw.name.trim(),category:raw.category.trim(),
    volume1:raw.volume1.trim(),price1:raw.price1,
    volume2:raw.volume2.trim(),price2:raw.price2,
    sort:Number.isInteger(raw.sort)?raw.sort:100
  };
}
function draw(){
  if(!host||!tabs)return;
  host.replaceChildren();
  tabs.replaceChildren();
  const categories=[...new Set(current.items.map(x=>x.category))];
  if(current.category!=="all"&&!categories.includes(current.category))current.category="all";
  for(const [value,label] of [["all","Вся барная карта"],...categories.map(x=>[x,x])]){
    const button=make("button","bali-bar-filter"+(current.category===value?" is-active":""),categoryLabel(label));
    button.type="button";
    button.dataset.barCategory=value;
    button.setAttribute("aria-pressed",String(current.category===value));
    tabs.append(button);
  }
  if(!current.items.length){
    host.append(make("p","bali-bar-empty","Барная карта готовится к публикации. Актуальные позиции и цены появятся здесь."));
    return;
  }
  const listed=current.items.filter(x=>
    (current.category==="all"||x.category===current.category)&&
    (!current.term||[x.name,x.category,x.volume1,x.volume2].some(v=>String(v||"").toLocaleLowerCase("ru-RU").includes(current.term)))
  );
  if(!listed.length&&current.items.length){
    host.append(make("p","bali-bar-empty","По выбранной категории или запросу ничего не найдено."));
    return;
  }
  const groups=new Map();
  for(const item of listed){
    if(!groups.has(item.category))groups.set(item.category,[]);
    groups.get(item.category).push(item);
  }
  for(const [category,items] of groups){
    host.append(catalogGroup(category,items,catalogCard));
  }
}
search?.addEventListener("input",()=>{
  if(window.BaliActiveMenuMode!=="bar")return;
  current.term=search.value.trim().toLocaleLowerCase("ru-RU");
  draw();
});
window.addEventListener("bali:menu-mode-changed",event=>{
  if(event.detail?.mode==="bar"){
    current.category="all";current.term="";
    draw();
  }
});
tabs?.addEventListener("click",event=>{
  const button=event.target.closest("button[data-bar-category]");
  if(!button||!tabs.contains(button))return;
  current.category=button.dataset.barCategory;
  draw();
});
if(host&&tabs){
  onSnapshot(collection(db,"bar_menu"),snapshot=>{
    current.items=snapshot.docs.map(d=>validItem(d.data(),d.id)).filter(Boolean)
      .sort((a,b)=>a.sort-b.sort||collator.compare(a.category,b.category)||collator.compare(a.name,b.name));
    draw();
  },error=>{
    host.replaceChildren(make("p","bali-bar-empty",error.code==="permission-denied"
      ?"Барная карта пока недоступна. Необходимо опубликовать правила Firestore для просмотра цен."
      :"Не удалось загрузить барную карту. Попробуйте открыть страницу позднее."));
  });
}
