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


test("compact order keeps full details and pins color status at top right on all screens",async({page})=>{
  for(const width of [320,390,900,1366]){
    await page.setViewportSize({width,height:820});
    await page.goto("/preorders.html");
    await page.evaluate(()=>{
      document.getElementById("loginView").hidden=true;
      document.getElementById("adminView").hidden=false;
      document.getElementById("ordersAdminList").innerHTML=[
        '<article class="preorder-compact-row">',
        '<div class="preorder-primary">',
        '<div class="preorder-cell reference"><time class="preorder-queue-date">30.10.26</time>',
        '<div class="preorder-queue-headline"><strong>МУЗЛОТО №18</strong>',
        '<span class="preorder-queue-reference">Столик №12</span></div></div>',
        '<div class="preorder-cell guest"><div class="preorder-queue-identity">',
        '<strong>Александр</strong><a class="preorder-queue-phone" href="tel:+375291234567">+375291234567</a></div>',
        '<div class="preorder-cell dishes"><strong>3 поз. · 5 порц.</strong></div></div></div>',
        '<div class="preorder-cell amount"><strong>120.00 BYN</strong></div>',
        '<div class="preorder-status-cell"><span role="img" aria-label="Ожидает подтверждения" ',
        'title="Ожидает подтверждения" class="preorder-state preorder-state-pending"></span></div>',
        '<div class="preorder-actions"><button>Посмотреть заказ</button>',
        '<button class="preorder-edit-button">Редактировать</button><button>Подтвердить</button>',
        '</div></article>'
      ].join("");
    });
    const box=await page.evaluate(()=>{
      const card=document.querySelector(".preorder-compact-row");
      const dot=card.querySelector(".preorder-state");
      const main=card.querySelector(".preorder-primary");
      const top=card.querySelector(".preorder-queue-headline strong");
      const tel=card.querySelector(".preorder-queue-phone");
      const cardRect=card.getBoundingClientRect(),dotRect=dot.getBoundingClientRect();
      const mainRect=main.getBoundingClientRect(),topRect=top.getBoundingClientRect();
      const telRect=tel.getBoundingClientRect();
      const dateRect=card.querySelector(".preorder-queue-date").getBoundingClientRect();
      const eventRect=card.querySelector(".preorder-queue-headline").getBoundingClientRect();
      const guestRect=card.querySelector(".preorder-queue-identity").getBoundingClientRect();
      const dishesRect=card.querySelector(".preorder-cell.dishes").getBoundingClientRect();
      return {cardRight:cardRect.right,cardTop:cardRect.top,
        mainDisplay:getComputedStyle(main).display,
        dateBottom:dateRect.bottom,eventTop:eventRect.top,eventBottom:eventRect.bottom,
        guestTop:guestRect.top,guestBottom:guestRect.bottom,dishesTop:dishesRect.top,
        dateLeft:dateRect.left,eventLeft:eventRect.left,guestLeft:guestRect.left,
        dotRight:dotRect.right,dotTop:dotRect.top,dotWidth:dotRect.width,
        mainWidth:mainRect.width,cardWidth:cardRect.width,
        headlineWidth:topRect.width,phoneWidth:telRect.width,
        mainTop:mainRect.top,phoneTop:telRect.top,
        bg:getComputedStyle(dot).backgroundColor,
        statusPosition:getComputedStyle(dot.parentElement).position,
        statusText:dot.textContent};
    });
    expect(box.statusPosition).toBe("absolute");
    expect(box.dotRight).toBeLessThanOrEqual(box.cardRight);
    expect(box.cardRight-box.dotRight).toBeLessThan(25);
    expect(box.dotTop-box.cardTop).toBeGreaterThanOrEqual(0);
    expect(box.dotTop-box.cardTop).toBeLessThan(20);
    expect(box.dotWidth).toBe(18);
    expect(box.bg).toBe("rgb(255, 153, 26)");
    expect(box.statusText).toBe("");
    expect(box.mainWidth).toBeGreaterThan(box.cardWidth*.57);
    expect(box.headlineWidth).toBeGreaterThan(75);
    expect(box.phoneWidth).toBeGreaterThan(85);
    expect(box.phoneTop).toBeGreaterThanOrEqual(box.mainTop);
    if(width<=900){
      expect(box.mainDisplay).toBe("flex");
      expect(box.eventTop).toBeGreaterThanOrEqual(box.dateBottom-1);
      expect(box.guestTop).toBeGreaterThanOrEqual(box.eventBottom-1);
      expect(box.dishesTop).toBeGreaterThanOrEqual(box.guestBottom-1);
      expect(Math.abs(box.dateLeft-box.eventLeft)).toBeLessThanOrEqual(2);
      expect(Math.abs(box.eventLeft-box.guestLeft)).toBeLessThanOrEqual(2);
    }
    await expect(page.locator(".preorder-compact-row .preorder-queue-date")).toHaveText("30.10.26");
    await expect(page.locator(".preorder-compact-row .preorder-edit-button")).toBeVisible();
  }
});
