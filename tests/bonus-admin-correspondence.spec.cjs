const {test,expect}=require('@playwright/test');
const fs=require('node:fs');
const cleanHtml=file=>fs.readFileSync(file,'utf8').replace(/<script\b[^>]*>[\s\S]*?<\/script>/g,'').replace(/<link\b[^>]*>/g,'');
const source=file=>{
  const raw=fs.readFileSync(file,'utf8');
  const mockSheets=raw.includes('from "./bali-sheets-api.js"')
    ?'\nconst sheetsEnabled=()=>false; const sheetsRequest=async()=>{throw Error("Sheets disabled in legacy Firebase mock");};'
    :'';
  return raw.replace(/^import .*;$/gm,'')+mockSheets;
};

async function mount(page,file,modules,{admin=true,custom=true,delayKinds=false}={}){
  // Execute the real forms/modules; all Firebase calls are local fixtures.
  await page.route('**/*',route=>route.abort());
  await page.setContent(cleanHtml(file));
  // The BALI ID wallet is intentionally inactive on other browser pages.
  // Bank behavior tests enter the actual ID route first.
  if(file==='index.html')await page.evaluate(()=>{document.body.dataset.baliPage='id';});
  await page.evaluate(({admin,custom,delayKinds})=>{
    const builtins=[{id:'shot',name:'Шоты'},{id:'cocktail',name:'Коктейли'},{id:'hookah',name:'Кальяны'},{id:'entry',name:'Бесплатные проходы'}];
    window.__kinds=custom?[...builtins,{id:'dessert',name:'Десерты'}]:builtins;
    window.__calls=[];window.__kindResolvers=[];window.__auth={currentUser:{uid:'staff_fixture_001',emailVerified:true}};
    window.__callbacks=[];window.__setUser=user=>{window.__auth.currentUser=user;for(const cb of window.__callbacks)cb(user)};
    window.BALI_FIREBASE_CONFIG={};window.BaliAuth={isRegistered:()=>true,getProfile:()=>({uid:window.__auth.currentUser?.uid})};
    window.BaliQrScanner={showReceipt:data=>{window.__receipt=data}};
    window.confirm=()=>true;window.alert=()=>{};window.print=()=>{window.__printed=true};
    window.getApps=()=>[{}];window.getApp=()=>({});window.initializeApp=()=>({});
    window.getAuth=()=>window.__auth;window.getFunctions=()=>({});window.getFirestore=()=>({});
    window.onAuthStateChanged=(_,cb)=>{window.__callbacks.push(cb);queueMicrotask(()=>cb(window.__auth.currentUser));return ()=>{}};
    window.GoogleAuthProvider=class{};window.signInWithPopup=async()=>({});window.signOut=async()=>window.__setUser(null);
    window.doc=(_,collection,uid)=>({path:collection+'/'+uid});window.collection=(_,path)=>({path});
    window.where=()=>({});window.limit=()=>({});window.query=ref=>ref;window.serverTimestamp=()=>1;
    const record=path=>path.startsWith('admins/')?admin?{active:true}:null:
      path.startsWith('staffRoles/')?{active:true,role:'director'}:
      path.startsWith('baliIds/')?{number:1}:path.startsWith('users/')?{name:'Тестовый гость'}:null;
    window.getDoc=async ref=>({exists:()=>Boolean(record(ref.path)),data:()=>record(ref.path)});
    window.getDocs=async()=>({empty:false,docs:[{id:'guest_fixture_001'}]});
    window.setDoc=async()=>{};
    window.onSnapshot=(_,cb)=>{cb({data:()=>({grants:[
      {id:'custom_grant_001',kind:'dessert',remaining:3,transferable:true,unlimited:false,expiresAt:null},
      {id:'disabled_grant_001',kind:'retired',remaining:2,transferable:true,unlimited:false,expiresAt:null}
    ]})});return ()=>{}};
    window.httpsCallable=(_,name)=>async data=>{
      window.__calls.push({name,uid:window.__auth.currentUser?.uid,data:structuredClone(data)});
      if(name==='listBaliBonusKinds')return delayKinds?new Promise(resolve=>window.__kindResolvers.push(kinds=>resolve({data:{kinds}}))):{data:{kinds:window.__kinds}};
      if(name==='createBaliBonusKind'){window.__kinds.push({id:data.kind,name:data.name});return {data:{ok:true}}}
      if(name==='listBaliQrCodes')return {data:{codes:[{code:'a'.repeat(48),kind:'dessert',name:'Десерты',action:'debit',mode:'repeat',quantity:5,active:true,used:false}]}};
      if(name==='createBaliQrBatch')return {data:{ok:true,codes:[{...data,name:'Десерты',qrDataUrl:'data:image/svg+xml,<svg xmlns="http://www.w3.org/2000/svg"/>'}]}};
      if(name==='previewBaliRecipient')return {data:{name:'Получатель',number:'000002'}};
      if(name==='transferBaliBenefits')return {data:{ok:true}};
      if(name==='listMyBaliHistory')return {data:{items:[{id:'qr_fixture_receipt',source:'bonus-qr',kind:'dessert',type:'grant',count:3,name:'Десерты',createdAt:Date.now(),balanceAfter:3}],nextCursor:null}};
      return {data:{ok:true}};
    };
  },{admin,custom,delayKinds});
  for(const file of modules)await page.addScriptTag({type:'module',content:source(file)});
}

test('admin custom kinds, quantitative grants, repeat QR creation and revocation match callable fields',async({page})=>{
  await mount(page,'admin.html',['bali-privilege-admin.js','bali-qr-admin.js'],{custom:false});
  await page.evaluate(()=>{
    const form=document.getElementById('baliCreateBonusKindForm');
    form.elements.kind.value='dessert';form.elements.name.value='Десерты';
    form.dispatchEvent(new Event('submit',{bubbles:true,cancelable:true}));
  });
  await expect(page.locator('#baliQrCreateForm select[name=kind] option[value=dessert]')).toHaveCount(1);
  await page.evaluate(()=>{
    window.dispatchEvent(new CustomEvent('bali:admin:select-privilege',{detail:{uid:'guest_fixture_001',name:'Тестовый гость',email:'fixture@example.test'}}));
    const form=document.getElementById('baliAdminBonusGrantForm');
    form.elements.kind.value='dessert';form.elements.quantity.value='2';form.elements.reason.value='Подарок за посещение';
    form.dispatchEvent(new Event('submit',{bubbles:true,cancelable:true}));
  });
  await expect.poll(()=>page.evaluate(()=>window.__calls.filter(x=>x.name==='issueBaliQuantity').length)).toBe(1);
  const adminGrant=await page.evaluate(()=>window.__calls.find(x=>x.name==='issueBaliQuantity').data);
  expect(adminGrant.requestId).toMatch(/^[a-f0-9]{32}$/);
  const {requestId:adminNonce,...adminFields}=adminGrant;
  expect(adminFields).toEqual({uid:'guest_fixture_001',kind:'dessert',quantity:2,transferable:true,reason:'Подарок за посещение'});
  expect(await page.evaluate(()=>{
    const form=document.getElementById('baliQrCreateForm');
    form.elements.kind.value='dessert';form.elements.action.value='debit';form.elements.mode.value='repeat';
    form.elements.mode.dispatchEvent(new Event('change'));form.elements.cooldownSeconds.value='';
    const valid=form.checkValidity();form.dispatchEvent(new Event('submit',{bubbles:true,cancelable:true}));return valid;
  })).toBe(true);
  await expect.poll(()=>page.evaluate(()=>window.__calls.filter(x=>x.name==='createBaliQrBatch').length)).toBe(1);
  expect(await page.evaluate(()=>window.__calls.find(x=>x.name==='createBaliQrBatch').data)).toEqual({kind:'dessert',action:'debit',mode:'repeat',quantity:5,count:1,cooldownSeconds:30});
  await expect(page.locator('#baliQrPrintArea .bali-qr-print-ticket')).toHaveCount(1);
  await page.evaluate(()=>document.getElementById('baliQrPrint').click());
  expect(await page.evaluate(()=>window.__printed)).toBe(true);
  await page.locator('#baliQrManageList button').dispatchEvent('click');
  await expect.poll(()=>page.evaluate(()=>window.__calls.filter(x=>x.name==='revokeBaliQrCode').length)).toBe(1);
  expect(await page.evaluate(()=>window.__calls.find(x=>x.name==='revokeBaliQrCode').data)).toEqual({code:'a'.repeat(48)});
});

test('director role loads active custom kinds and can grant them through the same server API',async({page})=>{
  await mount(page,'director-id.html',['bali-director-id.js'],{admin:false});
  await expect(page.locator('#directorWorkspace')).toBeVisible();
  await expect(page.locator('#directorBonusType option[value=dessert]')).toHaveCount(1);
  await page.locator('#directorGuestNumber').fill('000001');await page.locator('#directorFind').click();
  await expect(page.locator('#directorAssignPanel')).toBeVisible();
  await page.locator('#directorBonusType').selectOption('dessert');
  await page.locator('#directorBonusQuantity').fill('3');await page.locator('#directorBonusReason').fill('Подарок за посещение');
  await page.locator('#directorBonusGrantForm button[type=submit]').click();
  await expect(page.locator('#directorBonusGrantStatus')).toContainText('Успешно начислено');
  const directorGrant=await page.evaluate(()=>window.__calls.find(x=>x.name==='issueBaliQuantity').data);
  expect(directorGrant.requestId).toMatch(/^[a-f0-9]{32}$/);
  const {requestId:directorNonce,...directorFields}=directorGrant;
  expect(directorFields).toEqual({uid:'guest_fixture_001',kind:'dessert',quantity:3,transferable:true,reason:'Подарок за посещение'});
  await expect(page.locator('[data-bali-transfer-submit]')).toBeDisabled();
  await expect(page.locator('[data-bali-transfer-status]')).toContainText('собственную Bali Card');
});

test('guest transfer choices include active custom grants with their display names and exclude unlisted kinds',async({page})=>{
  await mount(page,'index.html',['bali-id-bank.js']);
  await page.evaluate(()=>{document.getElementById('baliIdTransferOpen').click()});
  await page.locator('#baliTransferRecipient').fill('000002');
  await page.locator('#baliTransferLookupForm').dispatchEvent('submit');
  await expect(page.locator('#baliTransferRecipientPreview')).toBeVisible();
  await page.locator('#baliTransferNext').click();
  await expect(page.locator('#baliTransferChoices')).toContainText('Десерты');
  await expect(page.locator('#baliTransferChoices')).toContainText('Доступно: 3 шт.');
  await expect(page.locator('#baliTransferChoices .bali-bank-grant')).toHaveCount(1);
  await page.locator('#baliTransferChoices button[aria-label="Увеличить: Десерты"]').click();
  await page.locator('#baliTransferReviewOpen').click();
  await expect(page.locator('#baliTransferReviewList')).toContainText('Десерты');
  await page.locator('#baliTransferConfirm').click();
  await expect.poll(()=>page.evaluate(()=>window.__calls.filter(x=>x.name==='transferBaliBenefits').length)).toBe(1);
  expect(await page.evaluate(()=>window.__calls.find(x=>x.name==='transferBaliBenefits').data.items)).toEqual([{grantId:'custom_grant_001',quantity:1}]);
  await page.locator('#baliTransferClose').click();
  await page.evaluate(()=>document.getElementById('baliIdHistoryOpen').click());
  await expect(page.locator('#baliIdHistoryList')).toContainText('Десерты');
  await page.getByRole('button',{name:'Чек операции ↗'}).click();
  expect(await page.evaluate(()=>window.__receipt)).toMatchObject({id:'qr_fixture_receipt',name:'Десерты',count:3,balanceAfter:3});
});

test('an old account registry response cannot enable custom transfer items for the next account',async({page})=>{
  await mount(page,'index.html',['bali-id-bank.js'],{delayKinds:true});
  await expect.poll(()=>page.evaluate(()=>window.__kindResolvers.length)).toBe(1);
  await page.evaluate(()=>window.__setUser({uid:'next_guest_fixture',emailVerified:true}));
  await expect.poll(()=>page.evaluate(()=>window.__kindResolvers.length)).toBe(2);
  await page.evaluate(()=>window.__kindResolvers[0]([{id:'dessert',name:'Старое направление'}]));
  await page.evaluate(()=>document.getElementById('baliIdTransferOpen').click());
  await page.locator('#baliTransferRecipient').fill('000002');
  await page.locator('#baliTransferLookupForm').dispatchEvent('submit');
  await expect(page.locator('#baliTransferRecipientPreview')).toBeVisible();
  await page.locator('#baliTransferNext').click();
  await expect(page.locator('#baliTransferChoices .bali-bank-grant')).toHaveCount(0);
  await page.evaluate(()=>window.__kindResolvers[1]([{id:'dessert',name:'Десерты нового аккаунта'}]));
  await expect(page.locator('#baliTransferChoices')).toContainText('Десерты нового аккаунта');
  await expect(page.locator('#baliTransferChoices .bali-bank-grant')).toHaveCount(1);
});
