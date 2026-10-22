/* BALI guest preorder intake. Zero Firebase requests and no email.
 * Loaded only when the guest selects "Без входа" in checkout.
 * Turnstile is rendered only in that form, and verified on the Cloudflare edge.
 */
const SITEKEY="0x4AAAAAAFgaCfqEqtblIfyT";
let loading=null,widget=null,challenge="";
let requestId=null,requestSignature=null;
async function turnstile(){
  if(window.turnstile?.render)return window.turnstile;
  loading??=new Promise((resolve,reject)=>{
    const script=document.createElement("script");
    script.src="https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit";
    script.async=true;
    script.onload=()=>window.turnstile?.render?resolve(window.turnstile):
      reject(new Error("Защита от спама недоступна. Обновите страницу."));
    script.onerror=()=>reject(new Error("Не удалось загрузить защиту заявки."));
    document.head.append(script);
  }).catch(e=>{loading=null;throw e;});
  return loading;
}
export async function prepare(){
  const holder=document.getElementById("baliGuestTurnstile");
  if(!holder)throw Error("Форма гостевого предзаказа недоступна.");
  const api=await turnstile();
  if(widget===null){
    widget=api.render(holder,{
      sitekey:SITEKEY,action:"guest-preorder",theme:"dark",
      callback:token=>{challenge=token;},
      "expired-callback":()=>{challenge="";},
      "error-callback":()=>{challenge="";}
    });
  }
}
function reset(){
  challenge="";
  try{if(widget!==null)window.turnstile?.reset(widget)}catch(_){}
}
export async function send(payload){
  if(!challenge)throw Error("Подтвердите проверку безопасности под формой.");
  const items=(payload.items||[]).map(x=>({id:Number(x.id),quantity:Number(x.quantity)}));
  const core={
    customer_name:payload.customer_name,customer_phone:payload.customer_phone,
    event_date:payload.event_date,event_id:payload.event_id,
    table_number:payload.table_number,booking_id:payload.booking_id,
    notes:payload.notes,items
  };
  const signature=JSON.stringify(core);
  if(requestSignature!==signature||!requestId){
    requestId=crypto.randomUUID();
    requestSignature=signature;
  }
  try{
    const response=await fetch("/api/guest-preorders",{
      method:"POST",credentials:"omit",cache:"no-store",
      headers:{"Content-Type":"application/json"},
      body:JSON.stringify({...core,request_id:requestId,turnstile_token:challenge,
        privacy_accepted:payload.privacy_accepted===true,
        website:document.getElementById("baliGuestWebsite")?.value||""})
    });
    const result=await response.json().catch(()=>({error:"guest-intake-unavailable"}));
    if(!response.ok||result.success!==true){
      const reasons={
        "invalid-order-or-contact":"Проверьте имя, номер телефона и остальные поля.",
        "human-verification-required":"Повторите проверку безопасности.",
        "event-closed":"Приём заказов на выбранное мероприятие закрыт.",
        "menu-item-unavailable":"В заказе есть недоступное блюдо. Обновите меню.",
        "public-content-not-ready":"Данные меню обновляются. Повторите попытку.",
        "guest-intake-unavailable":"Приём гостевых заявок временно недоступен."
      };
      throw Error(reasons[result.error]||"Не удалось передать заявку стафу. Корзина сохранена.");
    }
    requestId=null;requestSignature=null;
    reset();
    return result;
  }catch(e){reset();throw e;}
}
