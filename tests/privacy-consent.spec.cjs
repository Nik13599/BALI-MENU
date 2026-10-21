const {test,expect}=require('@playwright/test');
const fs=require('node:fs');
async function fixture(page,{returning=false,newProfile=false,anonymous=false}={}){
 const html=fs.readFileSync('index.html','utf8').replace(/<script\b[^>]*>[\s\S]*?<\/script>/g,'');
 await page.addInitScript(({returning,newProfile,anonymous})=>{
  window.BALI_FIREBASE_CONFIG={apiKey:'fixture',authDomain:'fixture.test',projectId:'demo-bali-menu',appId:'fixture'};
  window.__privacyWrites=[];window.__privacyDocs={};window.__googleCalls=0;window.__popupUserActivation=null;
  window.__profile={uid:'guest',email:'guest@example.test',name:'Гость BALI',phone:'+375291234567'};
  window.__auth={currentUser:anonymous?null:{uid:'guest',email:'guest@example.test',emailVerified:true}};
  if(!newProfile)window.__privacyDocs['users/guest']=window.__profile;
  if(returning)window.__privacyDocs['users/guest/privacyConsents/2026-10-21']={version:'2026-10-21',processing:true,international:true,acceptedAt:1};
  window.__setUser=async user=>{window.__auth.currentUser=user;await window.__authCallback(user)};
 },{returning,newProfile,anonymous});
 await page.route('**/*',route=>{
  const url=new URL(route.request().url());
  if(url.hostname==='127.0.0.1')return route.continue();
  const modules={
   'firebase-app.js':'export const initializeApp=()=>({});',
   'firebase-auth.js':`
    export const getAuth=()=>window.__auth;
    export const onAuthStateChanged=(auth,cb)=>{window.__authCallback=cb;queueMicrotask(()=>cb(auth.currentUser))};
    export class GoogleAuthProvider{setCustomParameters(){}};
    export const signInWithPopup=async()=>{
      window.__popupUserActivation=Boolean(navigator.userActivation?.isActive);
      window.__googleCalls++;
      if(window.__googleError)throw {code:window.__googleError};
      await window.__setUser({uid:'guest',email:'guest@example.test',emailVerified:true,displayName:'Google User'});
    };
    export const signInWithRedirect=async()=>{},getRedirectResult=async()=>{};
    export const signOut=async()=>window.__setUser(null);`,
   'firebase-firestore.js':`
    export const getFirestore=()=>({}),doc=(_, ...parts)=>({path:parts.join('/')}),serverTimestamp=()=>1;
    export const getDoc=async ref=>({exists:()=>!!window.__privacyDocs[ref.path],data:()=>window.__privacyDocs[ref.path]});
    export const setDoc=async(ref,data)=>{
     if(window.__raceConsent&&ref.path.includes('/privacyConsents/')){window.__privacyDocs[ref.path]=data;throw {code:'permission-denied'}}
     if(window.__denyConsent&&ref.path.includes('/privacyConsents/'))throw {code:'permission-denied'};
     if(window.__holdConsent&&ref.path.includes('/privacyConsents/'))await new Promise(resolve=>window.__releaseConsent=resolve);
     window.__privacyWrites.push({path:ref.path,data});window.__privacyDocs[ref.path]=data;
    };
    export const updateDoc=async(ref,data)=>{window.__privacyWrites.push({path:ref.path,data});Object.assign(window.__privacyDocs[ref.path],data)};`
  };
  const body=modules[url.pathname.split('/').at(-1)];
  return body?route.fulfill({contentType:'text/javascript',body}):route.abort();
 });
 await page.route('**/privacy-fixture.html',route=>route.fulfill({contentType:'text/html',body:html.replace('</body>','<script src="/bali-dialogs.js"></script><script src="/bali-privacy.js"></script><script type="module" src="/auth.js"></script></body>')}));
 await page.goto('/privacy-fixture.html');
}
async function accept(page){
 await page.locator('#baliPrivacyProcessing').check();
 await page.locator('#baliPrivacyInternational').check();
 await page.locator('#baliPrivacyAccept').click();
}
test('first sign-in requires two explicit choices and server confirmation before account access',async({page})=>{
 await fixture(page);
 const dialog=page.locator('#baliPrivacyDialog');
 await expect(dialog).toBeVisible();
 await expect(page.locator('#baliPrivacyProcessing')).not.toBeChecked();
 await expect(page.locator('#baliPrivacyInternational')).not.toBeChecked();
 await expect(page.locator('#baliPrivacyAccept')).toBeDisabled();
 await page.locator('#baliPrivacyProcessing').check();
 await expect(page.locator('#baliPrivacyAccept')).toBeDisabled();
 expect(await page.evaluate(()=>window.BaliAuth.isRegistered())).toBe(false);
 await page.evaluate(()=>{window.__holdConsent=true});
 await page.locator('#baliPrivacyInternational').check();
 await page.locator('#baliPrivacyAccept').click();
 await expect.poll(()=>page.evaluate(()=>typeof window.__releaseConsent)).toBe('function');
 expect(await page.evaluate(()=>window.BaliAuth.isRegistered())).toBe(false);
 await page.evaluate(()=>window.__releaseConsent());
 await expect.poll(()=>page.evaluate(()=>window.BaliAuth.isRegistered())).toBe(true);
 const writes=await page.evaluate(()=>window.__privacyWrites);
 expect(writes).toEqual([{path:'users/guest/privacyConsents/2026-10-21',data:{version:'2026-10-21',processing:true,international:true,acceptedAt:1}}]);
 await expect(dialog).toBeHidden();
});
test('declining consent performs no profile/consent writes and leaves the visitor signed out',async({page})=>{
 await fixture(page,{newProfile:true});
 await expect(page.locator('#baliPrivacyDialog')).toBeVisible();
 await page.locator('#baliPrivacyDecline').click();
 await expect.poll(()=>page.evaluate(()=>window.__auth.currentUser)).toBe(null);
 expect(await page.evaluate(()=>window.__privacyWrites)).toEqual([]);
 expect(await page.evaluate(()=>window.BaliAuth.isRegistered())).toBe(false);
 await expect(page.locator('#baliPrivacyDialog')).toBeHidden();
});
test('registration signs in via Google first but stores consent before profile data',async({page})=>{
 await fixture(page,{anonymous:true,newProfile:true});
 await page.evaluate(()=>window.BaliAuth.open());
 await page.locator('#authGoogleBtn').click();
 await expect.poll(()=>page.evaluate(()=>window.__googleCalls)).toBe(1);
 await expect(page.locator('#baliPrivacyDialog')).toBeVisible();
 await accept(page);
 await expect(page.locator('#authProfileForm')).toBeVisible();
 await page.locator('#authName').fill('Гость BALI');
 await page.locator('#authPhone').fill('+375291234567');
 await page.locator('#authSaveBtn').click();
 await expect.poll(()=>page.evaluate(()=>window.BaliAuth.isRegistered())).toBe(true);
 expect(await page.evaluate(()=>window.__privacyWrites.map(x=>x.path))).toEqual(['users/guest/privacyConsents/2026-10-21','users/guest']);
});
test('returning account skips the notice; withdrawal is recorded and ends account access',async({page})=>{
 await fixture(page,{returning:true});
 await expect.poll(()=>page.evaluate(()=>window.BaliAuth.isRegistered())).toBe(true);
 await expect(page.locator('#baliPrivacyDialog')).toBeHidden();
 expect(await page.evaluate(()=>window.__privacyWrites)).toEqual([]);
 await page.evaluate(()=>{document.getElementById('contactsSection').hidden=false;document.body.dataset.baliPage='contacts'});
 await page.locator('#contactsSection summary').filter({hasText:'Персональные данные'}).click();
 page.once('dialog',dialog=>dialog.accept());
 await page.locator('#baliPrivacyWithdraw').click();
 await expect.poll(()=>page.evaluate(()=>window.__auth.currentUser)).toBe(null);
 expect(await page.evaluate(()=>window.__privacyWrites)).toEqual([{path:'users/guest/privacyWithdrawals/2026-10-21',data:{version:'2026-10-21',requestedAt:1}}]);
 await page.evaluate(()=>window.__setUser({uid:'guest',email:'guest@example.test',emailVerified:true}));
 expect(await page.evaluate(()=>window.BaliAuth.isRegistered())).toBe(false);
 await expect(page.locator('#authMessage')).toContainText('получен отзыв согласия');
});
test('a failed receipt write cannot silently approve processing or complete registration',async({page})=>{
 await fixture(page,{newProfile:true});
 await page.evaluate(()=>{window.__denyConsent=true});
 await accept(page);
 await expect(page.locator('#authMessage')).toContainText('Не удалось сохранить данные');
 expect(await page.evaluate(()=>window.BaliAuth.isRegistered())).toBe(false);
 expect(await page.evaluate(()=>window.__privacyWrites)).toEqual([]);
 await expect(page.locator('#authProfileForm')).toBeHidden();
});

test('a receipt concurrently accepted in another tab does not block the account',async({page})=>{
 await fixture(page);
 await page.evaluate(()=>{window.__raceConsent=true});
 await accept(page);
 await expect.poll(()=>page.evaluate(()=>window.BaliAuth.isRegistered())).toBe(true);
 await expect(page.locator('#baliPrivacyDialog')).toBeHidden();
});

test('privacy controls remain clickable when the sign-in modal is open',async({page})=>{
 await fixture(page,{anonymous:true,newProfile:true});
 await page.evaluate(()=>window.BaliAuth.open());
 await expect(page.locator('#authModal')).toHaveClass(/active/);
 await page.locator('#authGoogleBtn').click();
 const dialog=page.locator('#baliPrivacyDialog');
 await expect(dialog).toBeVisible();
 // The original regression: dialog was visible but inherited inert from the
 // generic modal manager; checkbox and both buttons were unreachable.
 await expect(dialog).not.toHaveAttribute('inert','');
 await page.locator('#baliPrivacyProcessing').check();
 await expect(page.locator('#baliPrivacyProcessing')).toBeChecked();
 await expect(page.locator('#baliPrivacyAccept')).toBeDisabled();
 await page.locator('#baliPrivacyInternational').check();
 await expect(page.locator('#baliPrivacyInternational')).toBeChecked();
 await expect(page.locator('#baliPrivacyAccept')).toBeEnabled();
 await page.locator('#baliPrivacyAccept').click();
 await expect(dialog).toBeHidden();
 await expect.poll(()=>page.evaluate(()=>window.__googleCalls)).toBe(1);
 // Google opens directly from the login click, without a pre-login consent dialog.
 expect(await page.evaluate(()=>window.__popupUserActivation)).toBe(true);
 await expect(page.locator('#authProfileForm')).toBeVisible();
});
test('continue without account closes the privacy dialog and sign-in overlay',async({page})=>{
 await fixture(page,{anonymous:true,newProfile:true});
 await page.evaluate(()=>window.BaliAuth.open());
 await page.locator('#authGoogleBtn').click();
 await expect(page.locator('#baliPrivacyDialog')).toBeVisible();
 await page.locator('#baliPrivacyDecline').click();
 await expect(page.locator('#baliPrivacyDialog')).toBeHidden();
 await expect(page.locator('#authModal')).not.toHaveClass(/active/);
 await expect(page.locator('#overlay')).not.toHaveClass(/active/);
 expect(await page.evaluate(()=>window.__googleCalls)).toBe(1);
 expect(await page.evaluate(()=>window.__privacyWrites)).toEqual([]);
 await expect(page.locator('#baliPrivacyProcessing')).not.toBeChecked();
});
test('keyboard Escape from privacy leaves sign-in closed for a guest',async({page})=>{
 await fixture(page,{anonymous:true,newProfile:true});
 await page.evaluate(()=>window.BaliAuth.open());
 await page.locator('#authGoogleBtn').click();
 await expect(page.locator('#baliPrivacyDialog')).toBeVisible();
 await page.keyboard.press('Escape');
 await expect(page.locator('#baliPrivacyDialog')).toBeHidden();
 await expect(page.locator('#authModal')).not.toHaveClass(/active/);
 expect(await page.evaluate(()=>window.__googleCalls)).toBe(1);
});

test('Google popup starts in the direct sign-in gesture after prior consent',async({page})=>{
 await fixture(page,{anonymous:true,newProfile:true});
 await page.evaluate(()=>{
   localStorage.setItem('bali-privacy-entry-approved','2026-10-21');
   window.BaliAuth.open();
 });
 await page.locator('#authGoogleBtn').click();
 await expect.poll(()=>page.evaluate(()=>window.__googleCalls)).toBe(1);
 expect(await page.evaluate(()=>window.__popupUserActivation)).toBe(true);
 // A local choice does not invent a Firestore receipt; a newly signed-in
 // account still needs the verified per-account consent before profile access.
 await expect(page.locator('#baliPrivacyDialog')).toBeVisible();
 await expect(page.locator('#authProfileForm')).toBeHidden();
});

test('Firebase unauthorized-domain error gives a useful recovery message',async({page})=>{
 await fixture(page,{anonymous:true,newProfile:true});
 await page.evaluate(()=>{
   window.__googleError='auth/unauthorized-domain';
   localStorage.setItem('bali-privacy-entry-approved','2026-10-21');
   window.BaliAuth.open();
 });
 await page.locator('#authGoogleBtn').click();
 await expect(page.locator('#authMessage')).toContainText('Authorized domains');
 await expect(page.locator('#authGoogleBtn')).toBeEnabled();
});

test('returning Google member skips consent and profile screens and reaches homepage',async({page})=>{
 await fixture(page,{returning:true,anonymous:true});
 await page.evaluate(()=>{window.location.hash='profile';window.BaliAuth.open()});
 await page.locator('#authGoogleBtn').click();
 await expect.poll(()=>page.evaluate(()=>window.BaliAuth.isRegistered())).toBe(true);
 await expect(page).toHaveURL(/#home$/);
 await expect(page.locator('#baliPrivacyDialog')).toBeHidden();
 await expect(page.locator('#authProfileForm')).toBeHidden();
 await expect(page.locator('#authModal')).not.toHaveClass(/active/);
 await expect(page.locator('#overlay')).not.toHaveClass(/active/);
 expect(await page.evaluate(()=>window.__privacyWrites)).toEqual([]);
});

test('new Google account sees only two required editable fields then lands on home',async({page})=>{
 await fixture(page,{anonymous:true,newProfile:true});
 await page.evaluate(()=>window.BaliAuth.open());
 await page.locator('#authGoogleBtn').click();
 await accept(page);
 await expect(page.locator('#authModal')).toHaveAttribute('data-auth-step','complete');
 await expect(page.locator('#authModalTitle')).toHaveText('Завершите регистрацию');
 await expect(page.locator('#authProfileForm')).toBeVisible();
 await expect(page.locator('#authName')).toBeVisible();
 await expect(page.locator('#authPhone')).toBeVisible();
 await expect(page.locator('#authEmail')).toBeHidden();
 await expect(page.locator('#authGoogleBtn')).toBeHidden();
 await expect(page.locator('#accountMyOrdersBtn')).toBeHidden();
 await expect(page.locator('#authName')).toHaveValue('');
 await expect(page.locator('#authPhone')).toHaveValue('');
 await expect(page.locator('#authSaveBtn')).toHaveText('Продолжить');
 await expect(page.locator('#authName')).toHaveAttribute('required','');
 await expect(page.locator('#authPhone')).toHaveAttribute('required','');

 await page.locator('#authSaveBtn').click();
 expect(await page.evaluate(()=>window.BaliAuth.isRegistered())).toBe(false);
 expect(await page.evaluate(()=>window.__privacyWrites.map(x=>x.path))).toEqual(['users/guest/privacyConsents/2026-10-21']);

 await page.locator('#authName').fill('А');
 await page.locator('#authPhone').fill('+375291234567');
 await page.locator('#authSaveBtn').click();
 expect(await page.evaluate(()=>window.BaliAuth.isRegistered())).toBe(false);

 await page.locator('#authName').fill('Кирилл');
 await page.locator('#authPhone').fill('неверный номер');
 await page.locator('#authSaveBtn').click();
 await expect(page.locator('#authSaveMessage')).toContainText('международном формате');
 expect(await page.evaluate(()=>window.BaliAuth.isRegistered())).toBe(false);

 await page.locator('#authPhone').fill('+375 (29) 123-45-67');
 await page.locator('#authSaveBtn').click();
 await expect.poll(()=>page.evaluate(()=>window.BaliAuth.isRegistered())).toBe(true);
 await expect(page.locator('#authModal')).not.toHaveClass(/active/);
 await expect(page.locator('#baliPrivacyDialog')).toBeHidden();
 await expect(page.locator('#overlay')).not.toHaveClass(/active/);
 await expect(page).toHaveURL(/#home$/);
 const saved=await page.evaluate(()=>window.__privacyDocs['users/guest']);
 expect(saved.name).toBe('Кирилл');
 expect(saved.phone).toBe('+375291234567');
});

test('an existing complete profile never sees the required registration screen again',async({page})=>{
 await fixture(page,{returning:true});
 await expect.poll(()=>page.evaluate(()=>window.BaliAuth.isRegistered())).toBe(true);
 await expect(page.locator('#authModal')).not.toHaveClass(/active/);
 await page.evaluate(()=>window.BaliAuth.open());
 await expect(page.locator('#authModal')).toHaveAttribute('data-auth-step','edit');
 await expect(page.locator('#authName')).toHaveValue('Гость BALI');
 await expect(page.locator('#authPhone')).toHaveValue('+375291234567');
 await expect(page.locator('#authSaveBtn')).toHaveText('Сохранить профиль');
});

async function expectCentered(page,selector,tolerance=3){
 const offset=await page.locator(selector).evaluate(element=>{
   const r=element.getBoundingClientRect();
   const width=window.innerWidth,height=window.innerHeight;
   return {x:Math.abs(r.left+r.width/2-width/2),
     y:Math.abs(r.top+r.height/2-height/2),
     bounds:r.left>=-1&&r.right<=width+1&&r.top>=-1&&r.bottom<=height+1};
 });
 expect(offset.x,selector+' horizontal center').toBeLessThanOrEqual(tolerance);
 expect(offset.y,selector+' vertical center').toBeLessThanOrEqual(tolerance);
 expect(offset.bounds,selector+' inside viewport').toBe(true);
}

test('login, first-time consent and mandatory profile stay centered on every screen',async({page})=>{
 await fixture(page,{anonymous:true,newProfile:true});
 await page.evaluate(()=>window.BaliAuth.open());
 await expect(page.locator('#authModal')).toHaveClass(/active/);
 await expectCentered(page,'#authModal .modal-content');
 await page.locator('#authGoogleBtn').click();
 await expect(page.locator('#baliPrivacyDialog')).toBeVisible();
 await expectCentered(page,'#baliPrivacyDialog');
 await accept(page);
 await expect(page.locator('#authProfileForm')).toBeVisible();
 await expectCentered(page,'#authModal .modal-content');
});

test('restored registered session stays on current page until explicit login',async({page})=>{
 await fixture(page,{returning:true});
 await expect.poll(()=>page.evaluate(()=>window.BaliAuth.isRegistered())).toBe(true);
 await expect(page.locator('#authModal')).not.toHaveClass(/active/);
 await expect(page.locator('#baliPrivacyDialog')).toBeHidden();
 expect(await page.evaluate(()=>window.__googleCalls)).toBe(0);
});
