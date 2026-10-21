const {test,expect}=require('@playwright/test');

const code='a'.repeat(48);
const officialLink='https://nik13599.github.io/BALI-MENU/?baliQrBonus='+code+'#id';
// QR PNG fixture uses the production qrcode encoder/settings from bonus-qr.js.
async function scanner(page,{native=false,denied=false,pending=false,profilePending=false,query=''}={}){
  await page.addInitScript(({native,denied,pending,profilePending})=>{
    window.__qrAuth={currentUser:{uid:'guest-a',emailVerified:true}};
    window.__qrAuthObservers=[];window.__qrCalls=[];window.__qrStreams=[];window.__qrRequests=[];
    let registered=!profilePending,finishProfile;
    const ready=profilePending?new Promise(resolve=>finishProfile=resolve):Promise.resolve();
    window.BaliAuth={isRegistered:()=>registered,open:()=>{},get ready(){window.__waitingProfile=true;return ready;}};
    window.__finishProfile=()=>{registered=true;finishProfile?.();};
    window.__switchQrUser=uid=>{
      window.__qrAuth.currentUser=uid?{uid,emailVerified:true}:null;
      for(const notify of window.__qrAuthObservers)notify(window.__qrAuth.currentUser);
    };
    window.__qrRpc=async(name,data)=>{
      window.__qrCalls.push({name,data,uid:window.__qrAuth.currentUser?.uid});
      if(name==='previewBaliBonusQR')return {data:{action:'debit',name:'Шоты',available:4,maxQuantity:4,quantity:1}};
      return {data:{ok:true,receipt:{id:'operation',type:'redeem',name:'Шоты',count:1,createdAt:Date.now()}}};
    };
    window.__makeQrStream=async()=>{
      const image=new Image();image.src='/tests/fixtures/bonus-qr.png';await image.decode();
      const canvas=document.createElement('canvas');canvas.width=240;canvas.height=240;
      canvas.getContext('2d').drawImage(image,0,0);
      const stream=canvas.captureStream(10);window.__qrStreams.push(stream);return stream;
    };
    Object.defineProperty(navigator,'mediaDevices',{configurable:true,value:{getUserMedia:async()=>{
      if(denied)throw new DOMException('Camera denied','NotAllowedError');
      if(pending)return new Promise(resolve=>window.__qrRequests.push(resolve));
      return window.__makeQrStream();
    }}});
    Object.defineProperty(window,'BarcodeDetector',{configurable:true,value:native?class{
      static async getSupportedFormats(){return ['qr_code'];}
      async detect(){
        if(native==='failure')throw new DOMException('Unsupported frame','NotSupportedError');
        if(native==='pending')return new Promise(resolve=>(window.__nativeResults||=[]).push(resolve));
        return [];
      }
    }:undefined});
  },{native,denied,pending,profilePending});
  await page.route('**/*',route=>{
    const url=new URL(route.request().url());
    if(url.hostname==='127.0.0.1')return route.continue();
    const module=url.pathname.split('/').pop();
    const bodies={
      'firebase-app.js':'export const getApps=()=>[{}], getApp=()=>({}), initializeApp=()=>({});',
      'firebase-auth.js':'export const getAuth=()=>window.__qrAuth; export const onAuthStateChanged=(auth,cb)=>{window.__qrAuthObservers.push(cb);queueMicrotask(()=>cb(auth.currentUser));return ()=>{};};',
      'firebase-functions.js':'export const getFunctions=()=>({});export const httpsCallable=(_,name)=>data=>window.__qrRpc(name,data);'
    };
    return bodies[module]?route.fulfill({contentType:'text/javascript',body:bodies[module]}):route.abort();
  });
  await page.route('**/qr-fixture.html*',r=>r.fulfill({contentType:'text/html',body:
    '<!doctype html><html lang="ru"><head><link rel="stylesheet" href="/bali-qr-scanner.css"></head><body><script type="module" src="/bali-qr-scanner.js"></script></body></html>'}));
  await page.goto('/qr-fixture.html'+query);
  await expect.poll(()=>page.evaluate(()=>!!window.BaliQrScanner)).toBe(true);
}
const confirmButton=page=>page.locator('.bali-qr-confirm button');
const cameraButton=page=>page.getByRole('button',{name:'Включить камеру',exact:true});

test('local fallback decodes a real generated QR on browsers without BarcodeDetector',async({page})=>{
  await scanner(page);
  await page.evaluate(()=>window.BaliQrScanner.open({mode:'debit'}));
  await expect(page.locator('.bali-qr-confirm')).toBeVisible();
  await expect(page.locator('.bali-qr-confirm')).toContainText('Списание: Шоты');
  expect(await page.evaluate(()=>window.__qrCalls)).toEqual([
    {name:'previewBaliBonusQR',data:{code:'a'.repeat(48)},uid:'guest-a'}
  ]);
  expect(await page.evaluate(()=>window.__qrStreams.every(s=>s.getTracks().every(t=>t.readyState==='ended')))).toBe(true);
  await confirmButton(page).click();
  await expect(page.locator('.bali-qr-receipt')).toContainText('СПИСАНО');
  expect(await page.evaluate(()=>window.__qrCalls.filter(x=>x.name==='applyBaliBonusQR').length)).toBe(1);
});

test('system-camera debit link previews the server-selected action and requires confirmation',async({page})=>{
  await scanner(page,{query:'?baliQrBonus='+code+'#id'});
  await expect(page.locator('.bali-qr-confirm')).toContainText('Списание: Шоты');
  expect(await page.evaluate(()=>window.__qrCalls.map(x=>x.name))).toEqual(['previewBaliBonusQR']);
  await expect(page).not.toHaveURL(/baliQrBonus/);
});

test('system-camera link waits for profile initialization before opening',async({page})=>{
  await scanner(page,{query:'?baliQrBonus='+code+'#id',profilePending:true});
  await expect.poll(()=>page.evaluate(()=>window.__waitingProfile)).toBe(true);
  expect(await page.evaluate(()=>window.__qrCalls)).toEqual([]);
  await page.evaluate(()=>window.__finishProfile());
  await expect(page.locator('.bali-qr-confirm')).toContainText('Списание: Шоты');
});

test('pending system-camera link is discarded when its authenticated user changes',async({page})=>{
  await scanner(page,{query:'?baliQrBonus='+code+'#id',profilePending:true});
  await expect.poll(()=>page.evaluate(()=>window.__waitingProfile)).toBe(true);
  await page.evaluate(()=>{window.__switchQrUser('guest-b');window.__finishProfile();});
  await expect(page.locator('dialog[open]')).toHaveCount(0);
  expect(await page.evaluate(()=>window.__qrCalls)).toEqual([]);
});

test('explicit action mismatch is blocked and a credit code requires one confirmation',async({page})=>{
  await scanner(page);
  await page.evaluate(code=>window.BaliQrScanner.open({mode:'credit',prefill:code}),code);
  await expect(page.getByRole('status')).toContainText('другой операции');
  await expect(page.locator('.bali-qr-confirm')).toBeHidden();
  await page.evaluate(code=>{
    window.__qrCalls=[];
    window.__qrRpc=async(name,data)=>{
      window.__qrCalls.push({name,data});
      if(name==='previewBaliBonusQR')return {data:{action:'credit',name:'Шоты',quantity:2,maxQuantity:2}};
      return {data:{ok:true,receipt:{id:'credit',type:'grant',count:2,createdAt:Date.now()}}};
    };
    window.BaliQrScanner.open({mode:'credit',prefill:code});
  },code);
  await expect(page.locator('.bali-qr-confirm')).toContainText('Начисление: Шоты');
  await expect(page.getByLabel('Количество списания')).toBeHidden();
  expect(await page.evaluate(()=>window.__qrCalls.map(x=>x.name))).toEqual(['previewBaliBonusQR']);
  await confirmButton(page).click();
  await expect(page.locator('.bali-qr-receipt')).toContainText('НАЧИСЛЕНО');
  expect(await page.evaluate(()=>window.__qrCalls.find(x=>x.name==='applyBaliBonusQR').data.quantity)).toBe(2);
});

test('recipient QR dispatches only the server-verified name and number',async({page})=>{
  await scanner(page);
  await page.evaluate(code=>{
    window.addEventListener('bali:transfer-qr',event=>window.__recipient=event.detail);
    window.__qrRpc=async(name,data)=>{
      window.__qrCalls.push({name,data});return {data:{name:'Получатель',number:'000002'}};
    };
    window.BaliQrScanner.open({mode:'recipient',prefill:'https://nik13599.github.io/BALI-MENU/?baliRecipientQr='+code+'#id'});
  },code);
  await expect.poll(()=>page.evaluate(()=>window.__recipient)).toEqual({name:'Получатель',number:'000002'});
  await expect(page.locator('dialog[open]')).toHaveCount(0);
  expect(await page.evaluate(()=>window.__qrCalls.map(x=>x.name))).toEqual(['previewBaliRecipientQr']);
});

test('camera denial keeps manual entry usable and rejects invalid links',async({page})=>{
  await scanner(page,{denied:true});
  await page.evaluate(()=>window.BaliQrScanner.open({mode:'debit'}));
  await expect(page.getByRole('status')).toContainText('Разрешите доступ к камере');
  await expect(cameraButton(page)).toBeEnabled();
  const field=page.getByLabel('Ссылка или код QR');
  for(const invalid of ['https://evil.test/?baliQrBonus='+code,officialLink.replace('https:','http:'),'A'.repeat(48)]){
    await field.fill(invalid);await page.getByRole('button',{name:'Проверить код',exact:true}).click();
    await expect(page.getByRole('status')).toContainText('Неверный тип QR-кода');
  }
  expect(await page.evaluate(()=>window.__qrCalls.length)).toBe(0);
  await field.fill(officialLink);await page.getByRole('button',{name:'Проверить код',exact:true}).click();
  await expect(page.locator('.bali-qr-confirm')).toBeVisible();
  await field.fill('invalid');
  await expect(page.locator('.bali-qr-confirm')).toBeHidden();
});

test('account switch clears preview and receipt and cannot apply a previous account code',async({page})=>{
  await scanner(page);
  await page.evaluate(code=>window.BaliQrScanner.open({mode:'debit',prefill:code}),code);
  await expect(page.locator('.bali-qr-confirm')).toBeVisible();
  await page.evaluate(()=>window.__switchQrUser('guest-b'));
  await expect(page.locator('dialog[open]')).toHaveCount(0);
  await page.evaluate(()=>document.querySelector('.bali-qr-confirm button').click());
  expect(await page.evaluate(()=>window.__qrCalls.filter(x=>x.name==='applyBaliBonusQR'))).toEqual([]);
  await page.evaluate(()=>window.BaliQrScanner.showReceipt({id:'old',createdAt:Date.now(),type:'redeem',count:1}));
  await expect(page.locator('.bali-qr-receipt')).toBeVisible();
  await page.evaluate(()=>window.__switchQrUser(null));
  await expect(page.locator('dialog[open]')).toHaveCount(0);
  await expect(page.locator('.bali-qr-receipt')).toBeEmpty();
});

test('late camera permission result stops only its own stream after scanner closes',async({page})=>{
  await scanner(page,{native:true,pending:true});
  await page.evaluate(()=>window.BaliQrScanner.open({mode:'debit'}));
  await expect.poll(()=>page.evaluate(()=>window.__qrRequests.length)).toBe(1);
  await page.getByRole('button',{name:'Закрыть',exact:true}).click();
  await page.evaluate(()=>window.BaliQrScanner.open({mode:'debit'}));
  await expect.poll(()=>page.evaluate(()=>window.__qrRequests.length)).toBe(2);
  await page.evaluate(async()=>window.__qrRequests[1](await window.__makeQrStream()));
  await expect(page.locator('video')).toBeVisible();
  await page.evaluate(async()=>window.__qrRequests[0](await window.__makeQrStream()));
  await expect.poll(()=>page.evaluate(()=>window.__qrStreams[1].getTracks().every(t=>t.readyState==='ended'))).toBe(true);
  expect(await page.evaluate(()=>window.__qrStreams[0].getTracks().every(t=>t.readyState==='live'))).toBe(true);
  await page.getByRole('button',{name:'Закрыть',exact:true}).click();
  expect(await page.evaluate(()=>window.__qrStreams.every(s=>s.getTracks().every(t=>t.readyState==='ended')))).toBe(true);
  expect(await page.locator('video').evaluate(v=>v.srcObject)).toBeNull();
});

test('late preview response is ignored after changing accounts',async({page})=>{
  await scanner(page);
  await page.evaluate(code=>{
    window.__qrRpc=()=>new Promise(resolve=>window.__finishPreview=resolve);
    window.BaliQrScanner.open({mode:'debit',prefill:code});
  },code);
  await page.evaluate(()=>{
    window.__switchQrUser('guest-b');
    window.__finishPreview({data:{action:'debit',name:'Account A',available:4,maxQuantity:4}});
  });
  await expect(page.locator('dialog[open]')).toHaveCount(0);
  await expect(page.locator('.bali-qr-confirm')).toBeHidden();
});

test('native detector failure falls back to the local decoder',async({page})=>{
  await scanner(page,{native:'failure'});
  await page.evaluate(()=>window.BaliQrScanner.open({mode:'debit'}));
  await expect(page.locator('.bali-qr-confirm')).toContainText('Списание: Шоты');
  expect(await page.evaluate(()=>window.__qrCalls.map(x=>x.name))).toEqual(['previewBaliBonusQR']);
});

test('decoder loading failure stops the camera and keeps retry/manual entry available',async({page})=>{
  await scanner(page,{native:'failure'});
  await page.route('**/assets/vendor/jsqr-1.4.0.js',r=>r.abort());
  await page.evaluate(()=>window.BaliQrScanner.open({mode:'debit'}));
  await expect(page.getByRole('status')).toContainText('модуль распознавания');
  await expect(cameraButton(page)).toBeEnabled();
  await expect(page.getByLabel('Ссылка или код QR')).toBeEnabled();
  expect(await page.evaluate(()=>window.__qrStreams.every(s=>s.getTracks().every(t=>t.readyState==='ended')))).toBe(true);
});

test('late native detection cannot inject a code into another account session',async({page})=>{
  await scanner(page,{native:'pending'});
  await page.evaluate(()=>window.BaliQrScanner.open({mode:'debit'}));
  await expect.poll(()=>page.evaluate(()=>window.__nativeResults?.length||0)).toBe(1);
  await page.evaluate(()=>{
    window.__switchQrUser('guest-b');
    window.BaliQrScanner.open({mode:'debit'});
  });
  await expect.poll(()=>page.evaluate(()=>window.__nativeResults.length)).toBe(2);
  await page.evaluate(link=>window.__nativeResults[0]([{rawValue:link}]),officialLink);
  expect(await page.evaluate(()=>window.__qrCalls)).toEqual([]);
  await page.evaluate(()=>window.__switchQrUser(null));
  await expect(page.locator('dialog[open]')).toHaveCount(0);
  expect(await page.evaluate(()=>window.__qrStreams.every(s=>s.getTracks().every(t=>t.readyState==='ended')))).toBe(true);
});

test('an old apply completion cannot unlock a new account pending preview',async({page})=>{
  await scanner(page);
  await page.evaluate(code=>window.BaliQrScanner.open({mode:'debit',prefill:code}),code);
  await expect(page.locator('.bali-qr-confirm')).toBeVisible();
  await page.evaluate(()=>{
    window.__qrRpc=(name)=>new Promise(resolve=>{
      if(name==='applyBaliBonusQR')window.__finishApply=resolve;
      else window.__finishNewPreview=resolve;
    });
  });
  await confirmButton(page).click();
  await page.evaluate(code=>{
    window.__switchQrUser('guest-b');
    window.BaliQrScanner.open({mode:'debit',prefill:code});
    window.__finishApply({data:{ok:true,receipt:{createdAt:Date.now(),count:1}}});
  },code);
  await expect(page.getByRole('button',{name:'Проверить код',exact:true})).toBeDisabled();
  await expect(page.locator('.bali-qr-receipt')).toBeHidden();
  await page.evaluate(()=>window.__finishNewPreview({data:{action:'debit',name:'Account B',available:2,maxQuantity:2}}));
  await expect(page.locator('.bali-qr-confirm')).toContainText('Account B');
});
