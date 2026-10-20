/* Informational catalog dialogs: public text only, no ordering controls. */
import {node} from './bali-menu-cards.js?v=20261020-2';
const kinds={
  bar:{prefix:'baliBar',title:'Информация о напитке',action:'Подробнее о напитке'},
  hookah:{prefix:'baliHookah',title:'Информация о кальяне',action:'Подробнее о кальяне'},
  tea:{prefix:'baliTea',title:'Информация о чае',action:'Подробнее о чае'}
};
const fields=[['Описание','description'],['Состав','ingredients'],['Вкус и аромат','taste'],['Рекомендации по завариванию','brewing']];
export const hasCatalogDetails=item=>fields.some(([,key])=>typeof item[key]==='string'&&item[key].trim().length>0);
export const catalogDetailsAction=kind=>kinds[kind].action;
const dialogs=new Map();
const money=new Intl.NumberFormat('ru-RU',{maximumFractionDigits:2});
export function openCatalogDetails(item,kind){
  if(!hasCatalogDetails(item)||!kinds[kind])return;
  const {prefix,title}=kinds[kind];
  let dialog=dialogs.get(kind);
  if(!dialog){
    dialog=node('dialog','bali-menu-details-dialog bali-catalog-details-dialog');
    dialog.id=prefix+'DetailsDialog';dialog.setAttribute('aria-labelledby',prefix+'DetailsTitle');
    const head=node('div','bali-menu-details-head');
    const heading=node('span','',title);heading.id=prefix+'DetailsTitle';
    const close=node('button','bali-catalog-details-close','✕');close.type='button';
    close.setAttribute('aria-label','Закрыть: '+title.toLocaleLowerCase('ru-RU'));
    close.addEventListener('click',()=>dialog.close());
    head.append(heading,close);
    const body=node('div','bali-menu-details-body');body.id=prefix+'DetailsBody';
    dialog.append(head,body);
    dialog.addEventListener('click',event=>{if(event.target===dialog)dialog.close();});
    document.body.append(dialog);dialogs.set(kind,dialog);
  }
  const body=dialog.querySelector('.bali-menu-details-body');body.replaceChildren();
  body.append(node('h2','bali-menu-details-name',item.name));
  const prices=[[item.volume1,item.price1],[item.volume2,item.price2]].filter(([volume])=>volume);
  body.append(node('strong','bali-menu-details-price',prices.map(([volume,value])=>
    (volume==='Порция'||volume==='Цена'?'':volume+' · ')+money.format(value)+' BYN').join(' / ')));
  for(const [label,key]of fields){
    const value=typeof item[key]==='string'?item[key].trim():'';
    if(value)body.append(node('h3','bali-menu-details-label',label),node('p','bali-menu-details-copy',value));
  }
  if(!dialog.open)dialog.showModal();
}
