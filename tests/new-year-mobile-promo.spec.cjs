const {test,expect}=require("@playwright/test");
const fs=require("node:fs");
const path=require("node:path");

// Isolate the promotional renderer from the production Firebase connection.
test.beforeEach(async({page})=>{
  await page.route("**/*",route=>
    new URL(route.request().url()).hostname==="127.0.0.1"?
      route.continue():route.abort());
});

async function loadHoliday(page){
  await page.goto("/index.html");
  const source=fs.readFileSync(path.join(__dirname,"..","bali-pc-offers.js"),"utf8");
  const isolated=source.replace(/^import\s+.*?;\s*$/gm,"");
  await page.addScriptTag({content:`
    const initializeApp=()=>({}),getApps=()=>[],getApp=()=>({});
    const getFirestore=()=>({}),collection=()=>({}),query=()=>({}),where=()=>({});
    const onSnapshot=()=>()=>{};
    `+isolated});
  await expect(page.locator(".bali-pc-hero")).toHaveClass(/is-seasonal/);
  await page.locator("#baliPcHeroPoster").evaluate(image=>image.decode());
}

test("New Year image fills mobile card and labeled booking control opens contacts",async({page})=>{
  test.skip(page.viewportSize().width>=768,"mobile-only behavior");
  await loadHoliday(page);
  const hero=page.locator(".bali-pc-hero");
  const poster=page.locator("#baliPcHeroPoster");
  const imageBox=await poster.boundingBox();
  const heroBox=await hero.boundingBox();
  expect(imageBox).toBeTruthy();
  expect(heroBox).toBeTruthy();
  expect(imageBox.width).toBeGreaterThanOrEqual(heroBox.width-3);
  expect(imageBox.height).toBeGreaterThanOrEqual(heroBox.height-3);
  expect(await poster.evaluate(image=>getComputedStyle(image).objectFit)).toBe("cover");
  expect(await poster.evaluate(image=>getComputedStyle(image).objectPosition)).toMatch(/^0%|left/);
  const cta=page.locator("#baliPcOfferAction");
  await expect(cta).toBeVisible();
  await expect(cta).toContainText("Забронировать заранее");
  const buttonBox=await cta.boundingBox();
  expect(buttonBox.x).toBeGreaterThanOrEqual(heroBox.x);
  expect(buttonBox.x+buttonBox.width).toBeLessThanOrEqual(heroBox.x+heroBox.width+2);
  expect(buttonBox.y+buttonBox.height).toBeLessThanOrEqual(heroBox.y+heroBox.height+2);
  await page.evaluate(()=>{
    window.__contactPromoOpens=0;
    window.addEventListener("bali:promo-contacts",()=>window.__contactPromoOpens++);
  });
  await cta.click();
  expect(await page.evaluate(()=>window.__contactPromoOpens)).toBe(1);
});

test("Desktop keeps the complete original holiday artwork",async({page})=>{
  test.skip(page.viewportSize().width<1180,"desktop-only behavior");
  await loadHoliday(page);
  const poster=page.locator("#baliPcHeroPoster");
  expect(await poster.evaluate(image=>getComputedStyle(image).objectFit)).toBe("contain");
  await expect(page.locator(".bali-pc-artwork-hotspot:not(.bali-pc-artwork-hotspot-secondary):not(.bali-pc-artwork-hotspot-third)")).toBeVisible();
});
