const {test,expect}=require('@playwright/test');
const fs=require('node:fs');

async function card(page,{delayedTier=false,allocationError=false,assignmentError=false,existingNumber=null,sdkDelay=false}={}){
  await page.addInitScript(({delayedTier,allocationError,assignmentError,existingNumber})=>{
    const uid='assigned-guest';
    window.__idAuth={currentUser:{uid,emailVerified:true}};
    window.BaliAuth={ready:Promise.resolve(),getProfile:()=>({uid,name:'Гость GOLD'}),isRegistered:()=>true};
    const state=window.__idTest={number:existingNumber,count:41,tier:'Gold',writes:[],allocations:0,reads:[],allocationError,assignmentError,observers:[]};
    const snapshot=value=>({exists:()=>value!==null,data:()=>value});
    const assignment=delayedTier?new Promise(resolve=>window.__resolveAssignedTier=()=>resolve(snapshot({uid,tier:state.tier,benefits:[]}))):null;
    window.__idGetDoc=async ref=>{
      state.reads.push(ref.path);
      if(ref.path.includes('/baliIdAgreements/'))return snapshot({version:1});
      if(ref.path==='baliIds/'+uid)return snapshot(state.number===null?null:{uid,number:state.number});
      if(ref.path==='privilegeRules/main')return snapshot(null);
      if(ref.path==='guestPrivileges/'+uid){
        if(state.assignmentError)throw Object.assign(Error('Unavailable'),{code:'unavailable'});
        return assignment||snapshot({uid,tier:state.tier,benefits:[]});
      }
      throw Error('Unexpected getDoc '+ref.path);
    };
    window.__idTransaction=async fn=>{
      state.allocations++;
      if(state.allocationError)throw Object.assign(Error('Denied'),{code:'permission-denied'});
      const writes=[];
      const value=await fn({
        get:async ref=>ref.path==='baliIds/'+uid?snapshot(state.number===null?null:{uid,number:state.number}):snapshot({count:state.count}),
        set:(ref,data)=>writes.push({path:ref.path,data})
      });
      for(const write of writes){
        state.writes.push(write);
        if(write.path.startsWith('baliIds/'))state.number=write.data.number;
        else state.count=write.data.count;
      }
      return value;
    };
    window.__idSnapshot=(ref,cb)=>{
      queueMicrotask(()=>cb(snapshot(ref.path==='privilegeRules/main'?null:{uid,tier:state.tier,benefits:[]})));
      return ()=>{};
    };
  },{delayedTier,allocationError,assignmentError,existingNumber});
  let releaseSdk;
  const sdkGate=new Promise(resolve=>releaseSdk=resolve);
  await page.route('**/*',async route=>{
    const url=new URL(route.request().url());
    if(url.hostname==='127.0.0.1')return route.continue();
    const name=url.pathname.split('/').pop();
    if(sdkDelay&&name==='firebase-auth.js')await sdkGate;
    const modules={
      'firebase-app.js':'export const getApps=()=>[{}], getApp=()=>({}), initializeApp=()=>({});',
      'firebase-auth.js':'export const getAuth=()=>window.__idAuth;export const onAuthStateChanged=(auth,cb)=>{window.__idTest.observers.push(cb);queueMicrotask(()=>cb(auth.currentUser));return ()=>{};};',
      'firebase-firestore.js':'export const getFirestore=()=>({}),doc=(_, ...parts)=>({path:parts.join("/")}),getDoc=ref=>window.__idGetDoc(ref),serverTimestamp=()=>({seconds:1}),runTransaction=(_,fn)=>window.__idTransaction(fn),onSnapshot=(ref,cb)=>window.__idSnapshot(ref,cb),setDoc=async()=>{throw Error("Assigned card must not create Member");};'
    };
    return modules[name]?route.fulfill({contentType:'text/javascript',body:modules[name]}):route.abort();
  });
  const html=fs.readFileSync('index.html','utf8');
  const head=html.match(/<head>([\s\S]*?)<\/head>/)[1].replace(/<script\b[^>]*>[\s\S]*?<\/script>/g,'');
  const start=html.indexOf('<section id="baliIdSection"');
  const end=html.indexOf('<!-- Guest benefit transfers',start);
  const section=html.slice(start,end).replace(/(<section id="baliIdSection"[^>]*?) hidden>/,'$1>');
  await page.route('**/id-fixture.html',r=>r.fulfill({contentType:'text/html',body:
    '<!doctype html><html lang="ru" data-bali-theme="lime"><head>'+head+'</head><body class="bali-guest-theme" data-bali-page="id">'+section+'<script type="module" src="/bali-id.js"></script></body></html>'}));
  await page.goto('/id-fixture.html',{waitUntil:sdkDelay?'commit':'load'});
  return releaseSdk;
}

test('initial HTML stays neutral before the Firebase SDK can initialize',async({page})=>{
  const releaseSdk=await card(page,{sdkDelay:true,existingNumber:42});
  try{
    await expect(page.locator('#baliIdFlipScene')).toBeVisible();
    await expect(page.locator('#baliIdFlipScene')).toHaveAttribute('data-bali-loading','true');
    await expect(page.locator('#baliCardTier')).toBeHidden();
    expect(await page.evaluate(()=>window.__idTest.reads)).toEqual([]);
  }finally{releaseSdk();}
  await expect(page.locator('#baliCardTier')).toBeVisible();
  await expect(page.locator('#baliCardTier')).toHaveText('GOLD');
  await expect(page.locator('#baliCardNumber')).toHaveText('000042');
});

test('assigned GOLD stays neutral while loading and appears with its allocated number',async({page})=>{
  await card(page,{delayedTier:true});
  await expect.poll(()=>page.evaluate(()=>window.__idTest.reads.includes('guestPrivileges/assigned-guest'))).toBe(true);
  await expect(page.locator('#baliIdFlipScene')).toHaveAttribute('aria-busy','true');
  await expect(page.locator('#baliCardTier')).toBeHidden();
  await page.evaluate(()=>window.dispatchEvent(new CustomEvent('bali:auth-state',{detail:{registered:true,name:'Гость GOLD'}})));
  await expect(page.locator('#baliCardTier')).toBeHidden();
  await page.evaluate(()=>window.__resolveAssignedTier());
  await expect(page.locator('#baliIdFlipScene')).toHaveAttribute('aria-busy','false');
  await expect(page.locator('#baliCardTier')).toBeVisible();
  await expect(page.locator('#baliCardTier')).toHaveText('GOLD');
  await expect(page.locator('#baliCardNumber')).toHaveText('000042');
  expect(await page.evaluate(()=>window.__idTest.writes.map(x=>x.path))).toEqual(['baliIds/assigned-guest','baliCounters/guests']);
});

test('allocation failure remains visible and retry recovers without losing the assigned tier',async({page})=>{
  await card(page,{allocationError:true});
  await expect(page.locator('#baliIdFlipScene')).toHaveAttribute('aria-busy','false');
  await expect(page.locator('#baliCardTier')).toHaveText('GOLD');
  await expect(page.locator('#baliCardTier')).toBeHidden();
  await expect(page.locator('#baliIdFlipScene')).toHaveAttribute('data-bali-loading','error');
  await expect(page.locator('#baliIdStatus')).toBeVisible();
  await expect(page.locator('#baliIdStatus')).toContainText('ожидает активации новых правил');
  await expect(page.getByRole('button',{name:'Повторить загрузку'})).toBeVisible();
  expect(await page.evaluate(()=>window.__idTest.writes)).toEqual([]);
  await page.evaluate(()=>window.__idTest.allocationError=false);
  await page.getByRole('button',{name:'Повторить загрузку'}).click();
  await expect(page.locator('#baliCardNumber')).toHaveText('000042');
  await expect(page.locator('#baliCardTier')).toHaveText('GOLD');
  await expect(page.locator('#baliIdStatus')).toBeEmpty();
  expect(await page.evaluate(()=>window.__idTest.allocations)).toBe(2);
  expect(await page.evaluate(()=>window.__idTest.writes.length)).toBe(2);
});

test('a saved personal number is reused without issuing a second ID',async({page})=>{
  await card(page,{existingNumber:42});
  await expect(page.locator('#baliCardNumber')).toHaveText('000042');
  await expect(page.locator('#baliCardTier')).toHaveText('GOLD');
  await page.evaluate(()=>window.dispatchEvent(new CustomEvent('bali:id-accepted',{detail:{uid:'assigned-guest'}})));
  await expect(page.locator('#baliCardNumber')).toHaveText('000042');
  expect(await page.evaluate(()=>({writes:window.__idTest.writes,count:window.__idTest.count,allocations:window.__idTest.allocations}))).toEqual({writes:[],count:41,allocations:0});
});

test('a failed privilege read cannot display Member and retry restores the assigned GOLD',async({page})=>{
  await card(page,{assignmentError:true,existingNumber:42});
  await expect(page.locator('#baliIdFlipScene')).toHaveAttribute('data-bali-loading','error');
  await expect(page.locator('#baliCardTier')).toBeHidden();
  await expect(page.locator('#baliIdStatus')).toBeVisible();
  await expect(page.locator('#baliIdStatus')).toContainText('Не удалось загрузить привилегии: unavailable');
  await page.evaluate(()=>window.__idTest.assignmentError=false);
  await page.getByRole('button',{name:'Повторить загрузку'}).click();
  await expect(page.locator('#baliCardTier')).toBeVisible();
  await expect(page.locator('#baliCardTier')).toHaveText('GOLD');
  await expect(page.locator('#baliCardNumber')).toHaveText('000042');
  expect(await page.evaluate(()=>window.__idTest.writes)).toEqual([]);
});
