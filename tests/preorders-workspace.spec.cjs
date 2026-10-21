const {test,expect}=require("@playwright/test");
test.beforeEach(async({page})=>{
  await page.route("**/*",route=>{
    const url=new URL(route.request().url());
    return url.hostname==="127.0.0.1"?route.continue():route.abort();
  });
});
test("dedicated preorder page contains no general admin editors",async({page})=>{
  await page.goto("/preorders.html");
  await expect(page.locator("#loginView")).toBeVisible();
  await expect(page.locator("#adminView")).toBeHidden();
  for(const id of ["ordersDateFilter","ordersEventFilter","createManualOrder",
    "clearExpiredOrders","exportEventOrders","exportEventDishes",
    "exportEventOrdersPng","exportEventOrdersTg","exportEventDishesPng","exportEventDishesTg",
    "orderEditDialog","editOrderGuestEmail","editOrderAddProduct"]) {
    await expect(page.locator("#"+id)).toHaveCount(1);
  }
  await expect(page.locator("#adminMenuPanel, #adminDesignPanel, #adminClientsPanel")).toHaveCount(0);
  await page.evaluate(()=>document.getElementById("adminView").hidden=false);
  await expect(page.locator("#createManualOrder")).toBeVisible();
  await expect(page.locator(".preorder-tools")).not.toHaveAttribute("open","");
  await page.locator(".preorder-tools summary").click();
  await expect(page.locator("#clearExpiredOrders")).toBeVisible();
  await expect(page.locator("#showArchivedOrders")).toHaveAttribute("type","button");
  await expect(page.locator("#showArchivedOrders")).toHaveAttribute("aria-pressed","false");
  await expect(page.locator('a[href="admin.html"]')).toHaveCount(0);
  await expect(page.locator("#editOrderStatus option")).toHaveCount(3);
  await expect(page.locator("#ordersStats")).toHaveCount(1);
  await expect(page.locator(".preorder-controls")).toBeVisible();
  await expect(page.locator('[aria-labelledby="ordersHeading"]')).toHaveCount(1);
  await expect(page.locator("#ordersHeading")).toBeVisible();
  await expect(page.locator("#preorderStaffLogin")).toHaveCount(1);
  await expect(page.locator("#staffLoginName")).toHaveAttribute("autocomplete","username");
  await expect(page.locator("#staffLoginPassword")).toHaveAttribute("type","password");
  await expect(page.locator('a[href="admin.html"]')).toHaveCount(0);
  await expect(page.locator("#orderDetailsDialog")).toHaveCount(1);
  await expect(page.locator("#orderDetailsContent")).toHaveCount(1);
  await expect(page.locator(".preorder-report-row")).toHaveCount(2);
  await expect(page.locator(".preorder-tools")).toHaveAttribute("open", "");
  await expect(page.locator(".preorder-tools")).toContainText("после закрытия приёма");
  await expect(page.locator(".preorder-tools")).not.toContainText("CSV");
});
test("general admin links to the dedicated preorder workspace",async({page})=>{
  await page.goto("/admin.html");
  await expect(page.locator('a[href="preorders.html"]')).toHaveCount(1);
  await expect(page.locator("#createManualOrder")).toHaveCount(1);
  await expect(page.locator("#clearExpiredOrders")).toHaveCount(1);
});

test("mobile full-order viewer is a centered modal separate from editing",async({page})=>{
  await page.setViewportSize({width:375,height:812});
  await page.goto("/preorders.html");
  await page.evaluate(()=>{
    document.getElementById("adminView").hidden=false;
    document.getElementById("orderDetailsTitle").textContent="FRIDAY SESSION №12";
    document.getElementById("orderDetailsDialog").showModal();
  });
  const dialog=page.locator("#orderDetailsDialog");
  await expect(dialog).toBeVisible();
  await expect(page.locator("#orderDetailsEdit")).toBeHidden();
  const rect=await dialog.boundingBox();
  expect(rect).not.toBeNull();
  expect(Math.abs(rect.x+rect.width/2-187.5)).toBeLessThan(6);
  expect(Math.abs(rect.y+rect.height/2-406)).toBeLessThan(6);
  await expect(page.locator("#closeOrderDetails")).toHaveAttribute("aria-label","Закрыть просмотр заказа");
  await page.evaluate(()=>document.getElementById("orderDetailsDialog").close());
  await expect(dialog).not.toBeVisible();
});

test("phone and desktop are viewport-locked, with the order list as the only scroll area",async({page})=>{
  for(const [width,height] of [[375,812],[320,640],[1366,768]]){
    await page.setViewportSize({width,height});
    await page.goto("/preorders.html");
    await page.evaluate(()=>{
      document.getElementById("loginView").hidden=true;
      document.getElementById("adminView").hidden=false;
      document.getElementById("staffHeaderAccount").hidden=false;
      document.getElementById("adminEmail").textContent="Менеджер";
      const list=document.getElementById("ordersAdminList");
      list.innerHTML=Array.from({length:35},()=>'<article class="preorder-compact-row" style="height:66px">Заказ</article>').join("");
      document.getElementById("ordersStats").innerHTML=["Всего заказов","Ожидают","Подтверждены"].map(label=>
        '<div class="preorder-stat"><span class="preorder-stat-label">'+label+'</span><strong class="preorder-stat-number">12</strong></div>').join("");
    });
    const sizes=await page.evaluate(()=>{
      const list=document.getElementById("ordersAdminList");
      return {
        viewHeight:innerHeight,bodyHeight:document.body.getBoundingClientRect().height,
        documentHeight:document.documentElement.scrollHeight,
        rootOverflow:getComputedStyle(document.body).overflowY,
        listOverflow:getComputedStyle(list).overflowY,
        listScrollHeight:list.scrollHeight,listClientHeight:list.clientHeight,
        stats:document.getElementById("ordersStats").children.length,
        header:document.querySelector(".topbar").getBoundingClientRect().height
      };
    });
    expect(sizes.rootOverflow).toBe("hidden");
    expect(sizes.documentHeight).toBeLessThanOrEqual(height+3);
    expect(sizes.bodyHeight).toBeLessThanOrEqual(height+3);
    expect(sizes.listOverflow).toBe("auto");
    expect(sizes.listScrollHeight).toBeGreaterThan(sizes.listClientHeight);
    expect(sizes.listClientHeight).toBeGreaterThan(45);
    expect(sizes.stats).toBe(3);
    await expect(page.locator(".topbar #adminSignOut")).toBeVisible();
    await expect(page.locator(".topbar #adminEmail")).toBeVisible();
    await expect(page.locator("#showArchivedOrders")).toBeHidden();
    await expect(page.locator('input[type="checkbox"]#showArchivedOrders')).toHaveCount(0);
  }
});

test("staff order-creation form remains present and shows the save action",async({page})=>{
  await page.goto("/preorders.html");
  const modal=page.locator("#orderEditDialog");
  await expect(modal).toHaveCount(1);
  await expect(page.locator("#orderEditForm")).toHaveCount(1);
  await expect(page.locator("#editOrderAddProduct")).toHaveCount(1);
  await expect(page.locator("#editOrderStatus option")).toHaveCount(3);
  await expect(page.locator("#orderEditForm button[type=submit]")).toHaveCount(1);
});
