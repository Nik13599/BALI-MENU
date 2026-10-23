/* BALI MENU: Cloudflare D1 handles only preorder-related actions.
 * Firebase Auth supplies verified identity; other optional Sheets services
 * retain their own disabled-by-default flag.
 */
const API="/api/bali-v3";
export const sheetsEnabled=()=>window.BALI_SHEETS_API_ENABLED===true;
export const preordersD1Enabled=()=>window.BALI_D1_PREORDERS_ENABLED===true;
export const preorderServiceEnabled=()=>preordersD1Enabled()||sheetsEnabled();
const orderActions=new Set(["menu","createOrder","guestCreateOrder","editOrder","cancelOrder",
  "myOrders","staffOrders","staffRecentOrders","staffCreateOrder","staffEditOrder","staffStatus",
  "staffArchiveOrder","staffDeleteOrder","staffClearExpiredOrders"]);
const pendingRoles=new Map();
export async function sheetsRequest(action,payload={},options={}){
  if(!sheetsEnabled()&&!(preordersD1Enabled()&&orderActions.has(action)))
    throw Object.assign(new Error("Этот раздел базы не активирован."),{code:"not-configured"});
  const provider=window.BaliAuth?.getIdToken||window.BaliSheetsToken;
  const token=action==="health"?"":await provider?.();
  if(action!=="health"&&!token)throw Object.assign(new Error("Войдите в аккаунт BALI."),{code:"unauthenticated"});
  // Coalesce concurrent identity checks only; never cache completed roles.
  if((action==="me"||action==="staffRecentOrders")&&!options.signal&&Object.keys(payload).length===0){
    const requestKey=action+":"+token;
    if(pendingRoles.has(requestKey))return pendingRoles.get(requestKey);
    const pending=sendSheetsRequest(action,payload,options,token);
    pendingRoles.set(requestKey,pending);
    try{return await pending;}finally{pendingRoles.delete(requestKey);}
  }
  return sendSheetsRequest(action,payload,options,token);
}
async function sendSheetsRequest(action,payload,options,token){
  const response=await fetch(API,{
    method:"POST",credentials:"same-origin",redirect:"follow",
    headers:{"Content-Type":"application/json"},
    body:JSON.stringify({action,token,payload}),signal:options.signal,
    ...(options.keepalive?{keepalive:true}:{})});
  let body;
  try{body=await response.json();}catch{throw Object.assign(new Error("Не удалось получить ответ BALI API."),{code:"upstream"});}
  if(!response.ok||body?.ok!==true){
    const error=body?.error||{};
    throw Object.assign(new Error(error.message||"Ошибка доступа к базе BALI."),{code:error.code||"upstream"});
  }
  return body.data;
}
window.BaliSheets=Object.freeze({enabled:sheetsEnabled,request:sheetsRequest});
