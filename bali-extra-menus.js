/* BALI guest hookah and tea catalogs. Informational only: NEVER add to cart.
   Tea seed uses the owner's menu; detailed tasting notes cite the attached manual. */
import {initializeApp,getApps,getApp} from "./bali-public-reader.js?v=20261021-instant-pages2";
import {getFirestore,collection,onSnapshot} from "./bali-public-reader.js?v=20261021-instant-pages2";
import {node,categoryLabel,catalogCard,catalogGroup} from "./bali-menu-cards.js?v=20261020-2";
import {hasCatalogDetails,catalogDetailsAction,openCatalogDetails} from "./bali-catalog-details.js?v=20261020-2";
import {BALI_TEA_SEED} from "./bali-tea-seed.js";

const firebase=getApps().length?getApp():initializeApp(window.BALI_FIREBASE_CONFIG);
const db=getFirestore(firebase);
const collator=new Intl.Collator("ru",{numeric:true,sensitivity:"base"});
const schemas=[
  {prefix:"baliHookah",collection:"hookah_menu",title:"Кальянная карта",all:"Вся кальянная карта"},
  {prefix:"baliTea",collection:"tea_menu",title:"Чайная карта",all:"Вся чайная карта"}
];
const validText=(value,max=120)=>typeof value==="string"&&value.trim().length>0&&value.trim().length<=max;
const validPrice=value=>typeof value==="number"&&Number.isFinite(value)&&value>=0&&value<=20000;
const textField=(value,max=2400)=>typeof value==="string"?value.trim().slice(0,max):"";
function normalize(data,id){
  if(!validText(data?.name)||!validText(data?.category,60)||
     !validText(data?.volume1,30)||!validPrice(data?.price1)||
     typeof data?.volume2!=="string"||data.volume2.length>30||
     !validPrice(data?.price2))return null;
  return {
    id,name:data.name.trim(),category:data.category.trim(),volume1:data.volume1.trim(),
    price1:data.price1,volume2:data.volume2.trim(),price2:data.price2,
    sort:Number.isInteger(data.sort)?data.sort:100,
    description:textField(data.description),taste:textField(data.taste),
    ingredients:textField(data.ingredients),brewing:textField(data.brewing),
    sourcePage:Number.isInteger(data.sourcePage)?data.sourcePage:null,
    hidden:data.hidden===true
  };
}
const sortItems=(a,b)=>a.sort-b.sort||collator.compare(a.category,b.category)||collator.compare(a.name,b.name);
function mergeTeaItems(firebaseItems){
  // Seed is a full locally available menu; an edited Firestore document overrides
  // its matching seed ID or name. Guests can see the card before admin import.
  const result=new Map(BALI_TEA_SEED.map(item=>[item.id,item]));
  const byName=new Map(BALI_TEA_SEED.map(item=>[item.name.toLocaleLowerCase("ru-RU"),item.id]));
  for(const item of firebaseItems){
    const fallbackId=byName.get(item.name.toLocaleLowerCase("ru-RU"));
    const key=result.has(item.id)?item.id:(fallbackId||item.id);
    result.set(key,{...result.get(key),...item,id:key});
  }
  return [...result.values()].filter(x=>x.hidden!==true).sort(sortItems);
}
function setup({prefix,collection:collectionName,title,all}){
  const list=document.getElementById(prefix+"List");
  const filters=document.getElementById(prefix+"CategoryFilter");
  if(!list||!filters)return;
  const isTea=prefix==="baliTea";
  const state={items:isTea?[...BALI_TEA_SEED]:[],selected:"all",term:""};
  const search=document.getElementById("baliMenuSearch");
  const mode=isTea?"tea":"hookah";
  function draw(){
    list.replaceChildren();filters.replaceChildren();
    const categories=[...new Set(state.items.map(x=>x.category))];
    if(state.selected!=="all"&&!categories.includes(state.selected))state.selected="all";
    for(const [category,label] of [["all",all],...categories.map(x=>[x,x])]){
      const button=node("button","bali-bar-filter"+(state.selected===category?" is-active":""),categoryLabel(label));
      button.type="button";button.dataset.extraMenuCategory=category;
      button.setAttribute("aria-pressed",String(state.selected===category));filters.append(button);
    }
    if(!state.items.length){
      list.append(node("p","bali-bar-empty",title+" готовится к публикации. Позиции появятся после добавления администратором."));
      return;
    }
    const shown=state.items.filter(x=>
      (state.selected==="all"||x.category===state.selected)&&
      (!state.term||[x.name,x.category,x.volume1,x.volume2,
        ...(isTea?[x.description,x.taste,x.ingredients]:[])].some(value=>
        String(value||"").toLocaleLowerCase("ru-RU").includes(state.term))));
    if(!shown.length){
      list.append(node("p","bali-bar-empty","По выбранной категории или запросу ничего не найдено."));
      return;
    }
    const grouped=new Map();
    for(const item of shown){
      if(!grouped.has(item.category))grouped.set(item.category,[]);
      grouped.get(item.category).push(item);
    }
    for(const [category,items] of grouped){
      list.append(catalogGroup(category,items,item=>catalogCard(item,{
        tea:isTea,detailsLabel:catalogDetailsAction(mode),
        onDetails:hasCatalogDetails(item)?()=>openCatalogDetails(item,mode):undefined
      })));
    }
  }
  search?.addEventListener("input",()=>{
    if(window.BaliActiveMenuMode!==mode)return;
    state.term=search.value.trim().toLocaleLowerCase("ru-RU");draw();
  });
  window.addEventListener("bali:menu-mode-changed",event=>{
    if(event.detail?.mode===mode){state.selected="all";state.term="";draw();}
  });
  filters.addEventListener("click",event=>{
    const button=event.target.closest("button[data-extra-menu-category]");
    if(!button||!filters.contains(button))return;
    state.selected=button.dataset.extraMenuCategory;draw();
  });
  draw();
  onSnapshot(collection(db,collectionName),snapshot=>{
    const uploaded=snapshot.docs.map(d=>normalize(d.data(),d.id)).filter(Boolean);
    state.items=isTea?mergeTeaItems(uploaded):uploaded.sort(sortItems);draw();
  },error=>{
    if(isTea){
      // The verified photographed prices stay visible if Firebase is offline.
      console.warn("BALI tea read:",error?.code||error);
      state.items=[...BALI_TEA_SEED];draw();return;
    }
    filters.replaceChildren();
    list.replaceChildren(node("p","bali-bar-empty",error.code==="permission-denied"
      ?"Раздел пока недоступен. Для показа цен необходимо опубликовать актуальные правила Firestore."
      :"Не удалось загрузить карту. Попробуйте снова позднее."));
  });
}
schemas.forEach(setup);
