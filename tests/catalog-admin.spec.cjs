const {test,expect}=require('@playwright/test');
const fs=require('node:fs');
// Keep real forms/editors, replacing only Firebase transport and unrelated app modules.
// These fixtures never authenticate against or write to the production database.
const html=fs.readFileSync('admin.html','utf8').replace(/<script\b[^>]*>[\s\S]*?<\/script>/g,tag=>/src="(?:firebase-config|admin-firestore|bali-admin-bar|bali-admin-cards)\.js/.test(tag)?tag:'');
const item={name:'Позиция для проверки',category:'Категория',volume1:'Порция',price1:25,volume2:'',price2:0,sort:1,description:'Старое описание',ingredients:''};
test.beforeEach(async({page})=>{
 await page.route('**/*',r=>new URL(r.request().url()).hostname==='127.0.0.1'?r.continue():r.abort());
 await page.route('**/admin.html',r=>r.fulfill({contentType:'text/html',body:html}));
 await page.route('https://www.gstatic.com/firebasejs/10.14.1/firebase-app.js',r=>r.fulfill({contentType:'text/javascript',body:'export const getApps=()=>[];export const getApp=()=>({});export const initializeApp=()=>({});'}));
 await page.route('https://www.gstatic.com/firebasejs/10.14.1/firebase-auth.js',r=>r.fulfill({contentType:'text/javascript',body:`
 const user={uid:'fixture-admin',emailVerified:true,email:'admin@example.test',providerData:[]};const auth={currentUser:user};
 export const getAuth=()=>auth;export const onAuthStateChanged=(a,cb)=>{queueMicrotask(()=>cb(user));return ()=>{};};
 export class GoogleAuthProvider{};export const signInWithPopup=async()=>({user});export const signOut=async()=>{};`}));
 await page.route('https://www.gstatic.com/firebasejs/10.14.1/firebase-firestore.js',r=>r.fulfill({contentType:'text/javascript',body:`
 const store=${JSON.stringify({'bar_menu/item':item,'hookah_menu/item':item,'tea_menu/item':item,'menu/1':{id:1,name:'Блюдо для проверки',category:'Закуски',price:25,available:true,sort:1,description:'Состав блюда',detailText:'Старое описание',detailEnabled:true}})};
 window.__adminStore=store;const listeners={};
 export const getFirestore=()=>({});export const collection=(db,name)=>({path:name});
 export const doc=(db,...parts)=>({path:[...(db.path?[db.path]:[]),...parts].join('/')||'fixture-new'});
 const snap=path=>({id:path.split('/').pop(),exists:()=>path.startsWith('admins/')||Boolean(store[path]),data:()=>path.startsWith('admins/')?{active:true}:structuredClone(store[path])});
 export const getDoc=async ref=>snap(ref.path);
 const snapshot=path=>({docs:Object.keys(store).filter(key=>key.startsWith(path+'/')).map(snap)});
 export const onSnapshot=(ref,cb)=>{(listeners[ref.path]??=[]).push(cb);cb(snapshot(ref.path));return ()=>{};};
 export const setDoc=async(ref,data,options)=>{store[ref.path]=structuredClone(options?.merge?{...store[ref.path],...data}:data);for(const cb of listeners[ref.path.split('/')[0]]||[])cb(snapshot(ref.path.split('/')[0]));};
 export const deleteDoc=async ref=>{delete store[ref.path];};export const serverTimestamp=()=>1;
 export const runTransaction=async(db,cb)=>cb({get:getDoc,set:setDoc});export const limit=n=>n;export const query=ref=>ref;
 export const Timestamp={fromDate:date=>date,now:()=>new Date()};
 export const writeBatch=()=>({set(){},commit:async()=>{}});
 `}));
 await page.goto('/admin.html');
 await expect(page.locator('#adminView')).toBeVisible();
 await page.evaluate(()=>{document.getElementById('adminMenuPanel').hidden=false;});
});
test('bar, hookah and tea descriptions can be edited, reopened and cleared in the real admin forms',async({page})=>{
 for(const [mode,host,collection]of [['bar','baliAdminBarPane','bar_menu'],['hookah','baliAdminHookahPane','hookah_menu'],['tea','baliAdminTeaPane','tea_menu']]){
  await page.locator(`[data-bali-catalog-tab="${mode}"]`).click();
  const pane=page.locator('#'+host);
  await pane.locator('.bali-admin-bar-row').first().getByRole('button',{name:'Изменить',exact:true}).click();
  const description=pane.locator(mode==='bar'?'#baliAdminBarDescription':'textarea[name="description"]');
  const ingredients=pane.locator(mode==='bar'?'#baliAdminBarIngredients':'textarea[name="ingredients"]');
  await expect(description).toHaveValue('Старое описание');
  await description.fill('Новое подробное описание');await ingredients.fill('Состав позиции');
  await expect(pane.locator('[role="status"]').filter({hasText:/После сохранения/})).toHaveCount(1);
  await pane.locator('button[type="submit"]').click();
  await expect(pane.locator('.status')).toContainText('Сохранено');
  expect(await page.evaluate(collection=>window.__adminStore[collection+'/item'].description,collection)).toBe('Новое подробное описание');
  await pane.locator('.bali-admin-bar-row').first().getByRole('button',{name:'Изменить',exact:true}).click();
  await expect(description).toHaveValue('Новое подробное описание');await expect(ingredients).toHaveValue('Состав позиции');
  await description.fill('');await ingredients.fill('');
  await expect(pane.locator('[role="status"]').filter({hasText:/не показывается/})).toHaveCount(1);
  await pane.locator('button[type="submit"]').click();await expect(pane.locator('.status')).toContainText('Сохранено');
  expect(await page.evaluate(collection=>Boolean(window.__adminStore[collection+'/item'].description||window.__adminStore[collection+'/item'].ingredients),collection)).toBe(false);
 }
});
test('kitchen admin description controls guest details without a separate switch',async({page})=>{
 await page.locator('#menuList').getByRole('button',{name:'Изменить',exact:true}).first().click();
 const dialog=page.locator('#menuDialog');
 await expect(page.locator('#menuDetailsText')).toHaveValue('Старое описание');
 await page.locator('#menuDetailsText').fill('Обновлённое подробное описание');
 await expect(page.locator('#menuDetailsAvailability')).toContainText('появится после сохранения');
 await dialog.getByRole('button',{name:'Сохранить товар',exact:true}).click();await expect(dialog).toBeHidden();
 expect(await page.evaluate(()=>window.__adminStore['menu/1'].detailText)).toBe('Обновлённое подробное описание');
 await page.locator('#menuList').getByRole('button',{name:'Изменить',exact:true}).first().click();
 await page.locator('#menuDetailsText').fill('');await expect(page.locator('#menuDetailsAvailability')).toContainText('скрыта');
 await dialog.getByRole('button',{name:'Сохранить товар',exact:true}).click();await expect(dialog).toBeHidden();
 expect(await page.evaluate(()=>({text:window.__adminStore['menu/1'].detailText,enabled:window.__adminStore['menu/1'].detailEnabled}))).toEqual({text:'',enabled:false});
});

test('admin creates three different parties on the same date, with independent artwork, dot colors and IDs',async({page})=>{
  await page.evaluate(()=>{document.getElementById('adminEventsPanel').hidden=false});
  const create=async(slot,name,color)=>{
    await page.locator('#eventDateAdmin').fill('2026-12-31');
    await page.locator('#eventSlotAdmin').selectOption(String(slot));
    await page.locator('#eventTitle').fill(name);
    await page.locator('#eventDotColor').fill(color);
    await page.locator('#eventCutoff').fill('23:59');
    await expect(page.locator('#eventOpen')).toBeEnabled();
    await page.locator('#eventForm button[type="submit"]').click();
    await expect(page.locator('#eventStatus')).toContainText('сохранено');
  };
  await create(1,'Новый год — BALI Main','#b9ff51');
  await create(2,'Новый год — BALI VIP','#ff8800');
  await create(3,'Новый год — BALI Afterparty','#aa44ff');
  const stored=await page.evaluate(()=>Object.fromEntries(
    Object.entries(window.__adminStore).filter(([key])=>key.startsWith('events/'))));
  expect(Object.keys(stored).sort()).toEqual(['events/2026-12-31','events/2026-12-31__2','events/2026-12-31__3']);
  expect(stored['events/2026-12-31'].title).toBe('Новый год — BALI Main');
  expect(stored['events/2026-12-31__2'].dotColor).toBe('#ff8800');
  expect(stored['events/2026-12-31__3'].dotColor).toBe('#aa44ff');
  expect(stored['events/2026-12-31__2'].preorderEnabled).toBe(true);
  expect(stored['events/2026-12-31__3'].preorderEnabled).toBe(true);
  // Trying the same slot twice must NOT overwrite an existing party.
  await page.locator('#eventDateAdmin').fill('2026-12-31');
  await page.locator('#eventSlotAdmin').selectOption('2');
  await page.locator('#eventTitle').fill('Попытка перезаписи');
  await page.locator('#eventForm button[type="submit"]').click();
  await expect(page.locator('#eventStatus')).toContainText('уже создано');
  expect(await page.evaluate(()=>window.__adminStore['events/2026-12-31__2'].title))
    .toBe('Новый год — BALI VIP');
});
