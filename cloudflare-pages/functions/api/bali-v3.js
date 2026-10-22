/* Same-origin Sheets API for Cloudflare Pages.
 * Configure SHEETS_SCRIPT_URL and BALI_BRIDGE_KEY as encrypted runtime variables.
 * Calls are verified again by Apps Script against Firebase Auth, not by a claimed UID. */
const actions=new Set(["health","me","consentAccept","profileSave","menu",
  "myOrders","createOrder","editOrder","cancelOrder","staffOrders","staffStatus","staffReport",
  "staffList","staffManage","adminGuests","adminGuestOrders","catalogSync","card","activateCard","adminCard","coinHistory",
  "coinChange","privilegeAssign","privilegeRules","privilegeRulesSave","bonusGrant","bonusHistory","bonusRecipient",
  "bonusTransfer","plans","avatarGet","avatarSave"]);
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
  if(input.action!=="health"&&(typeof input.token!=="string"||input.token.length<50))
    return json({ok:false,error:{code:"unauthenticated",message:"Войдите в личный кабинет."}},401);
  try{
    const res=await fetch(env.SHEETS_SCRIPT_URL,{method:"POST",redirect:"follow",
      headers:{"Content-Type":"text/plain;charset=UTF-8"},
      body:JSON.stringify({action:input.action,payload:input.payload||{},
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
