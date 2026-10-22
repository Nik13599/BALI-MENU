/* Same-origin Sheets API for Cloudflare Pages.
 * Configure SHEETS_SCRIPT_URL and BALI_BRIDGE_KEY as encrypted runtime variables.
 * Calls are verified again by Apps Script against Firebase Auth, not by a claimed UID. */
const actions=new Set(["health","me","consentAccept","profileSave","menu",
  "myOrders","createOrder","guestCreateOrder","editOrder","cancelOrder","staffOrders","staffStatus","staffReport",
  "staffList","staffManage","adminGuests","adminGuestOrders","catalogSync","card","activateCard","adminCard","coinHistory",
  "coinChange","privilegeAssign","privilegeRules","privilegeRulesSave","bonusGrant","bonusHistory","bonusRecipient",
  "bonusTransfer","plans","avatarGet","avatarSave"]);
const TURNSTILE_HOSTS=new Set(["baliminsk.by","www.baliminsk.by","bali-nightclub-menu.pages.dev"]);
async function verifyGuestPreorderTurnstile(token,request,env){
  if(!env.BALI_GUEST_TURNSTILE_SECRET)
    return {ok:false,code:"not-configured",message:"Проверка защиты предзаказов ещё не настроена.",status:503};
  if(typeof token!=="string"||token.length<10||token.length>2048)
    return {ok:false,code:"turnstile-required",message:"Подтвердите проверку безопасности перед отправкой.",status:400};
  const form=new URLSearchParams({secret:env.BALI_GUEST_TURNSTILE_SECRET,response:token});
  const ip=request.headers.get("CF-Connecting-IP");
  if(ip)form.set("remoteip",ip);
  let verified;
  try{
    const result=await fetch("https://challenges.cloudflare.com/turnstile/v0/siteverify",{
      method:"POST",body:form,headers:{"Content-Type":"application/x-www-form-urlencoded"}});
    if(!result.ok)throw new Error("Upstream");
    verified=await result.json();
  }catch{
    return {ok:false,code:"turnstile-unavailable",message:"Проверка безопасности временно недоступна.",status:503};
  }
  if(verified?.success!==true||!TURNSTILE_HOSTS.has(verified.hostname)||verified.action!=="guest_preorder")
    return {ok:false,code:"turnstile-invalid",message:"Проверка безопасности не пройдена. Повторите её.",status:403};
  return {ok:true};
}
const json=(body,status=200)=>new Response(JSON.stringify(body),{status,headers:{
  "Content-Type":"application/json;charset=utf-8",
  "Cache-Control":"private,no-store","X-Content-Type-Options":"nosniff"
}});
export async function onRequestPost({request,env}){
  if(new URL(request.url).origin!==request.headers.get("Origin")&&request.headers.get("Origin"))
    return json({ok:false,error:{code:"origin",message:"Недопустимый источник."}},403);
  if(!env.SHEETS_SCRIPT_URL||!env.BALI_BRIDGE_KEY)
    return json({ok:false,error:{code:"not-configured",message:"BALI Sheets API пока не подключён."}},503);
  let input;
  try{
    if(Number(request.headers.get("Content-Length"))>110000)return json({ok:false},413);
    input=await request.json();
    if(JSON.stringify(input).length>(input.action==="avatarSave"?110000:28000))throw Error("size");
  }catch{return json({ok:false,error:{code:"invalid-argument",message:"Некорректный запрос."}},400)}
  if(!input||!actions.has(input.action))
    return json({ok:false,error:{code:"invalid-argument",message:"Неизвестное действие."}},400);
  const guestOrder=input.action==="guestCreateOrder";
  if(!guestOrder&&input.action!=="health"&&(typeof input.token!=="string"||input.token.length<50))
    return json({ok:false,error:{code:"unauthenticated",message:"Войдите в личный кабинет."}},401);
  const payload=input.payload&&typeof input.payload==="object"&&!Array.isArray(input.payload)?{...input.payload}:{};
  // Client-supplied proof is never trusted. Only Siteverify can set this flag.
  delete payload.guestVerified;
  if(guestOrder){
    if(!/^[-_a-zA-Z0-9]{12,80}$/.test(String(payload.requestId||"")))
      return json({ok:false,error:{code:"invalid-argument",message:"Некорректный идентификатор отправки."}},400);
    if(payload.privacyConsent!==true||payload.internationalConsent!==true)
      return json({ok:false,error:{code:"consent-required",message:"Необходимо подтвердить согласие на обработку данных."}},400);
    const verification=await verifyGuestPreorderTurnstile(input.turnstileToken,request,env);
    if(!verification.ok)
      return json({ok:false,error:{code:verification.code,message:verification.message}},verification.status);
    payload.guestVerified=true;
  }
  try{
    const res=await fetch(env.SHEETS_SCRIPT_URL,{method:"POST",redirect:"follow",
      headers:{"Content-Type":"text/plain;charset=UTF-8"},
      body:JSON.stringify({action:input.action,payload,
        token:input.token||"",bridgeKey:env.BALI_BRIDGE_KEY})});
    if(!res.ok){
      if(input.action==="health")return json({ok:false,error:{code:"upstream",stage:"google-http",status:res.status}},502);
      throw Error("upstream");
    }
    let body;
    try{body=await res.json();}
    catch{
      if(input.action==="health")return json({ok:false,error:{code:"upstream",stage:"google-not-json",status:res.status,
        mime:(res.headers.get("content-type")||"").slice(0,60)}},502);
      throw Error("format");
    }
    if(typeof body?.ok!=="boolean"){
      if(input.action==="health")return json({ok:false,error:{code:"upstream",stage:"google-json-shape"}},502);
      throw Error("format");
    }
    const status=body.ok?200:{"unauthenticated":401,"permission-denied":403,
      "not-found":404,"invalid-argument":400,"failed-precondition":409,
      "resource-exhausted":429,"busy":429}[body.error?.code]||500;
    return json(body,status);
  }catch(error){
    return json({ok:false,error:{code:"upstream",
      message:"База BALI временно недоступна.",
      ...(input.action==="health"?{stage:"fetch-error",kind:error?.name==="TypeError"?"network":"other"}:{})
    }},502);
  }
}
export async function onRequestGet(){return json({ok:false,error:{code:"method-not-allowed"}},405)}
