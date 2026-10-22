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
    localStorage.setItem('bali-public-v2:bali-menu-5a48b:menu',JSON.stringify({at:Date.now(),rows:[{id:'1',record:{id:1,name:'Сохранённая позиция',category:'Кухня',price:10,available:true}}]}));
  },document('menu/1',{...menu,name:'Сохранённая позиция',price:10}));
  await page.addInitScript(()=>document.addEventListener('DOMContentLoaded',()=>window.__domReady=true));
  const requests=[];
  await page.route('**/*',async route=>{
    const url=new URL(route.request().url());
    if(url.hostname==='127.0.0.1'&&url.pathname==='/api/public-data'){
      const name=url.searchParams.get('path');
      if(name==='menu'&&menuGate)await dataGate;
      const event=document('events/2099-10-24',{date:'2099-10-24',title:'Будущая вечеринка',preorderEnabled:true});
      event.fields.closesAt={timestampValue:'2099-10-24T20:00:00Z'};
      const records=name==='promotions'?[document('promotions/current',promo)]:name==='menu'?[document('menu/1',menu)]:name==='events'?[event]:[];
      requests.push({from:[{collectionId:name}],...(name==='promotions'?{where:{fieldFilter:{field:{fieldPath:'published'},op:'EQUAL',value:{booleanValue:true}}}}:{})});
      return route.fulfill({status:200,contentType:'application/json',body:JSON.stringify({documents:records})});
    }
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
    await page.locator('[data-bali-menu-mode="bar"]').click();
    await expect(page.locator('#baliAgeGate')).toBeVisible();
    await page.locator('#baliAgeGate [data-age-answer="yes"]').click();
    await expect(page.locator('[data-bali-menu-mode="bar"]')).toHaveAttribute('aria-pressed','true');
    // Startup first-paint timing was already asserted above. After a complete
    // menu navigation and modal interaction DOMContentLoaded may legitimately
    // have fired, especially under parallel 4-device CI tests.
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

test('a direct ID link keeps its login gate when authentication loads later',async({page})=>{
  const gate=await slowSdk(page);
  try{
    await page.goto('/index.html#id',{waitUntil:'commit'});
    await expect(page.locator('body')).toHaveAttribute('data-bali-page','home');
    await page.evaluate(()=>{
      window.__idRequests=0;
      window.BaliIdOnboarding={isAccepted:()=>false,open:async()=>{window.__idRequests++;return false;}};
      window.dispatchEvent(new Event('bali:id-onboarding-ready'));
    });
    expect(await page.evaluate(()=>window.__idRequests)).toBe(1);
    await expect(page.locator('#baliIdSection')).toBeHidden();
  }finally{gate.releaseMenu();gate.releaseSdk();}
});

test('published Cloudflare data loads without guest Firebase subscriptions',async({page})=>{
  let edgeReads=0,sdkRequests=0;
  await page.route('**/*',async route=>{
    const url=new URL(route.request().url());
    if(url.hostname==='127.0.0.1'&&url.pathname==='/api/public-data'){
      edgeReads++;
      return route.fulfill({status:200,contentType:'application/json',
        body:JSON.stringify({documents:[document('menu/1',menu)]})});
    }
    if(url.hostname==='127.0.0.1')return route.continue();
    if(url.hostname==='www.gstatic.com')sdkRequests++;
    return route.abort();
  });
  await page.route('**/reader-fixture.html',r=>r.fulfill({contentType:'text/html',
    body:'<script src="/firebase-config.js"></script><script type="module">import {onSnapshot,collection} from "/bali-public-reader.js";window.__off=onSnapshot(collection(null,"menu"),snap=>window.__name=snap.docs[0]?.data().name);</script>'}));
  await page.goto('/reader-fixture.html');
  await expect.poll(()=>page.evaluate(()=>window.__name)).toBe(menu.name);
  const count=edgeReads;
  await page.waitForTimeout(300);
  expect(edgeReads).toBe(count);
  expect(sdkRequests).toBe(0);
  expect(await page.evaluate(()=>JSON.parse(localStorage.getItem('bali-public-v2:bali-menu-5a48b:menu')).rows[0].record.name)).toBe(menu.name);
  await page.evaluate(()=>window.__off());
});

test('when Cloudflare public endpoint is missing, the old secure Firebase fallback remains',async({page})=>{
  const fallbackNames=[];
  await page.route('**/*',async route=>{
    const url=new URL(route.request().url());
    if(url.hostname==='127.0.0.1'&&url.pathname==='/api/public-data')
      return route.fulfill({status:404,contentType:'application/json',body:'{}'});
    if(url.hostname==='127.0.0.1')return route.continue();
    const modules={
      'firebase-app.js':'export const getApps=()=>[{}],getApp=()=>({}),initializeApp=()=>({});',
      'firebase-firestore.js':`export const getFirestore=()=>({}),collection=(_,path)=>path,query=ref=>ref,where=()=>({});export const onSnapshot=(ref,next)=>{window.__fallback=true;next({metadata:{fromCache:false},docs:[{id:'1',data:()=>({id:1,name:'Свежая позиция',category:'Кухня',price:25,available:true})}]});return ()=>{window.__unsubscribe=true};};`
    };
    const name=url.pathname.split('/').at(-1),body=modules[name];
    if(body){fallbackNames.push(name);return route.fulfill({contentType:'text/javascript',body});}
    return route.abort();
  });
  await page.route('**/reader-fixture.html',r=>r.fulfill({contentType:'text/html',
    body:'<script src="/firebase-config.js"></script><script type="module">import {onSnapshot,collection} from "/bali-public-reader.js";window.__off=onSnapshot(collection(null,"menu"),snap=>window.__name=snap.docs[0]?.data().name);</script>'}));
  await page.goto('/reader-fixture.html');
  await expect.poll(()=>page.evaluate(()=>window.__name)).toBe(menu.name);
  expect(fallbackNames).toContain('firebase-firestore.js');
  await page.evaluate(()=>window.__off());
  expect(await page.evaluate(()=>window.__unsubscribe)).toBe(true);
});
