const {test,expect}=require('@playwright/test');
const fs=require('node:fs');
const admin=fs.readFileSync('admin.html','utf8').replace(/<script\b[^>]*>[\s\S]*?<\/script>/g,tag=>/src="(?:firebase-config|admin-dashboard|bali-design-studio|bali-builder-core|bali-builder-admin)\.js/.test(tag)?tag:'');
const guest=fs.readFileSync('index.html','utf8').replace(/<script\b[^>]*>[\s\S]*?<\/script>/g,'').replace('class="bali-await-content"','');
const fixture=`
 const store={};window.__builderStore=store;window.__builderWrites=[];
 export const getFirestore=()=>({});export const doc=(db,...parts)=>({path:parts.join('/')});
 const snap=ref=>({exists:()=>ref.path.startsWith('admins/')||Boolean(store[ref.path]),data:()=>ref.path.startsWith('admins/')?{active:true}:structuredClone(store[ref.path])});
 export const getDoc=async ref=>snap(ref);
 export const onSnapshot=(ref,next,error)=>{window.__draftReady=()=>next(snap(ref));window.__draftFail=()=>error({code:'unavailable'});return ()=>{};};
 export const serverTimestamp=()=>1;
 export const setDoc=async(ref,data)=>new Promise((resolve,reject)=>{window.__builderWrites.push({path:ref.path,data});window.__finishWrite=()=>{store[ref.path]=structuredClone(data);resolve()};window.__failWrite=()=>reject({code:'unavailable'});});
 export const writeBatch=()=>{const batch=[];return {set:(ref,data)=>batch.push({path:ref.path,data}),commit:async()=>{window.__builderWrites.push(...batch);for(const item of batch)store[item.path]=structuredClone(item.data);}};};
`;
async function open(page,{ready=true}={}){
 await page.route('**/*',r=>new URL(r.request().url()).hostname==='127.0.0.1'?r.continue():r.abort());
 await page.route('**/admin.html',r=>r.fulfill({contentType:'text/html',body:admin}));
 await page.route('**/index.html?bali-admin-design-preview=1',r=>r.fulfill({contentType:'text/html',body:guest}));
 await page.route('https://www.gstatic.com/firebasejs/10.14.1/firebase-app.js',r=>r.fulfill({contentType:'text/javascript',body:'export const getApps=()=>[];export const getApp=()=>({});export const initializeApp=()=>({});'}));
 await page.route('https://www.gstatic.com/firebasejs/10.14.1/firebase-auth.js',r=>r.fulfill({contentType:'text/javascript',body:`
 const auth={currentUser:{uid:'fixture-admin',emailVerified:true}};
 export const getAuth=()=>auth;export const onAuthStateChanged=(a,cb)=>{window.__changeBuilderUser=user=>{auth.currentUser=user;return cb(user)};queueMicrotask(()=>cb(auth.currentUser));return ()=>{};};`}));
 await page.route('https://www.gstatic.com/firebasejs/10.14.1/firebase-firestore.js',r=>r.fulfill({contentType:'text/javascript',body:fixture}));
 await page.goto('/admin.html');
 await page.waitForFunction(()=>Boolean(window.__draftReady));
 await page.evaluate(()=>{document.getElementById('loginView').hidden=true;document.getElementById('adminView').hidden=false;});
 if(ready)await page.evaluate(()=>window.__draftReady());
}
async function design(page){
 await page.locator('[data-admin-tab="design"]').click();
 await expect(page.frameLocator('#baliDesignLiveFrame').locator('#baliPcAboutTitle')).toBeAttached();
}
async function edit(page,text){
 await page.locator('#baliBuilderHomeBlock').selectOption('#baliPcAboutTitle');
 const input=page.locator('[data-builder-main="text"]');
 await input.fill(text);await input.press('Tab');
}

test('navigation uses labelled SVG icons and defers the preview until opening the constructor',async({page})=>{
 const errors=[];page.on('pageerror',e=>errors.push(e.message));
 await open(page);
 expect(await page.locator('#baliDesignLiveFrame').getAttribute('src')).toBeNull();
 await expect(page.locator('.admin-tab .bali-ui-icon')).toHaveCount(7);
 for(const section of ['menu','events','clients','appearance','overview']){
  await page.locator(`[data-admin-tab="${section}"]`).click();
  await expect(page.locator(`[data-admin-panel="${section}"]`)).toBeVisible();
  await expect(page.locator('[data-admin-panel]:visible')).toHaveCount(1);
 }
 await design(page);
 await page.frameLocator('#baliDesignLiveFrame').locator('#baliPcAboutTitle').dispatchEvent('dblclick');
 await expect(page.locator('[data-builder-main="text"]')).toBeFocused();
 expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1)).toBe(true);
 expect(errors).toEqual([]);
});

test('draft loading blocks editing; failure cannot publish an empty model',async({page})=>{
 await open(page,{ready:false});await design(page);
 await expect(page.locator('#baliBuilderPublish')).toBeDisabled();
 await expect(page.locator('#baliBuilderHomeBlock')).toBeDisabled();
 await page.evaluate(()=>window.__draftFail());
 await expect(page.locator('#baliBuilderStatus')).toContainText('Не удалось загрузить');
 await expect(page.locator('#baliBuilderPublish')).toBeDisabled();
 expect(await page.evaluate(()=>window.__builderWrites)).toEqual([]);
});

test('real constructor edits undo redo and publish one atomic draft/public pair',async({page})=>{
 await open(page);await design(page);await edit(page,'Новый логотип');
 const brand=page.frameLocator('#baliDesignLiveFrame').locator('#baliPcAboutTitle');
 await expect(brand).toContainText('Новый логотип');
 await page.locator('#baliBuilderUndo').click();await expect(brand).not.toContainText('Новый логотип');
 await page.locator('#baliBuilderRedo').click();await expect(brand).toContainText('Новый логотип');
 await page.locator('#baliBuilderPublish').click();
 await expect(page.locator('#baliBuilderStatus')).toContainText('Опубликовано');
 const writes=await page.evaluate(()=>window.__builderWrites);
 expect(writes.map(x=>x.path)).toEqual(['settings/siteBuilderPublished','settings/siteBuilderDraft']);
 expect(writes[0].data.desktop.rules['#baliPcAboutTitle'].text).toBe('Новый логотип');
 expect(writes[0].data.phone.rules).toEqual({});
 expect(writes[0].data).toEqual(writes[1].data);
});

test('failed save preserves the draft; account switch clears history and ignores an old completion',async({page})=>{
 await open(page);await design(page);await edit(page,'Сохранить этот текст');
 await page.locator('#baliBuilderSaveDraft').click();
 await expect(page.locator('[data-builder-main="text"]')).toBeDisabled();
 await page.evaluate(()=>window.__failWrite());
 await expect(page.locator('#baliBuilderStatus')).toContainText('Ошибка сохранения');
 await expect(page.locator('#baliBuilderSaveDraft')).toBeEnabled();
 await page.locator('#baliBuilderSaveDraft').click();
 await page.evaluate(()=>window.__changeBuilderUser(null));
 await page.evaluate(()=>window.__finishWrite());
 await expect(page.locator('#baliBuilderStatus')).toContainText('Войдите');
 await expect(page.locator('#baliBuilderUndo')).toBeDisabled();
 await expect(page.locator('#baliBuilderPublish')).toBeDisabled();
 await expect(page.frameLocator('#baliDesignLiveFrame').locator('#baliPcAboutTitle')).not.toContainText('Сохранить этот текст');
});

test('copy settings offers Russian device names and keeps other devices independent',async({page})=>{
 await open(page);await design(page);await edit(page,'Для планшета');
 await page.locator('#baliBuilderCopy').click();
 await expect(page.locator('#baliBuilderCopyDialog')).toBeVisible();
 await page.locator('#baliBuilderCopyTarget').selectOption('tablet');
 await page.locator('#baliBuilderCopyConfirm').click();
 await expect(page.locator('#baliBuilderCopyDialog')).toBeHidden();
 await page.locator('[data-studio-device="tablet"]').click();
 await expect(page.frameLocator('#baliDesignLiveFrame').locator('#baliPcAboutTitle')).toContainText('Для планшета');
 await page.locator('[data-studio-device="phone"]').click();
 await expect(page.frameLocator('#baliDesignLiveFrame').locator('#baliPcAboutTitle')).not.toContainText('Для планшета');
 await page.locator('#baliBuilderPublish').click();
 const data=await page.evaluate(()=>window.__builderStore['settings/siteBuilderPublished']);
 expect(data.tablet.rules['#baliPcAboutTitle'].text).toBe('Для планшета');
 expect(data.phone.rules).toEqual({});
});

test('the promotion list renders saved slides and deletion works without an undefined builtin flag',async({page})=>{
 await page.route('**/*',r=>new URL(r.request().url()).hostname==='127.0.0.1'?r.continue():r.abort());
 const html=fs.readFileSync('admin.html','utf8').replace(/<script\b[^>]*>[\s\S]*?<\/script>/g,tag=>/src="(?:firebase-config|bali-admin-promos)\.js/.test(tag)?tag:'');
 await page.route('**/admin.html',r=>r.fulfill({contentType:'text/html',body:html}));
 await page.route('https://www.gstatic.com/firebasejs/10.14.1/firebase-app.js',r=>r.fulfill({contentType:'text/javascript',body:'export const getApps=()=>[];export const getApp=()=>({});export const initializeApp=()=>({});'}));
 await page.route('https://www.gstatic.com/firebasejs/10.14.1/firebase-auth.js',r=>r.fulfill({contentType:'text/javascript',body:'const auth={currentUser:{uid:"fixture-admin",emailVerified:true}};export const getAuth=()=>auth;export const onAuthStateChanged=(a,cb)=>{queueMicrotask(()=>cb(auth.currentUser));return ()=>{}};'}));
 await page.route('https://www.gstatic.com/firebasejs/10.14.1/firebase-firestore.js',r=>r.fulfill({contentType:'text/javascript',body:`
 export const getFirestore=()=>({});export const doc=(db,...parts)=>({path:parts.join('/')});export const collection=(db,path)=>({path});
 export const getDoc=async()=>({exists:()=>true,data:()=>({active:true})});
 export const onSnapshot=(ref,options,cb)=>{cb({docs:[{id:'saved-slide',data:()=>({title:'Сохранённая акция',description:'',imageUrl:'',destination:'none',buttonText:'',published:true,sort:0})}]});return ()=>{}};
 export const setDoc=async()=>{};export const serverTimestamp=()=>1;export const deleteDoc=async ref=>{window.__deletedSlide=ref.path};`}));
 const errors=[];page.on('pageerror',e=>errors.push(e.message));
 await page.goto('/admin.html');
 await page.evaluate(()=>{document.getElementById('loginView').hidden=true;document.getElementById('adminView').hidden=false;for(const panel of document.querySelectorAll('[data-admin-panel]'))panel.hidden=panel.dataset.adminPanel!=='design';for(const editor of document.querySelectorAll('[data-design-editor]'))editor.hidden=editor.dataset.designEditor!=='privilege';});
 await expect(page.locator('#baliPromoList')).toContainText('Сохранённая акция');
 await expect(page.locator('#baliPromoList button')).toHaveCount(2);
 await page.locator('#baliPromoList').getByRole('button',{name:'Изменить',exact:true}).dispatchEvent('click');
 await expect(page.locator('#baliPromoTitle')).toHaveValue('Сохранённая акция');
 page.once('dialog',d=>d.accept());
 await page.locator('#baliPromoList').getByRole('button',{name:'Удалить',exact:true}).dispatchEvent('click');
 await expect.poll(()=>page.evaluate(()=>window.__deletedSlide)).toBe('promotions/saved-slide');
 expect(errors).toEqual([]);
});

test('information and club pages stay usable when external data is unavailable',async({page})=>{
 await page.route('**/*',r=>new URL(r.request().url()).hostname==='127.0.0.1'?r.continue():r.abort());
 await page.goto('/index.html#contacts',{waitUntil:'domcontentloaded'});
 await expect(page.locator('#contactsSection')).toBeVisible();
 await expect(page.locator('#baliStartupOverlay')).toHaveCount(0);
 await expect(page.locator('#baliInfoScheduleHeading')).toBeVisible();
 await expect(page.locator('#contactsSection .bali-info-block-icon .bali-ui-icon')).toHaveCount(3);
 await page.goto('/about.html?embed=1',{waitUntil:'domcontentloaded'});
 await expect(page.locator('#contactblock .bali-ui-icon')).toHaveCount(6);
 expect(await page.locator('#contactblock .bali-ui-icon').first().evaluate(n=>n.getBoundingClientRect().width)).toBeLessThanOrEqual(24);
 expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1)).toBe(true);
});


test('restore reads the current publication and undo recovers the unsaved draft',async({page})=>{
 await open(page);await design(page);await edit(page,'Мои правки');
 await page.evaluate(()=>{
  const model=window.BaliBuilderCore.emptyModel();
  model.desktop.rules['#baliPcAboutTitle']={text:'Новая публикация другого сотрудника',props:{}};
  window.__builderStore['settings/siteBuilderPublished']=model;
 });
 page.once('dialog',d=>d.accept());
 await page.locator('#baliBuilderRestore').click();
 await expect(page.locator('#baliBuilderStatus')).toContainText('Опубликованная версия загружена');
 await expect(page.frameLocator('#baliDesignLiveFrame').locator('#baliPcAboutTitle')).toContainText('Новая публикация другого сотрудника');
 await page.locator('#baliBuilderUndo').click();
 await expect(page.frameLocator('#baliDesignLiveFrame').locator('#baliPcAboutTitle')).toContainText('Мои правки');
 expect(await page.evaluate(()=>window.__builderWrites)).toEqual([]);
});
