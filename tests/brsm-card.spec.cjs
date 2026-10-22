const {test,expect}=require("@playwright/test");
// Real guest HTML/CSS with Firebase isolated. No reads from production BALI.
test.beforeEach(async({page})=>{
 const appModule="export const initializeApp =()=>({});export const getApps=()=>[];export const getApp=()=>({});";
 const authModule="export const getAuth=()=>({currentUser:{uid:'guest-abc-123',emailVerified:true}});export class GoogleAuthProvider{};export const signInWithPopup=async()=>({});export const onAuthStateChanged=(auth,callback)=>{callback(auth.currentUser);return ()=>{};};";
 const dbModule=[
  "export const getFirestore=()=>({});",
  "export const doc=(_db,...parts)=>({path:parts.join('/')});",
  "export const onSnapshot=(ref,callback)=>{",
  "if(ref.path==='brsmCards/guest-abc-123'){",
  "callback({exists:()=>true,data:()=>({active:true,name:'NIKOLAY',number:'000001',",
  "visits:[{eventId:'one',date:'2026-10-25'},{eventId:'two',date:'2026-11-01'},{eventId:'three',date:'2026-11-08'}],",
  "numbers:[7,12,18,24,31,33,41,55,68,77],ready:true})});",
  "}else if(ref.path==='brsmDraws/main'){",
  "callback({exists:()=>true,data:()=>({status:'live',threshold:5,called:[7,18],participants:1})});",
  "}return ()=>{};};"
 ].join("\n");
 const fnModule="export const getFunctions=()=>({});export const httpsCallable=()=>async()=>({data:{}});";
 await page.route(/https:\/\/www\.gstatic\.com\/firebasejs\/10\.14\.1\/firebase-(app|auth|firestore|functions)\.js/,async route=>{
  const type=route.request().url().match(/firebase-(app|auth|firestore|functions)\.js/)[1];
  const code={app:appModule,auth:authModule,firestore:dbModule,functions:fnModule}[type];
  await route.fulfill({status:200,contentType:"application/javascript",body:code});
 });
});
test("BRSM card contains guest-facing sections and crosses called numbers",async({page})=>{
 await page.goto("/brsm.html");
 await expect(page.locator("#brsmCardArea")).toBeVisible();
 await expect(page.locator(".brsm-card")).toHaveCount(2);
 await expect(page.locator(".brsm-label").first()).toContainText("BALI CARD");
 await expect(page.locator(".brsm-label").first()).toContainText("BRSM");
 await expect(page.locator("#brsmName")).toHaveText("NIKOLAY");
 await expect(page.locator("#brsmNumber")).toHaveText("000001");
 await expect(page.locator(".brsm-visit")).toHaveCount(3);
 await expect(page.locator(".brsm-visit.done")).toHaveCount(3);
 await expect(page.locator(".brsm-ball")).toHaveCount(10);
 await expect(page.locator(".brsm-ball.hit")).toHaveCount(2);
 await expect(page.locator("#brsmDrawStatus")).toContainText("Идёт розыгрыш");
 if((page.viewportSize()?.width||0)<=850){
   await expect(page.locator(".brsm-front")).toBeVisible();
   await expect(page.locator(".brsm-back")).toBeHidden();
   await page.locator("#brsmFlip").click();
   await expect(page.locator(".brsm-back")).toBeVisible();
   await expect(page.locator(".brsm-front")).toBeHidden();
 }else{
   await expect(page.locator(".brsm-front")).toBeVisible();
   await expect(page.locator(".brsm-back")).toBeVisible();
 }
});
