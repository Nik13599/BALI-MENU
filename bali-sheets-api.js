/* BALI MENU v3 · private Google Sheets, gated until Apps Script + Worker are configured.
 * Firebase Authentication remains the sole user identity. This module never exposes
 * Google Sheets credentials, a spreadsheet ID, or the Cloudflare bridge secret. */
const API="/api/bali-v3";
export const sheetsEnabled=()=>window.BALI_SHEETS_API_ENABLED===true;
const pendingRoles=new Map();
export async function sheetsRequest(action,payload={},options={}){
  if(!sheetsEnabled())throw Object.assign(new Error("База Google Sheets ещё не активирована."),{code:"not-configured"});
  const provider=window.BaliAuth?.getIdToken||window.BaliSheetsToken;
  const token=action==="health"?"":await provider?.();
  if(action!=="health"&&!token)throw Object.assign(new Error("Войдите в аккаунт BALI."),{code:"unauthenticated"});
  // Coalesce concurrent identity checks only; never cache completed roles.
  if(action==="me"&&!options.signal){
    if(pendingRoles.has(token))return pendingRoles.get(token);
    const pending=sendSheetsRequest(action,payload,options,token);
    pendingRoles.set(token,pending);
    try{return await pending;}finally{pendingRoles.delete(token);}
  }
  return sendSheetsRequest(action,payload,options,token);
}
async function sendSheetsRequest(action,payload,options,token){
  const response=await fetch(API,{method:"POST",credentials:"same-origin",redirect:"follow",
    headers:{"Content-Type":"application/json"},
    body:JSON.stringify({action,token,payload}),signal:options.signal});
  let body;
  try{body=await response.json();}catch{throw Object.assign(new Error("Не удалось получить ответ BALI API."),{code:"upstream"});}
  if(!response.ok||body?.ok!==true){
    const error=body?.error||{};
    throw Object.assign(new Error(error.message||"Ошибка доступа к базе BALI."),{code:error.code||"upstream"});
  }
  return body.data;
}
window.BaliSheets=Object.freeze({enabled:sheetsEnabled,request:sheetsRequest});
