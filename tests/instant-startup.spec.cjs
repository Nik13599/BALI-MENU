const {test,expect}=require('@playwright/test');

const encode=value=>{
  if(value===null)return {nullValue:null};
  if(typeof value==='boolean')return {booleanValue:value};
  if(typeof value==='number')return Number.isInteger(value)?{integerValue:String(value)}:{doubleValue:value};
  if(typeof value==='string')return {stringValue:value};
  if(Array.isArray(value))return {arrayValue:{values:value.map(encode)}};
  return {mapValue:{fields:Object.fromEntries(Object.entries(value).map(([key,v])=>[key,encode(v)]))}};
};
const document=(id,data)=>({name:'projects/demo/databases/(default)/documents/'+id,fields:encode(data).mapValue.fields});
const promo={title:'Предложение клуба',description:'Текущее предложение',imageUrl:'',destination:'events',buttonText:'Мероприятия',sort:0,published:true};
const menu={id:1,name:'Свежая позиция',category:'Кухня',price:25,available:true};

async function slowSdk(page,{menuGate=false,cachedMenu=false}={}){
  let releaseSdk,releaseMenu;
  const sdkGate=new Promise(resolve=>releaseSdk=resolve);
  const dataGate=new Promise(resolve=>releaseMenu=resolve);
  if(cachedMenu)await page.addInitScript(row=>{
    localStorage.setItem('bali-public-v1:bali-menu-5a48b:menu',JSON.stringify({at:Date.now(),rows:[row]}));
  },document('menu/1',{...menu,name:'Сохранённая позиция',price:10}));
  await page.addInitScript(()=>document.addEventListener('DOMContentLoaded',()=>window.__domReady=true));
  const requests=[];
  await page.route('**/*',async route=>{
    const url=new URL(route.request().url());
    if(url.hostname==='127.0.0.1')return route.continue();
    if(url.hostname==='www.gstatic.com'){await sdkGate;return route.abort();}
    if(url.hostname==='firestore.googleapis.com'){
      if(!url.pathname.endsWith(':runQuery'))return route.fulfill({status:404,contentType:'application/json',body:'{}'});
      const body=route.request().postDataJSON();
      requests.push(body.structuredQuery);
      const name=body.structuredQuery.from[0].collectionId;
      if(name==='menu'&&menuGate)await dataGate;
      const event=document('events/2099-10-24',{date:'2099-10-24',title:'Будущая вечеринка',preorderEnabled:true});
      event.fields.closesAt={timestampValue:'2099-10-24T20:00:00Z'};
      const records=name==='promotions'?[document('promotions/current',promo)]:name==='menu'?[document('menu/1',menu)]:name==='events'?[event]:[];
      return route.fulfill({contentType:'application/json',body:JSON.stringify(records.map(document=>({document})))});
    }
    return route.abort();
  });
  return {releaseSdk,releaseMenu,requests};
}

test('home, navigation and current public data work before the Firebase SDK finishes',async({page})=>{
  const gate=await slowSdk(page);
  try{
    await page.goto('/index.html',{waitUntil:'commit'});
    await expect(page.locator('body')).toHaveAttribute('data-bali-page','home');
    await expect(page.locator('#baliPcOfferTitle')).toHaveText(promo.title);
    expect(await page.evaluate(()=>Boolean(window.__domReady))).toBe(false);
    const nav=page.viewportSize().width>=1180?'.bali-pc-navigation':'.bali-bottom-nav';
    await page.locator(nav+' [data-bali-nav="menu"]').click();
    await expect(page.locator('#menuGrid .menu-item-name')).toHaveText(menu.name);
    await expect(page.locator('#menuGrid .menu-item-price')).toContainText('25');
    expect(await page.evaluate(()=>availableEvents[0].closesAt.toDate().toISOString())).toBe('2099-10-24T20:00:00.000Z');
    await expect(page.locator('#homeSection')).not.toContainText(/загружа|получаем актуаль/i);
    await expect(page.locator('#menuGrid .spinner')).toHaveCount(0);
    const query=gate.requests.find(q=>q.from[0].collectionId==='promotions');
    expect(query.where.fieldFilter).toEqual({field:{fieldPath:'published'},op:'EQUAL',value:{booleanValue:true}});
    expect(await page.evaluate(()=>Object.keys(localStorage).some(key=>key.includes(':promotions')))).toBe(false);
  }finally{gate.releaseMenu();gate.releaseSdk();}
});

test('saved public menu appears while both network paths are pending, then refreshes',async({page})=>{
  const gate=await slowSdk(page,{menuGate:true,cachedMenu:true});
  try{
    await page.goto('/index.html#menu',{waitUntil:'commit'});
    await expect(page.locator('#menuGrid .menu-item-name')).toHaveText('Сохранённая позиция');
    await expect(page.locator('#menuGrid .menu-item-price')).toContainText('10');
    expect(await page.evaluate(()=>Boolean(window.__domReady))).toBe(false);
    gate.releaseMenu();
    await expect(page.locator('#menuGrid .menu-item-name')).toHaveText(menu.name);
    await expect(page.locator('#menuGrid .menu-item-price')).toContainText('25');
  }finally{gate.releaseMenu();gate.releaseSdk();}
});

test('a late REST response cannot replace a newer live publication',async({page})=>{
  let releaseRest;
  const restGate=new Promise(resolve=>releaseRest=resolve);
  await page.route('**/*',async route=>{
    const url=new URL(route.request().url());
    if(url.hostname==='127.0.0.1')return route.continue();
    if(url.hostname==='firestore.googleapis.com'){
      await restGate;
      return route.fulfill({contentType:'application/json',body:JSON.stringify([{document:document('promotions/old',{...promo,title:'Старый ответ'})}])});
    }
    const modules={
      'firebase-app.js':'export const getApps=()=>[{}],getApp=()=>({}),initializeApp=()=>({});',
      'firebase-firestore.js':`export const getFirestore=()=>({}),collection=(_,path)=>path,query=ref=>ref,where=()=>({});export const onSnapshot=(ref,options,next)=>{if(ref==='promotions')next({metadata:{fromCache:false},docs:[{id:'latest',data:()=>(${JSON.stringify(promo)})}]});return ()=>{};};`
    };
    const body=modules[url.pathname.split('/').at(-1)];
    return body?route.fulfill({contentType:'text/javascript',body}):route.abort();
  });
  await page.route('**/reader-fixture.html',r=>r.fulfill({contentType:'text/html',body:'<script src="/firebase-config.js"></script><script type="module">import {onSnapshot,collection,query,where} from "/bali-public-reader.js";onSnapshot(query(collection(null,"promotions"),where("published","==",true)),{},snap=>window.__title=snap.docs[0].data().title);</script>'}));
  try{
    await page.goto('/reader-fixture.html');
    await expect.poll(()=>page.evaluate(()=>window.__title)).toBe(promo.title);
    releaseRest();
    await page.evaluate(()=>new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve))));
    expect(await page.evaluate(()=>window.__title)).toBe(promo.title);
  }finally{releaseRest();}
});
