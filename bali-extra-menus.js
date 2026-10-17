/* BALI v71: Hookah and Tea maps are public, read-only Firestore price lists.
   NEVER place these records into kitchen preorder cart or checkout. */
import {initializeApp,getApps,getApp} from "https://www.gstatic.com/firebasejs/10.14.1/firebase-app.js";
import {getFirestore,collection,onSnapshot} from "https://www.gstatic.com/firebasejs/10.14.1/firebase-firestore.js";

const firebase=getApps().length?getApp():initializeApp(window.BALI_FIREBASE_CONFIG);
const db=getFirestore(firebase);
const rub=new Intl.NumberFormat("ru-RU",{minimumFractionDigits:2,maximumFractionDigits:2});
const collator=new Intl.Collator("ru",{numeric:true,sensitivity:"base"});
const schemas=[
  {prefix:"baliHookah",collection:"hookah_menu",title:"Кальянная карта",all:"Вся кальянная карта"},
  {prefix:"baliTea",collection:"tea_menu",title:"Чайная карта",all:"Вся чайная карта"}
];
const node=(tag,className,text)=>{
  const element=document.createElement(tag);
  if(className)element.className=className;
  if(text!==undefined)element.textContent=text;
  return element;
};
const validText=(value,max=120)=>typeof value==="string"&&value.trim().length>0&&value.trim().length<=max;
const validPrice=value=>typeof value==="number"&&Number.isFinite(value)&&value>=0&&value<=20000;
function normalize(data,id){
  if(!validText(data?.name)||!validText(data?.category,60)||
     !validText(data?.volume1,30)||!validPrice(data?.price1)||
     typeof data?.volume2!=="string"||data.volume2.length>30||
     !validPrice(data?.price2))return null;
  return {
    id,name:data.name.trim(),category:data.category.trim(),volume1:data.volume1.trim(),
    price1:data.price1,volume2:data.volume2.trim(),price2:data.price2,
    sort:Number.isInteger(data.sort)?data.sort:100
  };
}
function setup({prefix,collection:collectionName,title,all}){
  const list=document.getElementById(prefix+"List");
  const filters=document.getElementById(prefix+"CategoryFilter");
  if(!list||!filters)return;
  const state={items:[],selected:"all",term:""};
  const search=document.getElementById("baliMenuSearch");
  const mode=prefix==="baliHookah"?"hookah":"tea";
  function draw(){
    list.replaceChildren();filters.replaceChildren();
    const categories=[...new Set(state.items.map(item=>item.category))];
    if(state.selected!=="all"&&!categories.includes(state.selected))state.selected="all";
    for(const [category,label] of [["all",all],...categories.map(x=>[x,x])]){
      const button=node("button","bali-bar-filter"+(state.selected===category?" is-active":""),label);
      button.type="button";
      button.dataset.extraMenuCategory=category;
      button.setAttribute("aria-pressed",String(state.selected===category));
      filters.append(button);
    }
    if(!state.items.length){
      list.append(node("p","bali-bar-empty",title+" готовится к публикации. Позиции и цены появятся здесь после добавления администратором."));
      return;
    }
    const shown=state.items.filter(x=>
      (state.selected==="all"||x.category===state.selected)&&
      (!state.term||[x.name,x.category,x.volume1,x.volume2].some(value=>
        String(value||"").toLocaleLowerCase("ru-RU").includes(state.term)))
    );
    if(!shown.length&&state.items.length){
      list.append(node("p","bali-bar-empty","По выбранной категории или запросу ничего не найдено."));
      return;
    }
    const grouped=new Map();
    for(const item of shown){
      if(!grouped.has(item.category))grouped.set(item.category,[]);
      grouped.get(item.category).push(item);
    }
    for(const [category,items] of grouped){
      const group=node("section","bali-bar-group");
      group.append(node("h3","bali-bar-category-name",category));
      const table=node("div","bali-bar-table");
      for(const item of items){
        const row=node("div","bali-bar-row");
        row.append(node("strong","bali-bar-product-name",item.name));
        const portions=node("div","bali-bar-portions");
        for(const [volume,price] of [[item.volume1,item.price1],[item.volume2,item.price2]]){
          if(!volume)continue;
          const p=node("div","bali-bar-portion");
          p.append(node("span","bali-bar-volume",volume),
                   node("span","bali-bar-price",rub.format(price)+" BYN"));
          portions.append(p);
        }
        row.append(portions);table.append(row);
      }
      group.append(table);list.append(group);
    }
  }
  search?.addEventListener("input",()=>{
    if(window.BaliActiveMenuMode!==mode)return;
    state.term=search.value.trim().toLocaleLowerCase("ru-RU");
    draw();
  });
  window.addEventListener("bali:menu-mode-changed",event=>{
    if(event.detail?.mode===mode){
      state.selected="all";state.term="";
      draw();
    }
  });
  filters.addEventListener("click",event=>{
    const button=event.target.closest("button[data-extra-menu-category]");
    if(!button||!filters.contains(button))return;
    state.selected=button.dataset.extraMenuCategory;
    draw();
  });
  onSnapshot(collection(db,collectionName),snapshot=>{
    state.items=snapshot.docs.map(d=>normalize(d.data(),d.id)).filter(Boolean)
      .sort((a,b)=>a.sort-b.sort||collator.compare(a.category,b.category)||collator.compare(a.name,b.name));
    draw();
  },error=>{
    filters.replaceChildren();
    list.replaceChildren(node("p","bali-bar-empty",error.code==="permission-denied"
      ?"Раздел пока недоступен. Для показа цен необходимо опубликовать актуальные правила Firestore."
      :"Не удалось загрузить карту. Попробуйте снова позднее."));
  });
}
schemas.forEach(setup);
