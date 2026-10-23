import {authorizeStaff} from "../_lib/staff-auth.js";
import {subscriptionId,validSubscription} from "../_lib/staff-web-push.js";
const reply=(data,status=200)=>new Response(JSON.stringify(data),{status,headers:{
 "Content-Type":"application/json; charset=utf-8","Cache-Control":"no-store",
 "X-Content-Type-Options":"nosniff"
}});
const errorMessage=e=>e?.status===401?"Требуется вход.":e?.status===403?"Нет доступа к предзаказам.":"Сервис уведомлений пока недоступен.";
export async function onRequestGet({env}){
 if(!env?.BALI_STAFF_VAPID_PUBLIC||!env?.BALI_STAFF_VAPID_PRIVATE_JWK)
   return reply({ok:false,message:"Сервер уведомлений ещё не настроен."},503);
 return reply({ok:true,publicKey:env.BALI_STAFF_VAPID_PUBLIC});
}
export async function onRequestPost({request,env}){
 try{
  const origin=request.headers.get("Origin");
  if(origin&&origin!==new URL(request.url).origin)
    return reply({ok:false,message:"Неверный адрес страницы."},403);
  const length=Number(request.headers.get("Content-Length")||0);
  if(length>6500)return reply({ok:false,message:"Слишком большой запрос."},413);
  const bodyText=await request.text();
  if(bodyText.length>6500)return reply({ok:false,message:"Слишком большой запрос."},413);
  let body;
  try{body=JSON.parse(bodyText);}catch{return reply({ok:false,message:"Неверные данные."},400);}
  if(!["subscribe","unsubscribe"].includes(body?.action))
    return reply({ok:false,message:"Недопустимая операция."},400);
  const token=body?.token;
  if(typeof token!=="string"||token.length<100||token.length>5000)
    return reply({ok:false,message:"Требуется вход."},401);
  const actor=await authorizeStaff(new Request(request.url,{
    headers:{Authorization:"Bearer "+token}
  }),{env});
  const db=env?.BALI_OPERATIONS_DB;
  if(!db||!env.BALI_STAFF_VAPID_PRIVATE_JWK||!env.BALI_STAFF_VAPID_PUBLIC)
    return reply({ok:false,message:"Сервер уведомлений ещё не настроен."},503);
  const sub=body.subscription;
  if(!validSubscription(sub))
    return reply({ok:false,message:"Устройство не поддерживает подписку."},400);
  const id=await subscriptionId(sub.endpoint),now=Date.now();
  if(body.action==="unsubscribe"){
    await db.prepare("DELETE FROM staff_push_subscriptions WHERE id=? AND employee_uid=?")
      .bind(id,actor.uid).run();
    return reply({ok:true});
  }
  // Browser ownership of endpoint is proven by its valid Firebase session;
  // one endpoint belongs to exactly one employee and is never shared.
  await db.prepare(
    "INSERT INTO staff_push_subscriptions (id,employee_uid,endpoint,p256dh,auth_secret,created_at_ms,updated_at_ms) "+
    "VALUES (?,?,?,?,?,?,?) ON CONFLICT(id) DO UPDATE SET "+
    "employee_uid=excluded.employee_uid,p256dh=excluded.p256dh,auth_secret=excluded.auth_secret,updated_at_ms=excluded.updated_at_ms"
  ).bind(id,actor.uid,sub.endpoint,sub.keys.p256dh,sub.keys.auth,now,now).run();
  // Bound how many phone/browser installations one employee can keep active.
  await db.prepare(
    "DELETE FROM staff_push_subscriptions WHERE employee_uid=? AND id NOT IN ("+
    "SELECT id FROM staff_push_subscriptions WHERE employee_uid=? "+
    "ORDER BY updated_at_ms DESC LIMIT 8)"
  ).bind(actor.uid,actor.uid).run();
  return reply({ok:true});
 }catch(e){return reply({ok:false,message:errorMessage(e)},e?.status===401?401:e?.status===403?403:503);}
}
