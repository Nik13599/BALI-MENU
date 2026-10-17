/* BALI bar price list — public, strictly informational and read-only.
 * Separate Firestore collection means alcoholic products NEVER enter the food
 * preorder catalog or basket. No product prices are fabricated.
 */
import {initializeApp,getApps,getApp} from "https://www.gstatic.com/firebasejs/10.14.1/firebase-app.js";
import {getFirestore,collection,onSnapshot} from "https://www.gstatic.com/firebasejs/10.14.1/firebase-firestore.js";

const app=getApps().length?getApp():initializeApp(window.BALI_FIREBASE_CONFIG);
const db=getFirestore(app);
const host=document.getElementById("baliBarList");
const tabs=document.getElementById("baliBarCategoryFilter");
const current={items:[],category:"all"};
const validText=(value,max=120)=>typeof value==="string"&&value.trim().length>0&&value.trim().length<=max;
const validPrice=value=>typeof value==="number"&&Number.isFinite(value)&&value>=0&&value<=20000;
const formatPrice=value=>new Intl.NumberFormat("ru-RU",{minimumFractionDigits:2,maximumFractionDigits:2}).format(value)+" BYN";
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
    const button=make("button","bali-bar-filter"+(current.category===value?" is-active":""),label);
    button.type="button";
    button.dataset.barCategory=value;
    button.setAttribute("aria-pressed",String(current.category===value));
    tabs.append(button);
  }
  if(!current.items.length){
    host.append(make("p","bali-bar-empty","Барная карта готовится к публикации. Актуальные позиции и цены появятся здесь."));
    return;
  }
  const listed=current.category==="all"?current.items:current.items.filter(x=>x.category===current.category);
  const groups=new Map();
  for(const item of listed){
    if(!groups.has(item.category))groups.set(item.category,[]);
    groups.get(item.category).push(item);
  }
  for(const [category,items] of groups){
    const group=make("section","bali-bar-group");
    const heading=make("h3","bali-bar-category-name",category);
    group.append(heading);
    const table=make("div","bali-bar-table");
    for(const item of items){
      const row=make("div","bali-bar-row");
      const title=make("strong","bali-bar-product-name",item.name);
      const prices=make("div","bali-bar-portions");
      for(const [volume,price] of [[item.volume1,item.price1],[item.volume2,item.price2]]){
        if(!volume)continue;
        const option=make("div","bali-bar-portion");
        option.append(make("span","bali-bar-volume",volume),make("span","bali-bar-price",formatPrice(price)));
        prices.append(option);
      }
      row.append(title,prices);
      table.append(row);
    }
    group.append(table);
    host.append(group);
  }
}
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
