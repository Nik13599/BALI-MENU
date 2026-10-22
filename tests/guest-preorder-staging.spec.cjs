const {test,expect}=require("@playwright/test");
test.beforeEach(async({page})=>{
  await page.route("**/*",route=>{
    const u=new URL(route.request().url());
    return u.hostname==="127.0.0.1"?route.continue():route.abort();
  });
});
test("normal BALI guest page offers account-free checkout but keeps modal closed",async({page})=>{
  await page.goto("/index.html");
  expect(await page.evaluate(()=>window.BALI_GUEST_PREORDER_ENABLED)).toBe(true);
  await expect(page.locator("#baliGuestCheckoutConsent")).toBeHidden();
});
test("guest can fill compulsory contact, date, event and table without Google login",async({page})=>{
  await page.addInitScript(()=>{
    window.turnstile={render:(root,config)=>{
      window.__testTurnstileConfig=config;
      return 1;
    },reset:()=>{}};
  });
  let requestData=null;
  await page.route("**/api/bali-v3",async route=>{
    requestData=route.request().postDataJSON();
    await route.fulfill({status:200,contentType:"application/json",
      body:JSON.stringify({ok:true,data:{order:{id:"o_test",orderNumber:1,total:25}}})});
  });
  await page.goto("/index.html#menu");
  expect(await page.evaluate(()=>window.BALI_GUEST_PREORDER_ENABLED)).toBe(true);
  await page.evaluate(()=>{
    window.dispatchEvent(new CustomEvent("bali:menu",{detail:{items:[{
      id:1,name:"Тестовое блюдо",category:"Кухня",price:25,available:true
    }]}}));
    window.dispatchEvent(new CustomEvent("bali:events",{detail:{events:[{
      id:"2099-10-24",date:"2099-10-24",title:"Тест BALI",preorderEnabled:true,
      closesAt:{toDate:()=>new Date("2099-10-24T22:00:00Z")}
    }]}}));
    window.addToCart(1,1);
  });
  await page.evaluate(()=>window.openCheckout());
  await expect(page.locator("#checkoutModal")).toHaveClass(/active/);
  await expect(page.locator("#customerName")).not.toHaveAttribute("readonly");
  await expect(page.locator("#customerPhone")).not.toHaveAttribute("readonly");
  await expect(page.locator("#baliCheckoutEmailRow")).toBeHidden();
  await expect(page.locator("#baliGuestCheckoutConsent")).toBeVisible();
  await page.locator("#customerName").fill("Пробный гость");
  await page.locator("#customerPhone").fill("+375291234567");
  await page.locator("#eventDateSelect").selectOption("2099-10-24");
  await page.locator("#eventSelect").selectOption("2099-10-24");
  await page.locator("#orderReference").fill("12");
  await page.locator("#baliGuestPrivacyConsent").check();
  await page.locator("#baliGuestInternationalConsent").check();
  await expect.poll(()=>page.evaluate(()=>Boolean(window.__testTurnstileConfig?.callback))).toBe(true);
  await page.evaluate(()=>window.__testTurnstileConfig.callback("staging-token"));
  await page.locator("#checkoutForm button[type=submit]").click();
  await expect.poll(()=>requestData!==null).toBe(true);
  expect(requestData.action).toBe("guestCreateOrder");
  expect(requestData.token).toBe("");
  expect(requestData.turnstileToken).toBe("staging-token");
  expect(requestData.payload.customerName).toBe("Пробный гость");
  expect(requestData.payload.customerPhone).toBe("+375291234567");
  expect(requestData.payload.eventDate).toBe("2099-10-24");
  expect(requestData.payload.eventId).toBe("2099-10-24");
  expect(requestData.payload.tableNumber).toBe("12");
  expect(requestData.payload.privacyConsent).toBe(true);
  expect(requestData.payload.items).toEqual([{id:1,quantity:1}]);
  await expect(page.locator("#successModal")).toHaveClass(/active/);
});
