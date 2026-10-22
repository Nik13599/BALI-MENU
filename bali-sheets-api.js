/* BALI MENU v3 · private Google Sheets, gated until Apps Script + Worker are configured.
 * Firebase Authentication remains the sole user identity. This module never exposes
 * Google Sheets credentials, a spreadsheet ID, or the Cloudflare bridge secret. */
const API="/api/bali-v3";
export const sheetsEnabled=()=>window.BALI_SHEETS_API_ENABLED===true;
export async function sheetsRequest(action,payload={},options={}){
  if(!sheetsEnabled())throw Object.assign(new Error("База Google Sheets ещё не активирована."),{code:"not-configured"});
  const token=action==="health"?"":await window.BaliAuth?.getIdToken?.();
  if(action!=="health"&&!token)throw Object.assign(new Error("Войдите в аккаунт BALI."),{code:"unauthenticated"});
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
