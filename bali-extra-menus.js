/* BALI guest hookah and tea catalogs. Informational only: NEVER add to cart.
   Tea seed uses the owner's menu; detailed tasting notes cite the attached manual. */
import {initializeApp,getApps,getApp} from "https://www.gstatic.com/firebasejs/10.14.1/firebase-app.js";
import {getFirestore,collection,onSnapshot} from "https://www.gstatic.com/firebasejs/10.14.1/firebase-firestore.js";
import {BALI_TEA_SEED} from "./bali-tea-seed.js";

const firebase=getApps().length?getApp():initializeApp(window.BALI_FIREBASE_CONFIG);
const db=getFirestore(firebase);
const rub=new Intl.NumberFormat("ru-RU",{minimumFractionDigits:2,maximumFractionDigits:2});
const collator=new Intl.Collator("ru",{numeric:true,sensitivity:"base"});
const schemas=[
  {prefix:"baliHookah",collection:"hookah_menu",title:"Кальянная карта",all:"Вся кальянная карта"},
  {prefix:"baliTea",collection:"tea_menu",title:"Чайная карта",all:"Вся чайная карта"}
];
const node=(tag,className,txt)=>{
  const element=document.createElement(tag);
  if(className)element.className=className;
  if(txt!==undefined)element.textContent=txt;
  return element;
};
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
let teaDialog;
function getTeaDialog(){
  if(teaDialog)return teaDialog;
  const dialog=node("dialog","bali-menu-details-dialog bali-tea-details-dialog");
  dialog.id="baliTeaDetailsDialog";
  dialog.setAttribute("aria-labelledby","baliTeaDetailsTitle");
  const head=node("div","bali-menu-details-head");
  const title=node("span","", "ИНФОРМАЦИЯ О ЧАЕ");title.id="baliTeaDetailsTitle";
  const close=node("button","","✕");close.type="button";close.className="bali-tea-details-close";
  close.setAttribute("aria-label","Закрыть информацию о чае");
  close.addEventListener("click",()=>dialog.close());
  head.append(title,close);
  const body=node("div","bali-menu-details-body");
  body.id="baliTeaDetailsBody";
  dialog.append(head,body);
  dialog.addEventListener("click",event=>{
    if(event.target===dialog)dialog.close();
  });
  document.body.append(dialog);
  teaDialog=dialog;return dialog;
}
function openTeaInfo(item){
  const hasDetails=Boolean([item.description,item.taste,item.ingredients,item.brewing].some(Boolean));
  if(!hasDetails)return;
  const dialog=getTeaDialog(),body=document.getElementById("baliTeaDetailsBody");
  body.replaceChildren();
  body.append(node("h2","bali-menu-details-name",item.name));
  const prices=[[item.volume1,item.price1],[item.volume2,item.price2]].filter(x=>x[0]);
  body.append(node("strong","bali-menu-details-price",prices.map(x=>
    (x[0]==="Порция"?"":x[0]+" · ")+rub.format(x[1])+" BYN").join(" / ")));
  for(const [label,value] of [
    ["Описание",item.description],["Состав",item.ingredients],
    ["Вкус и аромат",item.taste],["Рекомендации по завариванию",item.brewing]]){
    if(!value)continue;
    body.append(node("h3","bali-menu-details-label",label),
                node("p","bali-menu-details-copy",value));
  }
  if(item.sourcePage)
    body.append(node("p","bali-tea-details-source","Описание составлено по чайной методичке, страница "+item.sourcePage+"."));
  if(!dialog.open)dialog.showModal();
}
const infoSvg=()=>{
  const svg=document.createElementNS("http://www.w3.org/2000/svg","svg");
  svg.setAttribute("viewBox","0 0 24 24");
  svg.setAttribute("width","25");svg.setAttribute("height","25");
  svg.setAttribute("fill","none");svg.setAttribute("stroke","currentColor");
  svg.setAttribute("stroke-width","1.8");svg.setAttribute("stroke-linecap","round");
  svg.setAttribute("aria-hidden","true");
  const circle=document.createElementNS(svg.namespaceURI,"circle");
  circle.setAttribute("cx","12");circle.setAttribute("cy","12");circle.setAttribute("r","9.2");
  const path=document.createElementNS(svg.namespaceURI,"path");
  path.setAttribute("d","M12 10.7v5.5M12 7.65h.01");
  svg.append(circle,path);return svg;
};
function drawTeaItem(item){
  const card=node("article","menu-item bali-tea-item menu-item--no-image");
  const inner=node("div","bali-tea-card-content");
  inner.append(node("strong","bali-bar-product-name",item.name));
  const portions=node("div","bali-tea-card-prices");
  for(const [volume,price] of [[item.volume1,item.price1],[item.volume2,item.price2]]){
    if(!volume)continue;
    const p=node("div","bali-tea-card-price");
    if(volume!=="Порция")p.append(node("small","",volume));
    p.append(node("span","",rub.format(price)+" BYN"));
    portions.append(p);
  }
  inner.append(portions);
  const info=node("button","menu-details-btn");
  const hasDetails=Boolean([item.description,item.taste,item.ingredients,item.brewing].some(Boolean));
  info.classList.add(hasDetails?"has-details":"no-details");
  info.type="button";info.append(infoSvg());
  info.setAttribute("aria-label",(hasDetails?"Подробная информация: ":"Описание пока не добавлено: ")+item.name);
  info.title=hasDetails?"Информация о чае":"Подробное описание пока не добавлено";
  if(hasDetails)info.addEventListener("click",()=>openTeaInfo(item));
  else{info.disabled=true;info.setAttribute("aria-disabled","true");}
  card.append(inner,info);return card;
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
      const button=node("button","bali-bar-filter"+(state.selected===category?" is-active":""),label);
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
      const group=node("section","bali-bar-group");
      group.append(node("h3","bali-bar-category-name",category));
      const table=node("div","bali-bar-table"+(isTea?" bali-tea-card-grid":""));
      for(const item of items){
        if(isTea){table.append(drawTeaItem(item));continue;}
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
