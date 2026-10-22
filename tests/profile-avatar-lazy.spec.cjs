const {test,expect}=require("@playwright/test");

test("restored login does not read private avatar until My BALI opens",async({page})=>{
  await page.route("**/avatar-fixture.html",r=>r.fulfill({
    contentType:"text/html",
    body:`<!doctype html><html lang="ru"><body data-bali-page="home">
      <button id="baliAvatarButton"></button>
      <input type="file" id="baliAvatarUpload">
      <img id="baliAvatarImage" hidden><span id="baliAvatarInitial">B</span>
      <div id="baliAvatarFeedback" hidden></div>
      <script>
        window.BALI_FIREBASE_CONFIG={projectId:"mock"};
        window.__reads=0;window.__closed=0;
        window.__auth={currentUser:{uid:"fixture-user",emailVerified:true}};
        window.BaliAuth={ready:Promise.resolve(),getProfile:()=>({uid:"fixture-user",name:"Гость"}),isRegistered:()=>true};
        window.__go=page=>{
          document.body.dataset.baliPage=page;
          window.dispatchEvent(new CustomEvent("bali:guest-page",{detail:{page}}));
        };
      </script>
      <script type="module" src="/bali-profile-media.js"></script>
    </body></html>`
  }));
  await page.route("**/*",route=>{
    const url=new URL(route.request().url());
    if(url.hostname==="127.0.0.1")return route.fallback();
    const filename=url.pathname.split("/").at(-1);
    const modules={
      "firebase-app.js":"export const getApps=()=>[{}],getApp=()=>({}),initializeApp=()=>({});",
      "firebase-auth.js":"export const getAuth=()=>window.__auth;export const onAuthStateChanged=(_,fn)=>{queueMicrotask(()=>fn(window.__auth.currentUser));return ()=>{}};",
      "firebase-firestore.js":`export const getFirestore=()=>({}),doc=(_, ...p)=>p.join("/"),serverTimestamp=()=>({}),
        setDoc=async()=>{},
        onSnapshot=(_ref,ok)=>{window.__reads++;ok({exists:()=>true,data:()=>({image:"data:image/webp;base64,AQ=="})});return ()=>{window.__closed++};};`
    };
    return modules[filename]?route.fulfill({contentType:"text/javascript",body:modules[filename]}):route.abort();
  });
  await page.goto("/avatar-fixture.html");
  await page.waitForTimeout(150);
  expect(await page.evaluate(()=>window.__reads)).toBe(0);
  await page.evaluate(()=>window.__go("profile"));
  await expect.poll(()=>page.evaluate(()=>window.__reads)).toBe(1);
  await expect(page.locator("#baliAvatarImage")).toBeVisible();
  await page.evaluate(()=>window.__go("profile"));
  await page.waitForTimeout(80);
  expect(await page.evaluate(()=>window.__reads)).toBe(1);
  await page.evaluate(()=>window.__go("menu"));
  await expect.poll(()=>page.evaluate(()=>window.__closed)).toBe(1);
  await page.evaluate(()=>window.__go("profile"));
  await expect.poll(()=>page.evaluate(()=>window.__reads)).toBe(2);
  await page.evaluate(()=>window.dispatchEvent(new CustomEvent("bali:auth-state",{detail:{registered:false}})));
  await expect.poll(()=>page.evaluate(()=>window.__closed)).toBe(2);
  await expect(page.locator("#baliAvatarImage")).toBeHidden();
});
