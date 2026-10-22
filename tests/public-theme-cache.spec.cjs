const {test,expect}=require("@playwright/test");

const asDoc=(theme,colors)=>({
  name:"projects/demo/databases/(default)/documents/settings/appearance",
  fields:{
    theme:{stringValue:theme},
    colors:{mapValue:{fields:Object.fromEntries(Object.entries(colors).map(
      ([key,value])=>[key,{stringValue:value}]
    ))}}
  }
});
async function fixture(page,handler){
  await page.route("**/theme-cache-fixture.html",r=>r.fulfill({
    contentType:"text/html",
    body:'<!doctype html><html data-bali-theme="lime"><head><script src="/firebase-config.js"></script><script type="module" src="/bali-theme-guest.js"></script></head><body>Theme fixture</body></html>'
  }));
  await page.route("**/api/public-data?*",handler);
}
test("guest theme comes from Cloudflare without Firebase database reads",async({page})=>{
  let appearanceRequests=0,firestoreRequests=0;
  page.on("request",req=>{
    if(req.url().includes("firestore.googleapis.com"))firestoreRequests++;
  });
  await fixture(page,route=>{
    const path=new URL(route.request().url()).searchParams.get("path");
    if(path==="settings/appearance"){
      appearanceRequests++;
      return route.fulfill({contentType:"application/json",body:JSON.stringify({
        documents:[asDoc("custom",{
          primary:"#123456",secondary:"#345678",text:"#90ABCD",border:"#ABCDEF"
        })]
      })});
    }
    return route.fulfill({contentType:"application/json",body:'{"documents":[]}'});
  });
  await page.goto("/theme-cache-fixture.html");
  await expect.poll(()=>page.evaluate(()=>document.documentElement.dataset.baliTheme)).toBe("custom");
  expect(await page.evaluate(()=>document.documentElement.style.getPropertyValue("--bt-primary"))).toBe("#123456");
  expect(await page.evaluate(()=>document.documentElement.style.getPropertyValue("--bt-stroke"))).toContain("rgba(");
  expect(appearanceRequests).toBe(1);
  expect(firestoreRequests).toBe(0);
});
test("guest theme safely defaults to lime on public cache failure",async({page})=>{
  await fixture(page,route=>route.fulfill({status:503,contentType:"application/json",
    body:'{"error":"unavailable","code":"unavailable"}'}));
  await page.goto("/theme-cache-fixture.html");
  await expect.poll(()=>page.evaluate(()=>document.documentElement.dataset.baliTheme)).toBe("lime");
  expect(await page.evaluate(()=>document.documentElement.style.getPropertyValue("--bt-primary"))).toBe("#B9FF51");
});
