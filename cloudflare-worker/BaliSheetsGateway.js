/**
 * BALI MENU · Same-origin Cloudflare Workers proxy (Free plan compatible).
 * Route: baliminsk.by/api/bali-v3*
 * Secrets: SHEETS_SCRIPT_URL (Apps Script /exec), BALI_BRIDGE_KEY (random secret).
 *
 * All data remains in a PRIVATE Google Sheet. Credentials never reach the browser.
 * The Apps Script backend independently verifies each Firebase ID token.
 */
const ACTIONS=new Set(["health","me","profileSave","menu","myOrders","createOrder","editOrder","cancelOrder",
  "staffOrders","staffStatus","staffReport","staffList","staffManage",
  "adminGuests","adminGuestOrders","card","activateCard","adminCard",
  "consentAccept","coinHistory","coinChange","privilegeAssign","privilegeRules","privilegeRulesSave","bonusGrant","bonusHistory",
  "bonusRecipient","bonusTransfer","plans", "avatarGet","avatarSave"]);
function reply(body,status=200){
  return new Response(JSON.stringify(body),{status,headers:{
    "Content-Type":"application/json;charset=utf-8",
    "Cache-Control":"private,no-store",
    "X-Content-Type-Options":"nosniff"
  }});
}
export default {
  async fetch(request,env){
    const url=new URL(request.url);
    if(request.method!=="POST")return reply({ok:false,error:{code:"method-not-allowed",message:"POST required."}},405);
    const origin=request.headers.get("Origin");
    if(origin&&origin!==url.origin)return reply({ok:false,error:{code:"origin",message:"Forbidden origin."}},403);
    if((Number(request.headers.get("Content-Length"))||0)>110000)
      return reply({ok:false,error:{code:"too-large",message:"Request too large."}},413);
    if(!env.SHEETS_SCRIPT_URL||!env.BALI_BRIDGE_KEY)
      return reply({ok:false,error:{code:"not-configured",message:"Сервис ещё не подключён."}},503);
    let data;
    try{data=await request.json();}catch{return reply({ok:false,error:{code:"invalid-json",message:"Неверный формат запроса."}},400);}
    if(!data||typeof data!=="object"||!ACTIONS.has(data.action))
      return reply({ok:false,error:{code:"invalid-action",message:"Недоступная операция."}},400);
    if(data.action!=="health"&&(!data.token||typeof data.token!=="string"))
      return reply({ok:false,error:{code:"unauthenticated",message:"Войдите в BALI."}},401);
    if(JSON.stringify(data).length>(data.action==="avatarSave"?110000:28000))
      return reply({ok:false,error:{code:"too-large",message:"Слишком большой запрос."}},413);
    try{
      const response=await fetch(env.SHEETS_SCRIPT_URL,{
        method:"POST",redirect:"follow",
        headers:{"Content-Type":"text/plain;charset=utf-8"},
        body:JSON.stringify({action:data.action,token:data.token||"",
          payload:data.payload&&typeof data.payload==="object"?data.payload:{},
          bridgeKey:env.BALI_BRIDGE_KEY})
      });
      if(!response.ok)return reply({ok:false,error:{code:"upstream",message:"Сервис Google временно недоступен."}},502);
      const result=await response.json();
      if(!result||typeof result.ok!=="boolean")throw Error("Unexpected response");
      const error=result.error||{};
      const status=result.ok?200:({"unauthenticated":401,"permission-denied":403,
        "not-found":404,"failed-precondition":409,"invalid-argument":400,"busy":429}[error.code]||500);
      return reply(result,status);
    }catch{
      return reply({ok:false,error:{code:"upstream",message:"Нет соединения с базой BALI. Повторите позже."}},502);
    }
  }
};