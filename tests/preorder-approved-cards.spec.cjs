const {test,expect}=require("@playwright/test");
const fs=require("node:fs");
const source=fs.readFileSync("admin-orders.js","utf8");
const beginning=source.indexOf("function compactOrderRow(o){");
const ending=source.indexOf("const reportActionIds=[",beginning);
if(beginning<0||ending<0)throw Error("Approved compact preorder card builder is missing.");
const cardSource=source.slice(beginning,ending);
test.beforeEach(async({page})=>{
  await page.route("**/*",route=>{
    const url=new URL(route.request().url());
    return url.hostname==="127.0.0.1"?route.continue():route.abort();
  });
});
async function render(page,{sheets=true,status="pending",withPhone=true}={}){
  await page.goto("/preorders.html");
  await page.evaluate(({cardSource,sheets,status,withPhone})=>{
    document.getElementById("staffSessionLoading").hidden=true;
    document.getElementById("loginView").hidden=true;
    document.getElementById("adminView").hidden=false;
    window.__approvedClicks=[];
    const helpers={
      sheetsEnabled:()=>sheets,
      normalizedOrderStatus:value=>value==="completed"?"confirmed":value,
      statuses:{pending:"Ожидает подтверждения",confirmed:"Подтверждён",cancelled:"Отменён"},
      eventTitle:()=> "MUZLOTO",
      readableOrderDate:()=> "23.10.2026",
      fmt:value=>Number(value).toFixed(2)+" BYN",
      node:(tag,text="",cls="")=>{
        const el=document.createElement(tag);el.textContent=text;
        if(cls)el.className=cls;return el;
      },
      button:(text,onClick,cls="")=>{
        const el=document.createElement("button");
        el.type="button";el.textContent=text;el.className=cls;
        el.addEventListener("click",onClick);return el;
      },
      openOrderDetails:(id,options)=>{window.__approvedClicks.push("view:"+id+":"+(options?.share?"share":"details"));},
      openEditor:id=>window.__approvedClicks.push("edit:"+id),
      printOrder:o=>window.__approvedClicks.push("print:"+o.id),
      deleteOrder:o=>window.__approvedClicks.push("delete:"+o.id),
      setOrderStatus:(o,next)=>window.__approvedClicks.push("status:"+next)
    };
    const build=new Function("helpers", "with(helpers){"+cardSource+"return compactOrderRow;}")(helpers);
    const order={id:"order_1",eventDate:"2026-10-23",eventId:"muzloto",eventTitle:"MUZLOTO",
      orderNumber:1,customerName:"Мария Иванова",customerPhone:withPhone?"+375291112233":"",
      tableNumber:"12",bookingId:"BALI-123",status,total:84.5,archived:false,
      items:[{id:1,name:"Сырная тарелка",quantity:2,unitPrice:20},
        {id:2,name:"Бургер",quantity:1,unitPrice:44.5}]};
    document.getElementById("ordersAdminList").replaceChildren(build(order));
  },{cardSource,sheets,status,withPhone});
}
test("approved BALI preorder card content and controls",async({page})=>{
  await render(page);
  const card=page.locator(".preorder-approved-card");
  await expect(card).toHaveCount(1);
  await expect(card.locator(".preorder-approved-title")).toHaveText("MUZLOTO №1");
  await expect(card.locator(".preorder-approved-ref")).toContainText(["Столик №12","ID BALI-123"]);
  await expect(card.locator(".preorder-approved-guest-name")).toHaveText("Мария Иванова");
  await expect(card.locator(".preorder-approved-call")).toHaveAttribute("href","tel:+375291112233");
  await expect(card.locator(".preorder-approved-foods-list")).toContainText("Сырная тарелка × 2");
  await expect(card.locator(".preorder-approved-total strong")).toHaveText("84.50 BYN");
  await expect(card.locator(".preorder-approved-top .preorder-state")).toContainText("Ожидает");
  const actions=card.locator(".preorder-approved-actions");
  for(const name of ["Открыть карточку","Редактировать","Распечатать","Переслать","Удалить"]){
    await expect(actions.getByRole("button",{name,exact:true})).toHaveCount(1);
  }
  await expect(actions.getByRole("button",{name:"Редактировать"})).toBeDisabled();
  await expect(actions.getByRole("button",{name:"Удалить"})).toBeDisabled();
  await card.locator(".preorder-approved-call").count();
  await card.getByRole("button",{name:"Подтвердить"}).click();
  await card.getByRole("button",{name:"Отменить"}).click();
  await actions.getByRole("button",{name:"Открыть карточку"}).click();
  await actions.getByRole("button",{name:"Распечатать"}).click();
  await actions.getByRole("button",{name:"Переслать"}).click();
  expect(await page.evaluate(()=>window.__approvedClicks)).toEqual([
    "status:confirmed","status:cancelled","view:order_1:details","print:order_1","view:order_1:share"
  ]);
});
test("status and amount match approved positions on small and large screens",async({page})=>{
  await render(page,{status:"confirmed"});
  const card=page.locator(".preorder-approved-card");
  await expect(card.locator(".preorder-state")).toHaveText("Подтверждён");
  await expect(card.getByRole("button",{name:"Подтвердить"})).toHaveCount(0);
  const positions=await card.evaluate(el=>{
    const r=selector=>el.querySelector(selector).getBoundingClientRect();
    const card=r(".preorder-approved-card");
    const status=r(".preorder-approved-top");
    const foot=r(".preorder-approved-foot");
    const amount=r(".preorder-approved-total");
    return {viewport:document.documentElement.clientWidth,
      card:{left:card.left,right:card.right,width:card.width},
      status:{top:status.top,right:status.right},foot:{top:foot.top,bottom:foot.bottom},
      amount:{top:amount.top,right:amount.right,bottom:amount.bottom}};
  });
  expect(positions.card.left).toBeGreaterThanOrEqual(-1);
  expect(positions.card.right).toBeLessThanOrEqual(positions.viewport+1);
  expect(positions.status.top).toBeLessThan(positions.foot.top);
  expect(positions.amount.top).toBeGreaterThanOrEqual(positions.foot.top-1);
  expect(positions.amount.right).toBeGreaterThan(positions.card.left+positions.card.width*.45);
});
test("legacy orders keep editing and deleting available",async({page})=>{
  await render(page,{sheets:false});
  const card=page.locator(".preorder-approved-card");
  await card.getByRole("button",{name:"Редактировать"}).click();
  await card.getByRole("button",{name:"Удалить"}).click();
  expect(await page.evaluate(()=>window.__approvedClicks)).toEqual(["edit:order_1","delete:order_1"]);
});
