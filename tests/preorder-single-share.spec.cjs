const {test,expect}=require("@playwright/test");
test.beforeEach(async({page})=>{
  await page.route("**/*",route=>{
    const url=new URL(route.request().url());
    return url.hostname==="127.0.0.1"?route.continue():route.abort();
  });
});
test("staff card has compact header, status legend, and 3 sharing choices",async({page})=>{
  await page.setViewportSize({width:390,height:844});
  await page.goto("/preorders.html");
  await expect(page.locator(".preorder-details-head .eyebrow")).toHaveCount(0);
  for(const id of ["orderDetailsDate","orderDetailsStatus","orderDetailsStatusText",
    "orderDetailsTitle","orderDetailsReferences","orderDetailsShare",
    "orderDetailsSharePng","orderDetailsSharePdf","orderDetailsShareTelegram"]){
    await expect(page.locator("#"+id)).toHaveCount(1);
  }
  await page.evaluate(()=>{
    const d=document.getElementById("orderDetailsDialog");
    document.getElementById("orderDetailsDate").textContent="30.10.2026";
    document.getElementById("orderDetailsTitle").textContent="MYZLOTO №1";
    document.getElementById("orderDetailsReferences").textContent="ID Jf12345";
    const container=document.getElementById("orderDetailsContent");
    const row=document.createElement("div");row.className="preorder-detail-contacts";
    for(const field of ["Николай","+375333786884","kolyaselekh@gmail.com"]){
      const box=document.createElement("div");box.className="preorder-detail-field";
      const value=document.createElement("strong");value.textContent=field;box.append(value);row.append(box);
    }
    container.append(row);
    d.showModal();
  });
  const row=page.locator(".preorder-detail-contacts");
  await expect(row).toBeVisible();
  const grid=await row.evaluate(el=>getComputedStyle(el).gridTemplateColumns.split(" ").length);
  expect(grid).toBe(3);
  await page.locator("#orderDetailsShare summary").click();
  await expect(page.locator("#orderDetailsShareTelegram")).toBeVisible();
  const titleY=await page.locator("#orderDetailsTitle").boundingBox();
  const referenceY=await page.locator("#orderDetailsReferences").boundingBox();
  expect(Math.abs(titleY.y-referenceY.y)).toBeLessThan(20);
});
test("single preorder text and file exports include guest, item and sum",async({page})=>{
  await page.goto("/preorders.html");
  const body=await page.evaluate(async()=>{
    const lib=await import("/bali-preorder-reports.js");
    const order={id:"abc",eventDate:"2026-10-30",eventTitle:"MYZLOTO",orderNumber:1,
      status:"confirmed",customerName:"Nikolay",customerPhone:"+375291111111",
      email:"guest@example.com",bookingId:"JF123",items:[{id:"dish",name:"Овощное ассорти",quantity:1,unitPrice:18}]};
    window.__shareLib=lib;
    window.__shareReport=lib.composeBaliSinglePreorder(order);
    return lib.preorderTelegramText(window.__shareReport);
  });
  expect(body).toContain("MYZLOTO №1");
  expect(body).toContain("Овощное ассорти");
  expect(body).toContain("18,00 BYN");
  expect(body).toContain("guest@example.com");
  for(const format of ["png","pdf"]){
    const promise=page.waitForEvent("download");
    await page.evaluate(format=>window.__shareLib.downloadBaliPreorderReport(window.__shareReport,format),format);
    const file=await promise;
    expect(file.suggestedFilename().endsWith("."+format)).toBe(true);
    await expect.poll(async()=>{const path=await file.path();return Boolean(path);}).toBe(true);
  }
});
