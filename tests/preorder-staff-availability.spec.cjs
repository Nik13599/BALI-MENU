const {test,expect}=require("@playwright/test");
const {readFileSync}=require("node:fs");

const html=readFileSync("admin.html","utf8").replace(
  /<script\b[^>]*>[\s\S]*?<\/script>/g,
  tag=>/src="(?:firebase-config|preorder-staff-admin)\.js/.test(tag)?tag:""
);
async function staffPage(page,backend){
  await page.addInitScript(v=>{window.__staffBackend=v;window.__staffCalls=[];},backend);
  await page.route("**/admin.html",r=>r.fulfill({contentType:"text/html",body:html}));
  await page.route("https://www.gstatic.com/firebasejs/10.14.1/firebase-app.js",r=>
    r.fulfill({contentType:"text/javascript",body:
      'export const getApps=()=>[];export const getApp=()=>({});export const initializeApp=()=>({});'}));
  await page.route("https://www.gstatic.com/firebasejs/10.14.1/firebase-auth.js",r=>
    r.fulfill({contentType:"text/javascript",body:
      'export const getAuth=()=>({});export const onAuthStateChanged=(a,cb)=>{queueMicrotask(()=>cb({uid:"test-admin",emailVerified:true}));return ()=>{}};'}));
  await page.route("https://www.gstatic.com/firebasejs/10.14.1/firebase-firestore.js",r=>
    r.fulfill({contentType:"text/javascript",body:
      'export const getFirestore=()=>({});export const doc=(db,...p)=>({path:p.join("/")});export const getDoc=async()=>({exists:()=>true,data:()=>({active:true})});'}));
  await page.route("https://www.gstatic.com/firebasejs/10.14.1/firebase-functions.js",r=>
    r.fulfill({contentType:"text/javascript",body:`
      export const getFunctions=()=>({});
      export const httpsCallable=()=>(async input=>{
        window.__staffCalls.push({action:input.action});
        if(window.__staffBackend==="down")
          throw Object.assign(new Error("internal"),{code:"functions/internal"});
        if(input.action==="list")return {data:{staff:[]}};
        if(input.action==="create")return {data:{ok:true}};
        throw new Error("Unknown test call");
      });
    `}));
  await page.route("**/*",r=>{
    const u=new URL(r.request().url());
    return u.hostname==="127.0.0.1"?r.continue():r.abort();
  });
  await page.goto("/admin.html",{waitUntil:"domcontentloaded"});
  await page.evaluate(()=>{
    document.getElementById("loginView").hidden=true;
    document.getElementById("adminView").hidden=false;
  });
  await expect(page.locator("#preorderStaffManagement")).toBeVisible();
}
test("staff create is disabled when server callable returns internal",async({page})=>{
  await staffPage(page,"down");
  await expect(page.locator("#preorderStaffCreate")).toBeDisabled();
  await expect(page.locator("#preorderStaffSetupHelp")).toBeVisible();
  await expect(page.locator("#preorderStaffSetupHelp")).toHaveAttribute("open","");
  await expect(page.locator("#preorderStaffAdminStatus")).toContainText("internal");
  await expect(page.locator("#preorderStaffList")).toContainText("Регистрация недоступна");
  await expect(page.locator("#preorderStaffSetupHelp a")).toHaveCount(5);
  const calls=await page.evaluate(()=>window.__staffCalls);
  expect(calls.map(x=>x.action)).toEqual(["list"]);
});

test("creating staff becomes available after server list check succeeds",async({page})=>{
  await staffPage(page,"down");
  await expect(page.locator("#preorderStaffCreate")).toBeDisabled();
  await page.evaluate(()=>window.__staffBackend="up");
  await page.locator("#preorderStaffRefresh").click();
  await expect(page.locator("#preorderStaffCreate")).toBeEnabled();
  await expect(page.locator("#preorderStaffSetupHelp")).toBeHidden();
  await page.locator("#preorderStaffName").fill("Тестовый сотрудник");
  await page.locator("#preorderStaffLogin").fill("test_staff");
  await page.locator("#preorderStaffPassword").fill("unit-test-password-123!");
  await page.locator("#preorderStaffCreate").click();
  await expect(page.locator("#preorderStaffAdminStatus")).toContainText("создан");
  expect(await page.locator("#preorderStaffPassword").inputValue()).toBe("");
  const calls=await page.evaluate(()=>window.__staffCalls);
  expect(calls.map(x=>x.action)).toEqual(["list","list","create","list"]);
});
