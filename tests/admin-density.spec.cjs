const {test,expect}=require("@playwright/test");

test.beforeEach(async({page})=>{
  await page.route("**/*",route=>{
    const url=new URL(route.request().url());
    return url.hostname==="127.0.0.1"?route.continue():route.abort();
  });
});

async function exposeAdmin(page){
  await page.evaluate(()=>{
    document.getElementById("loginView").hidden=true;
    document.getElementById("adminView").hidden=false;
    document.body.dataset.baliAdminSection="overview";
  });
}

test("admin workspace is compact and viewport-contained on phone, tablet and desktop",async({page})=>{
  for(const [width,height] of [[320,640],[375,812],[768,900],[1366,768]]){
    await page.setViewportSize({width,height});
    await page.goto("/admin.html",{waitUntil:"domcontentloaded"});
    await exposeAdmin(page);
    await expect(page.locator("#adminView")).toBeVisible();
    const geometry=await page.evaluate(()=>{
      const root=document.body,main=document.querySelector("#adminView .admin-main");
      const nav=document.querySelector(".admin-tabs"),shell=document.getElementById("adminView");
      const toolbar=document.querySelector(".admin-toolbar");
      return {
        bodyHeight:root.getBoundingClientRect().height,
        documentHeight:document.documentElement.scrollHeight,
        pageWidth:document.documentElement.scrollWidth,
        rootOverflow:getComputedStyle(root).overflowY,
        mainOverflow:getComputedStyle(main).overflowY,
        mainHeight:main.getBoundingClientRect().height,
        shellHeight:shell.getBoundingClientRect().height,
        topbarHeight:document.querySelector(".topbar").getBoundingClientRect().height,
        toolbarHeight:toolbar.getBoundingClientRect().height,
        navOverflow:getComputedStyle(nav).overflowX
      };
    });
    expect(geometry.rootOverflow).toBe("hidden");
    expect(geometry.bodyHeight).toBeLessThanOrEqual(height+3);
    expect(geometry.documentHeight).toBeLessThanOrEqual(height+3);
    expect(geometry.pageWidth).toBeLessThanOrEqual(width+3);
    expect(geometry.mainOverflow).toBe("auto");
    expect(geometry.mainHeight).toBeGreaterThan(120);
    expect(geometry.shellHeight).toBeLessThan(height);
    expect(geometry.topbarHeight).toBeLessThanOrEqual(53);
    expect(geometry.toolbarHeight).toBeLessThanOrEqual(70);
    if(width<=900)expect(geometry.navOverflow).toBe("auto");
    await expect(page.locator("#adminServiceTools")).toHaveCount(1);
    await expect(page.locator("#baliPublicPublishAll")).toHaveCount(1);
    await expect(page.locator("#baliMigrationAuditButton")).toHaveCount(1);
  }
});

test("switching tabs preserves all seven admin sections and uses inner scrolling",async({page})=>{
  await page.setViewportSize({width:375,height:812});
  await page.goto("/admin.html",{waitUntil:"domcontentloaded"});
  await exposeAdmin(page);
  const tabs=["overview","orders","clients","menu","events","design","appearance"];
  await expect(page.locator(".admin-tab")).toHaveCount(tabs.length);
  await page.locator("#adminServiceTools summary").click();
  await expect(page.locator("#baliPublicPublishAll")).toBeVisible();
  await page.locator("#adminServiceTools summary").click();
  for(const name of tabs){
    await page.locator('[data-admin-tab="'+name+'"]').click();
    await expect(page.locator('[data-admin-panel="'+name+'"]')).toBeVisible();
    await expect(page.locator('[data-admin-panel]:visible')).toHaveCount(1);
  }
  await page.locator('[data-admin-tab="overview"]').click();
  const main=page.locator("#adminView .admin-main");
  await main.evaluate(el=>el.scrollTop=300);
  const before=await main.evaluate(el=>el.scrollTop);
  expect(before).toBeGreaterThan(0);
  await page.locator('[data-admin-tab="menu"]').click();
  await expect.poll(()=>main.evaluate(el=>el.scrollTop)).toBe(0);
});
