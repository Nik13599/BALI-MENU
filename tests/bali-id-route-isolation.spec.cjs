const {test,expect}=require("@playwright/test");
test.beforeEach(async({page})=>{
  await page.route("**/*",route=>
    new URL(route.request().url()).hostname==="127.0.0.1"
      ?route.continue():route.abort());
});
test("ID card is completely hidden outside its own page, even with fixed display overrides",async({page})=>{
  await page.goto("/index.html#events");
  const section=page.locator("#baliIdSection");
  await expect(section).toBeHidden();
  const hidden=await section.evaluate(node=>({
    display:getComputedStyle(node).display,
    rect:node.getBoundingClientRect().toJSON(),
    route:document.body.dataset.baliPage
  }));
  expect(hidden.display).toBe("none");
  expect(hidden.rect.width).toBe(0);
  expect(hidden.rect.height).toBe(0);
  expect(hidden.route).toBe("events");

  // Open only the card page; its original size and ratio must remain intact.
  await page.evaluate(()=>{
    document.body.dataset.baliPage="id";
    document.getElementById("baliIdSection").hidden=false;
  });
  await expect(section).toBeVisible();
  await expect(page.locator("#baliIdFlipScene")).toBeVisible();
  const ratio=await page.locator("#baliIdFlipScene").evaluate(node=>{
    const rect=node.getBoundingClientRect();
    return rect.width/rect.height;
  });
  expect(ratio).toBeGreaterThan(1.6);
  expect(ratio).toBeLessThan(1.8);

  // After any ordinary navigation the fixed surface must not persist.
  for(const route of ["home","menu","events","profile","contacts"]){
    await page.evaluate(route=>window.navigateGuestPage(route),route);
    await expect(section).toBeHidden();
    const styles=await section.evaluate(node=>({
      display:getComputedStyle(node).display,route:document.body.dataset.baliPage
    }));
    expect(styles).toEqual({display:"none",route});
  }
});
test("ID-related dialogs close automatically when leaving the card page",async({page})=>{
  await page.goto("/index.html#home");
  await page.evaluate(()=>{
    document.body.dataset.baliPage="id";
    document.getElementById("baliIdSection").hidden=false;
    document.getElementById("baliHistoryDialog").showModal();
  });
  await expect(page.locator("#baliHistoryDialog")).toBeVisible();
  await page.evaluate(()=>window.navigateGuestPage("events"));
  await expect(page.locator("#baliIdSection")).toBeHidden();
  await expect(page.locator("#baliHistoryDialog")).not.toHaveAttribute("open",/./);
});
test("PC home card and mobile header retain their BALI ID entry points",async({page})=>{
  await page.goto("/index.html#home");
  await expect(page.locator("#baliHomeIdCard")).toHaveCount(1);
  await expect(page.locator("#baliMobileIdBtn")).toHaveCount(1);
  expect(await page.locator("#baliMobileIdBtn").getAttribute("aria-label")).toContain("BALI ID");
  expect(await page.locator("#baliHomeIdCard").getAttribute("aria-label")).toContain("BALI");
});