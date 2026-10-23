const {test,expect}=require("@playwright/test");
// Static viewport checks. Never contact live Firebase or Google accounts.
test.beforeEach(async({page})=>{
  await page.route("**/*",route=>{
    const url=new URL(route.request().url());
    return url.hostname==="127.0.0.1"?route.continue():route.abort();
  });
});
async function showCard(page,reverse=false){
  await page.goto("/index.html#id",{waitUntil:"domcontentloaded"});
  await page.evaluate(back=>{
    // This is a STATIC design test: detach BALI ID from the authenticated
    // single-page-app shell, which intentionally hides it without Firebase.
    const root=document.getElementById("baliIdSection");
    const panel=document.getElementById("brsmGuestPanel");
    document.body.append(root);
    root.hidden=false;
    root.style.setProperty("display","block","important");
    root.style.setProperty("visibility","visible","important");
    root.style.setProperty("opacity","1","important");
    panel.hidden=false;panel.classList.add("brsm-open");
    document.getElementById("brsmFlip").hidden=false;
    document.getElementById("brsmFront").hidden=back;
    document.getElementById("brsmBack").hidden=!back;
    document.body.classList.add("bali-guest-theme");
  },reverse);
}
test("BRSM front has white brand, owner name and personal ID, without MEMBER",async({page})=>{
  await showCard(page,false);
  const card=page.locator("#brsmFront");
  await expect(card).toBeVisible();
  await expect(card.locator(".brsm-head")).toContainText("Bali Card");
  await expect(card.locator(".brsm-head")).toContainText("BRSM");
  await expect(card.locator("#brsmName")).toContainText("ГОСТЬ BALI");
  await expect(card.locator("#brsmNumber")).toHaveText("000000");
  await expect(card).not.toContainText("MEMBER");
  await expect.poll(()=>page.locator("#brsmFront img").evaluate(img=>img.complete&&img.naturalWidth>0)).toBe(true);
  const metrics=await page.evaluate(()=>{
    const face=document.getElementById("brsmFront");
    const logo=face.querySelector(".brsm-brand-image");
    return {width:face.getBoundingClientRect().width,height:face.getBoundingClientRect().height,
      filter:getComputedStyle(logo).filter,
      logoLoaded:logo.complete&&logo.naturalWidth>0,
      originalCardDisplay:getComputedStyle(document.querySelector("#baliIdSection .bali-profile-card")).display};
  });
  expect(metrics.width).toBeGreaterThan(200);
  expect(metrics.height).toBeGreaterThan(110);
  expect(metrics.logoLoaded).toBeTruthy();
  expect(metrics.filter).toContain("brightness(0) invert(1)");
  expect(metrics.originalCardDisplay).toBe("none");
});
test("BRSM reverse shows exactly three distinct visit slots and ten concealed numbers",async({page})=>{
  await showCard(page,true);
  const card=page.locator("#brsmBack");
  await expect(card).toBeVisible();
  await expect(card.locator(".brsm-slot")).toHaveCount(3);
  await expect(card.locator(".brsm-digit")).toHaveCount(10);
  await expect(card.locator(".brsm-digit")).toHaveText(Array(10).fill("?"));
  await expect(card).toContainText("iPhone 18 Pro");
});
test("BRSM operator workspace is separate from general admin tabs",async({page})=>{
  await page.goto("/admin.html",{waitUntil:"domcontentloaded"});
  await expect(page.locator('a[href="brsm-admin.html"]')).toHaveCount(1);
  await expect(page.locator(".admin-tab")).toHaveCount(7);
  await page.goto("/brsm-admin.html",{waitUntil:"domcontentloaded"});
  await expect(page.locator("#brsmLogin")).toBeVisible();
  await expect(page.locator("#brsmWorkspace")).toBeHidden();
  await expect(page.locator("#brsmSignIn")).toBeVisible();
});

test("separate bar-redemption screen supports staff password without changing BALI Staff",async({page})=>{
  await page.goto("/bali-coin-staff.html",{waitUntil:"domcontentloaded"});
  await expect(page.locator("#barStaffLogin")).toBeVisible();
  await expect(page.locator("#barStaffWorkspace")).toBeHidden();
  await expect(page.locator('#barStaffPasswordForm input[name="login"]')).toBeVisible();
  await expect(page.locator('#barStaffPasswordForm input[type="password"]')).toBeVisible();
  await expect(page.locator("#barStaffSignIn")).toBeVisible();
  await expect(page.locator("#barStaffForm")).toHaveCount(1);
});
test("BRSM director console includes adjustable bar menu and reward forms",async({page})=>{
  await page.goto("/brsm-admin.html",{waitUntil:"domcontentloaded"});
  await expect(page.locator("#brsmCoinWorkspace")).toHaveCount(1);
  await expect(page.locator('#brsmCoinLotForm select[name="category"] option[value="bar"]')).toHaveCount(1);
  await expect(page.locator("#brsmCoinEventForm")).toHaveCount(1);
  await expect(page.locator("#brsmCoinActivityForm")).toHaveCount(1);
  await expect(page.locator("#brsmCoinFulfillForm")).toHaveCount(1);
});
test("shared wallet market script is linked once to BALI ID",async({page})=>{
  await page.goto("/index.html",{waitUntil:"domcontentloaded"});
  await expect(page.locator('script[src^="bali-coin-market.js"]')).toHaveCount(1);
  await expect(page.locator('script[src^="brsm-card.js"]')).toHaveCount(1);
});
