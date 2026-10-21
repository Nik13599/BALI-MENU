const {test,expect}=require('@playwright/test');
const fs=require('node:fs');

async function fixture(page,script){
  const html=fs.readFileSync('index.html','utf8').replace(/<script\b[^>]*>[\s\S]*?<\/script>/g,'');
  await page.addInitScript(()=>{
    window.BALI_FIREBASE_CONFIG={apiKey:'fixture',authDomain:'fixture.test',projectId:'demo-bali-menu',appId:'fixture'};
    window.__user=id=>({uid:id,email:id+'@example.test',emailVerified:true});
    window.__profile=id=>({uid:id,email:id+'@example.test',name:'Гость '+id,phone:'+375291234567'});
    window.__auth={currentUser:window.__user('a')};
    window.__reads=[];window.__writes=[];window.__gates={};window.__events=[];
    window.__snap=data=>({exists:()=>!!data,data:()=>data});
    window.__getDoc=async ref=>{
      window.__reads.push(ref.path);
      if(window.__gates[ref.path])return window.__gates[ref.path];
      if(ref.path.includes('/privacyConsents/'))return window.__snap({version:'2026-10-21',processing:true,international:true,acceptedAt:1});
      if(ref.path.includes('/privacyWithdrawals/'))return window.__snap(null);
      return window.__snap(window.__profile(ref.path.split('/').at(-1)));
    };
    window.__setUser=async id=>{window.__auth.currentUser=id?window.__user(id):null;return window.__authCallback(window.__auth.currentUser);};
    window.addEventListener('bali:orders',e=>window.__events.push(e.detail));
  });
  await page.route('**/*',async route=>{
    const url=new URL(route.request().url());
    if(url.hostname==='127.0.0.1')return route.continue();
    const modules={
      'firebase-app.js':'export const getApps=()=>[{}],getApp=()=>({}),initializeApp=()=>({});',
      'firebase-auth.js':`
        export const getAuth=()=>window.__auth;
        export const onAuthStateChanged=(auth,cb)=>{window.__authCallback=cb;queueMicrotask(()=>cb(auth.currentUser));return ()=>{};};
        export class GoogleAuthProvider{};
        export const signInWithPopup=async()=>{},signInWithRedirect=async()=>{},getRedirectResult=async()=>{};
        export const signOut=async()=>{if(window.__logoutFails)throw {code:'auth/network-request-failed'};await window.__setUser(null);};`,
      'firebase-firestore.js':`
        export const getFirestore=()=>({}),doc=(_, ...parts)=>({path:parts.join('/')}),collection=(ref,...parts)=>({path:[ref.path,...parts].filter(Boolean).join('/')});
        export const getDoc=ref=>window.__getDoc(ref),serverTimestamp=()=>1;
        export const setDoc=async(ref,data)=>window.__writes.push({path:ref.path,data}),updateDoc=setDoc;
        export const getDocs=ref=>window.__getDocs(ref);
        export const onSnapshot=(ref,cb)=>{window.__orderWatch=cb;return ()=>{};};
        export const query=ref=>ref,where=()=>({}),limit=()=>({}),writeBatch=()=>({}),runTransaction=()=>{};`
    };
    const body=modules[url.pathname.split('/').at(-1)];
    return body?route.fulfill({contentType:'text/javascript',body}):route.abort();
  });
  await page.route('**/runtime-fixture.html',r=>r.fulfill({contentType:'text/html',body:html.replace('</body>',`<script type="module" src="/${script}"></script></body>`)}));
  await page.goto('/runtime-fixture.html');
}

test('an old profile response cannot replace the next account profile',async({page})=>{
  await fixture(page,'auth.js');
  await expect.poll(()=>page.evaluate(()=>window.BaliAuth?.getProfile()?.uid)).toBe('a');
  await page.evaluate(()=>{
    window.__gates['users/a']=new Promise(resolve=>window.__releaseOld=()=>resolve(window.__snap(window.__profile('a'))));
    void window.__setUser('a');
  });
  await page.evaluate(()=>window.__setUser('b'));
  await page.evaluate(()=>window.__releaseOld());
  await expect.poll(()=>page.evaluate(()=>window.BaliAuth.getProfile()?.uid)).toBe('b');
  await expect(page.locator('#accountBtn')).toHaveText('Гость b');
});

test('switching accounts during a profile save prevents the old write',async({page})=>{
  await fixture(page,'auth.js');
  await expect.poll(()=>page.evaluate(()=>window.BaliAuth?.getProfile()?.uid)).toBe('a');
  await page.evaluate(()=>{
    window.__gates['users/a']=new Promise(resolve=>window.__releaseSave=()=>resolve(window.__snap(null)));
    document.getElementById('authName').value='Новое имя';
    document.getElementById('authPhone').value='+375291234567';
    document.getElementById('authProfileForm').dispatchEvent(new Event('submit',{bubbles:true,cancelable:true}));
  });
  await expect(page.locator('#authProfileForm button[type="submit"]')).toBeDisabled();
  await page.evaluate(()=>window.__setUser('b'));
  await page.evaluate(()=>window.__releaseSave());
  await expect(page.locator('#authProfileForm button[type="submit"]')).toBeEnabled();
  expect(await page.evaluate(()=>window.__writes)).toEqual([]);
  expect(await page.evaluate(()=>window.BaliAuth.getProfile().uid)).toBe('b');
});

test('logout network failure stays visible without an unhandled rejection',async({page})=>{
  const errors=[];page.on('pageerror',e=>errors.push(e.message));
  await fixture(page,'auth.js');
  await expect.poll(()=>page.evaluate(()=>window.BaliAuth?.getProfile()?.uid)).toBe('a');
  await page.evaluate(()=>{window.__logoutFails=true;document.getElementById('authSignOutBtn').click();});
  await expect(page.locator('#authMessage')).toContainText('Проверьте соединение');
  expect(errors).toEqual([]);
  expect(await page.evaluate(()=>window.BaliAuth.getProfile().uid)).toBe('a');
});

test('out of order order snapshots and logout cannot restore stale data',async({page})=>{
  await fixture(page,'orders-firestore.js');
  await expect.poll(()=>page.evaluate(()=>typeof window.__orderWatch)).toBe('function');
  await page.evaluate(()=>{
    const gates={};
    window.__getDocs=ref=>new Promise(resolve=>gates[ref.path]=()=>resolve({docs:[{data:()=>({name:ref.path,unitPrice:10,quantity:1})}]}));
    const send=(id,version)=>window.__orderWatch({docs:[{id,ref:{path:id},data:()=>({updatedAt:version,status:'pending'})}]});
    window.__first=send('old',1);window.__second=send('new',2);
    window.__gates=gates;
  });
  await expect.poll(()=>page.evaluate(()=>Object.keys(window.__gates).length)).toBe(2);
  await page.evaluate(async()=>{window.__gates['new/items']();await window.__second;});
  await page.evaluate(async()=>{window.__gates['old/items']();await window.__first;});
  expect(await page.evaluate(()=>window.__events.filter(x=>!x.loading).map(x=>x.orders.map(o=>o.id)))).toEqual([['new']]);
  await page.evaluate(()=>{
    window.__third=window.__orderWatch({docs:[{id:'pending',ref:{path:'pending'},data:()=>({updatedAt:3})}]});
  });
  await expect.poll(()=>page.evaluate(()=>typeof window.__gates['pending/items'])).toBe('function');
  await page.evaluate(async()=>{await window.__setUser(null);window.__gates['pending/items']();await window.__third;});
  expect(await page.evaluate(()=>window.__events.at(-1))).toMatchObject({ownerUid:null,orders:[]});
});

test('guest and admin load one stylesheet; calendar avoids scanning all events for each day',async({page})=>{
  await page.route('**/*',r=>new URL(r.request().url()).hostname==='127.0.0.1'?r.continue():r.abort());
  for(const path of ['/admin.html','/index.html#events']){
    await page.goto(path);
    await expect(page.locator('link[rel="stylesheet"]')).toHaveCount(1);
  }
  const calls=await page.evaluate(()=>{
    const events=Array.from({length:100},(_,i)=>({id:'event-'+i,date:'2099-10-24',title:'Вечеринка',startTime:'23:00',endTime:'06:00'}));
    // Count input reads instead of asserting a flaky wall-clock threshold.
    let dates=0;
    for(const event of events){const date=event.date;Object.defineProperty(event,'date',{get(){dates++;return date;}});}
    window.dispatchEvent(new CustomEvent('bali:events',{detail:{events}}));
    return dates;
  });
  expect(calls).toBeLessThan(2000);
});
