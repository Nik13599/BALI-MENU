const {test,expect}=require('@playwright/test');
const AxeBuilder=require('@axe-core/playwright').default;
const bar=Array.from({length:8},(_,i)=>({name:i?'Напиток '+(i+1):'Напиток с длинным названием',category:i<6?'НАПИТКИ':'БЕЗАЛКОГОЛЬНОЕ',volume1:'50 мл',price1:12.5,volume2:'100 мл',price2:25,sort:i,description:i?'  ':'Подробное описание напитка',ingredients:i?'':'Ягоды и травы'}));
const hookah=[{name:'Кальянная композиция',category:'КЛАССИКА',volume1:'Стандарт',price1:60,volume2:'Премиум',price2:80,sort:1,description:'Подробное описание кальяна',ingredients:'Смесь по карте'},{name:'Авторская композиция',category:'АВТОРСКИЕ',volume1:'Порция',price1:75,volume2:'',price2:0,sort:2}];
test.beforeEach(async({page})=>{
 await page.route('**/*',r=>new URL(r.request().url()).hostname==='127.0.0.1'?r.continue():r.abort());
 await page.route('https://www.gstatic.com/firebasejs/10.14.1/firebase-app.js',r=>r.fulfill({contentType:'text/javascript',body:'export const getApps=()=>[];export const getApp=()=>({});export const initializeApp=()=>({});'}));
 await page.route('https://www.gstatic.com/firebasejs/10.14.1/firebase-firestore.js',r=>r.fulfill({contentType:'text/javascript',body:`
 export const getFirestore=()=>({});export const collection=(db,name)=>name;
 const data=${JSON.stringify({bar_menu:bar,hookah_menu:hookah})};
 const listeners={};const snapshot=q=>({docs:(data[q]||[]).map((item,i)=>({id:String(i),data:()=>item}))});
 window.__setCatalogItem=(name,index,changes)=>{Object.assign(data[name][index],changes);listeners[name]?.(snapshot(name));};
 export const onSnapshot=(q,cb)=>{listeners[q]=cb;cb(snapshot(q));return ()=>{};};`}));
 await page.goto('/index.html#menu');
 await page.evaluate(()=>{
  window.BaliAgeGate={confirm:async()=>true};
  window.BaliAuth={requireProfile:async()=>true,isRegistered:()=>true,getProfile:()=>({uid:'fixture-only'})};
  window.BaliOrders={maxItems:12};
  window.dispatchEvent(new CustomEvent('bali:menu',{detail:{items:[
   {id:1,name:'Блюдо с описанием',category:'Закуски',price:12.5,weight:'200 г',available:true,description:'Сыр, виноград',detailText:'Подробный состав и подача блюда'},
   {id:2,name:'Блюдо без описания',category:'Закуски',price:20,available:true}
  ]}}));
 });
});
test('all catalogs share typography and grid; informational maps retain each portion and have no ordering controls',async({page})=>{
 test.setTimeout(45000);
 const styles=[];
 for(const [mode,list] of [['kitchen','menuGrid'],['bar','baliBarList'],['hookah','baliHookahList'],['tea','baliTeaList']]){
  await page.locator(`[data-bali-menu-mode="${mode}"]`).click();
  const host=page.locator('#'+list),cards=host.locator('.bali-catalog-card');
  await expect(cards.first()).toBeVisible();
  styles.push(await cards.first().evaluate(n=>{
   const c=getComputedStyle(n),name=getComputedStyle(n.querySelector('.menu-item-name')),price=getComputedStyle(n.querySelector('.menu-item-price'));
   return {background:c.backgroundColor,border:c.borderRadius,font:name.fontFamily,size:name.fontSize,weight:name.fontWeight,price:price.fontSize};
  }));
  const grid=host.locator('.menu-category-products').first();
  if(page.viewportSize().width>=768)expect(await grid.evaluate(n=>getComputedStyle(n).gridTemplateColumns.split(' ').length)).toBe(page.viewportSize().width>=1180?6:3);
  else expect(await grid.evaluate(n=>getComputedStyle(n).flexDirection)).toBe('column');
  expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);
  await expect(page.locator('#baliMenuSearch')).toBeHidden();
  await expect(host.locator('.menu-details-btn')).toHaveCount(0);
  if(mode!=='kitchen'){
   await expect(host.locator('[data-menu-action],.menu-quantity,.add-to-cart-btn')).toHaveCount(0);
   await expect(page.locator('#baliCartDock')).toBeHidden();
   if(mode!=='tea'){
    await expect(cards.first().locator('.bali-menu-portion')).toHaveCount(2);
    const portions=cards.first().locator('.bali-menu-portion');
    await expect(portions.first()).toContainText(mode==='bar'?'50 мл':'Стандарт');
    await expect(portions.first().locator('.bali-menu-amount')).toHaveText(mode==='bar'?'12,5':'60');
    await expect(portions.nth(1)).toContainText(mode==='bar'?'100 мл':'Премиум');
    await expect(portions.nth(1).locator('.bali-menu-amount')).toHaveText(mode==='bar'?'25':'80');
    await expect(cards.first().locator('.bali-menu-readmore')).toHaveCount(1);
    await expect(cards.nth(1).locator('button')).toHaveCount(0);
    await page.locator(mode==='bar'?'[data-bar-category="БЕЗАЛКОГОЛЬНОЕ"]':'[data-extra-menu-category="АВТОРСКИЕ"]').click();
    await expect(cards).toHaveCount(mode==='bar'?2:1);
   }
   const results=await new AxeBuilder({page}).withTags(['wcag2a','wcag2aa','wcag21aa']).analyze();
   expect(results.violations).toEqual([]);
  }
 }
 for(const style of styles)expect(style).toEqual(styles[0]);
});
test('kitchen details and quantity controls share one cart across catalog switches',async({page})=>{
 const first=page.locator('#menuGrid .bali-catalog-card').first();
 await expect(page.locator('#menuGrid .bali-menu-readmore')).toHaveCount(1);
 await first.locator('[data-menu-action="plus"]').click();
 await first.locator('[data-menu-action="details"]').click();
 const dialog=page.locator('#baliMenuDetailsDialog');
 await expect(dialog).toBeVisible();
 await expect(dialog).toContainText('Подробный состав и подача блюда');
 await expect(dialog.locator('.bali-menu-details-count')).toHaveText('2');
 await dialog.locator('.bali-menu-details-add').click();
 await expect(dialog).toBeHidden();
 await expect(page.locator('#baliDockCount')).toHaveText('2');
 for(const mode of ['bar','hookah','tea']){
  await page.locator(`[data-bali-menu-mode="${mode}"]`).click();
  await expect(page.locator('#baliCartDock')).toBeHidden();
  await expect(page.locator('#baliDockCount')).toHaveText('2');
 }
 await page.locator('[data-bali-menu-mode="kitchen"]').click();
 await expect(page.locator('#baliDockCount')).toHaveText('2');
 await expect(first.locator('.menu-quantity-value')).toHaveText('2');
});
test('kitchen photos fit cards and failed photos collapse without covering purchase controls',async({page})=>{
 await page.route('**/missing-dish.webp',r=>r.fulfill({status:404,body:''}));
 await page.evaluate(()=>window.dispatchEvent(new CustomEvent('bali:menu',{detail:{items:[
  {id:1,name:'Блюдо с фото',category:'Кухня',price:10,available:true,image_url:location.origin+'/assets/about/photos/IMG_1891-320.webp'},
  {id:2,name:'Блюдо с недоступным фото',category:'Кухня',price:20,available:true,image_url:location.origin+'/missing-dish.webp'}
 ]}})));
 const first=page.locator('#menuGrid .bali-catalog-card').first(),second=page.locator('#menuGrid .bali-catalog-card').nth(1);
 await expect(first.locator('img')).toBeVisible();
 expect(await first.locator('img').evaluate(n=>n.complete&&n.naturalWidth>0)).toBe(true);
 expect(await first.evaluate(n=>n.querySelector('img').getBoundingClientRect().width<=n.getBoundingClientRect().width)).toBe(true);
 await expect(second.locator('img')).toHaveCount(0);
 await expect(second).toHaveClass(/menu-item--no-image/);
 await first.locator('[data-menu-action="plus"]').click();
 await first.locator('[data-menu-action="add"]').click();
 await expect(page.locator('#baliDockCount')).toHaveText('2');
 expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);
});

test('bar and hookah details are conditional, read-only and disappear after the description is cleared',async({page})=>{
 for(const [mode,list,collection,dialogId,copy]of [
  ['bar','baliBarList','bar_menu','baliBarDetailsDialog','Подробное описание напитка'],
  ['hookah','baliHookahList','hookah_menu','baliHookahDetailsDialog','Подробное описание кальяна']]){
  await page.locator(`[data-bali-menu-mode="${mode}"]`).click();
  const cards=page.locator('#'+list+' .bali-catalog-card'),button=cards.first().locator('.bali-menu-readmore');
  await expect(cards.nth(1).locator('button')).toHaveCount(0);
  await cards.first().click({position:{x:20,y:20}});
  const dialog=page.locator('#'+dialogId);
  await expect(dialog).toBeVisible();await expect(dialog).toContainText(copy);
  await expect(dialog).toContainText(mode==='bar'?'50 мл · 12,5 BYN':'Стандарт · 60 BYN');
  await expect(dialog.locator('[data-menu-action],.bali-menu-details-actions,.bali-menu-details-add')).toHaveCount(0);
  await page.keyboard.press('Escape');await expect(dialog).toBeHidden();await expect(button).toBeFocused();
  await page.evaluate(collection=>window.__setCatalogItem(collection,0,{description:'  ',ingredients:''}),collection);
  await expect(cards.first().locator('button')).toHaveCount(0);
  await page.evaluate(collection=>window.__setCatalogItem(collection,0,{ingredients:'<img src=x onerror=alert(1)>'}),collection);
  await button.click();await expect(dialog).toContainText('<img src=x onerror=alert(1)>');await expect(dialog.locator('img')).toHaveCount(0);
  await dialog.getByRole('button',{name:/Закрыть/}).click();await expect(dialog).toBeHidden();
 }
});
