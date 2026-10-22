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
    "clearExpiredOrders","preorderReportScope",
    "preorderReportOrdersPdf","preorderReportOrdersPng","preorderReportOrdersTg",
    "preorderReportDishesView","preorderReportDishesPdf","preorderReportDishesPng",
    "preorderReportDishesTg","preorderReportIncludeCancelled","preorderDishesOnline",
    "orderEditDialog","editOrderGuestEmail","editOrderAddProduct"]) {
    await expect(page.locator("#"+id)).toHaveCount(1);
  }
  await expect(page.locator("#adminMenuPanel, #adminDesignPanel, #adminClientsPanel")).toHaveCount(0);
  await page.evaluate(()=>{document.getElementById("loginView").hidden=true;document.getElementById("adminView").hidden=false;});
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
  await expect(page.locator("#ordersHeading")).toHaveText("Предзаказы");
  await expect(page.locator("#adminOrdersPanel")).toHaveAccessibleName("Предзаказы");
  await expect(page.locator("#preorderStaffLogin")).toHaveCount(1);
  await expect(page.locator("#staffLoginName")).toHaveAttribute("autocomplete","username");
  await expect(page.locator("#staffLoginPassword")).toHaveAttribute("type","password");
  await expect(page.locator('a[href="admin.html"]')).toHaveCount(0);
  await expect(page.locator("#orderDetailsDialog")).toHaveCount(1);
  await expect(page.locator("#orderDetailsContent")).toHaveCount(1);
  await expect(page.locator(".preorder-report-row")).toHaveCount(2);
  await expect(page.locator("#preorderReportDate, #preorderReportEvent")).toHaveCount(0);
  await expect(page.locator("#preorderReportScope")).toContainText("Выберите дату");
  await expect(page.locator("#preorderReportOrdersPdf")).toBeDisabled();
  await expect(page.locator("#preorderReportDishesView")).toBeDisabled();
  await expect(page.locator("#preorderDishesOnline")).toBeHidden();
  await expect(page.locator(".preorder-tools")).toContainText("Отчёты по предзаказам");
  await expect(page.locator(".preorder-tools")).toContainText("Общий список предзаказов");
  await expect(page.locator(".preorder-tools")).toContainText("Сводка по блюдам");
  await expect(page.locator(".preorder-tools")).toHaveAttribute("open", "");
  await expect(page.locator(".preorder-tools")).toContainText("Отчёт использует дату и мероприятие");
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

test("guest preorder checkout uses inline accessible error instead of native alert",async({page})=>{
  await page.goto("/");
  await expect(page.locator("#checkoutOrderError")).toHaveCount(1);
  await expect(page.locator("#checkoutOrderError")).toHaveAttribute("role","alert");
  await expect(page.locator("#checkoutOrderError")).toBeHidden();
  await expect(page.locator("#checkoutForm .submit-order-btn")).toHaveCount(1);
});

test("new preorder button fits mobile compactly",async({page})=>{
  await page.setViewportSize({width:390,height:844});
  await page.goto("/preorders.html");
  await page.evaluate(()=>{
    document.getElementById("loginView").hidden=true;
    document.getElementById("adminView").hidden=false;
  });
  const button=page.locator("#createManualOrder");
  await expect(button).toBeVisible();
  await expect(button).toHaveText(/Новый предзаказ/);
  const bounds=await button.boundingBox();
  const panel=await page.locator(".preorder-controls").boundingBox();
  expect(bounds.width).toBeLessThan(panel.width*.82);
  expect(bounds.height).toBeLessThanOrEqual(42);
  const size=await button.evaluate(el=>Number.parseFloat(getComputedStyle(el).fontSize));
  expect(size).toBeLessThanOrEqual(14);
});

test("report reuses the top date and event selection without duplicate inputs",async({page})=>{
  await page.setViewportSize({width:390,height:844});
  await page.goto("/preorders.html");
  await page.evaluate(()=>{
    document.getElementById("loginView").hidden=true;
    document.getElementById("adminView").hidden=false;
    document.querySelector(".preorder-tools").open=true;
  });
  await expect(page.locator("#ordersDateFilter")).toHaveCount(1);
  await expect(page.locator("#ordersEventFilter")).toHaveCount(1);
  await expect(page.locator("#preorderReportDate, #preorderReportEvent")).toHaveCount(0);
  await expect(page.locator("#preorderReportScope")).toContainText("Выберите дату");
  await expect(page.locator("#preorderReportOrdersPdf")).toBeDisabled();
  await expect(page.locator("#preorderReportDishesView")).toBeDisabled();
  await expect(page.locator("#preorderReportIncludeCancelled")).not.toBeChecked();
  await expect(page.locator("#preorderReportOrdersPng")).toHaveCount(1);
  await expect(page.locator("#preorderReportDishesTg")).toHaveCount(1);
});

test("report implementation reads the same filters as the staff queue",async()=>{
  const {readFileSync}=require("node:fs");
  const source=readFileSync("admin-orders.js","utf8");
  const extract=source.slice(source.indexOf("async function fetchWorkspaceReport(kind)"),
    source.indexOf("function renderDishOnline(report)"));
  expect(extract).toContain('const date=$("ordersDateFilter").value;');
  expect(extract).toContain('const id=$("ordersEventFilter").value;');
  expect(source).toContain("function syncWorkspaceReportScope()");
  expect(source).not.toContain('$("preorderReportDate")');
  expect(source).not.toContain('$("preorderReportEvent")');
});
