/* Shared presentation for informational catalogs. No cart or checkout actions. */
export const node=(tag,className,text)=>{
  const element=document.createElement(tag);
  if(className)element.className=className;
  if(text!==undefined)element.textContent=text;
  return element;
};
export const categoryLabel=value=>value===value.toLocaleUpperCase('ru-RU')?value.slice(0,1)+value.slice(1).toLocaleLowerCase('ru-RU'):value;
const money=new Intl.NumberFormat('ru-RU',{maximumFractionDigits:2});
export function catalogCard(item,{tea=false,onDetails}={}){
  const card=node('article','menu-item bali-catalog-card menu-item--no-image'+(tea?' bali-tea-item':''));
  const inner=node('div','menu-item-content');
  const header=node('div','menu-item-header');
  header.append(node('h3','menu-item-name',item.name));
  const portions=node('div','bali-menu-portions');
  for(const [volume,value] of [[item.volume1,item.price1],[item.volume2,item.price2]]){
    if(!volume)continue;
    const portion=node('div','bali-menu-portion');
    if(volume!=='Порция'&&volume!=='Цена')portion.append(node('span','bali-menu-volume',volume));
    const price=node('span','menu-item-price');
    price.append(node('span','bali-menu-amount'+(tea?' bali-tea-amount':''),money.format(value)),node('small','bali-menu-currency'+(tea?' bali-tea-currency':''),'BYN'));
    portion.append(price);portions.append(portion);
  }
  header.append(portions);inner.append(header);
  if(onDetails){
    card.classList.add('has-tea-details');
    const more=node('button','bali-menu-readmore bali-tea-readmore','Подробнее о чае');
    more.type='button';more.setAttribute('aria-label','Подробнее о чае: '+item.name);
    const arrow=node('span','','→');arrow.setAttribute('aria-hidden','true');more.append(arrow);
    more.addEventListener('click',onDetails);inner.append(more);
  }else{
    const space=node('span','bali-tea-footer-space');space.setAttribute('aria-hidden','true');inner.append(space);
  }
  card.append(inner);return card;
}
export function catalogGroup(category,items,render=catalogCard){
  const group=node('section','menu-category-block');
  group.setAttribute('aria-label',category);
  const heading=node('div','menu-category-heading');
  heading.append(node('h3','menu-category-title',categoryLabel(category)));
  const count=items.length,mod10=count%10,mod100=count%100;
  const ending=mod10===1&&mod100!==11?'позиция':(mod10>=2&&mod10<=4&&(mod100<12||mod100>14)?'позиции':'позиций');
  heading.append(node('span','menu-category-count',count+' '+ending));
  const grid=node('div','menu-grid menu-category-products');
  for(const item of items)grid.append(render(item));
  group.append(heading,grid);return group;
}
