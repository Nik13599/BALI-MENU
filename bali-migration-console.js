/* Isolated owner's migration console. No changes to BALI Staff and no
 * production cutover. Every server operation rechecks verified Firebase UID
 * and active admin role; a browser cannot provide orders or balances.
 */
import {initializeApp,getApps,getApp} from "https://www.gstatic.com/firebasejs/10.14.1/firebase-app.js";
import {getAuth,GoogleAuthProvider,signInWithPopup,onAuthStateChanged,signOut}
 from "https://www.gstatic.com/firebasejs/10.14.1/firebase-auth.js";
import {getFirestore,collection,documentId,getDocs,query,orderBy,startAfter,limit}
 from "https://www.gstatic.com/firebasejs/10.14.1/firebase-firestore.js";
const app=getApps().length?getApp():initializeApp(window.BALI_FIREBASE_CONFIG);
const auth=getAuth(app),db=getFirestore(app),$=id=>document.getElementById(id);
let admin=false,busy=false,generation=0;
const say=value=>{$("result").textContent=value;};
const buttons=["audit","stage-firestore","stage-sheets"];
function controls(){for(const id of buttons)$(id).disabled=!admin||busy;}
function state(value){$("state").textContent=value;}
async function request(path,body){
 const user=auth.currentUser;
 if(!user?.emailVerified)throw Error("Войдите в подтверждённый Google-аккаунт.");
 const token=await user.getIdToken();
 const response=await fetch(path,{
  method:body?"POST":"GET",
  headers:{"Authorization":"Bearer "+token,
    ...(body?{"Content-Type":"application/json"}:{})},
  ...(body?{body:JSON.stringify(body)}:{})
 });
 let output;try{output=await response.json()}catch{throw Error("Недопустимый ответ сервера.");}
 if(!response.ok)throw Error("Сервер отклонил запрос ("+response.status+"): "+
   String(output?.error||"unknown").slice(0,100));
 return output;
}
async function audit(){
 const data=await request("/api/admin/unified-migration-audit");
 $("report").textContent=JSON.stringify({
  activeBackend:data.activeBackend,
  staged:data.staged,
  discrepancies:data.discrepancies,
  migrationStatus:data.migrationStatus,
  sourceReconciliationComplete:data.sourceReconciliationComplete,
  cutoverAllowed:data.cutoverAllowed
 },null,2);
 return data;
}
async function job(fn){
 if(!admin||busy)return;busy=true;controls();
 try{await fn();}
 catch(e){say("Операция остановлена: "+String(e?.message||"Ошибка").slice(0,180));}
 finally{busy=false;controls();}
}
$("login").addEventListener("click",()=>signInWithPopup(auth,new GoogleAuthProvider())
 .catch(e=>state("Вход не выполнен: "+String(e?.code||"ошибка"))));
$("logout").addEventListener("click",()=>signOut(auth));
onAuthStateChanged(auth,async user=>{
 const run=++generation;admin=false;controls();
 $("workspace").hidden=true;$("logout").hidden=!user;$("login").hidden=!!user;
 state(user?"Проверяем полномочия владельца...":"Вход владельца обязателен.");
 if(!user?.emailVerified)return;
 try{
  await audit();
  if(run!==generation)return;
  admin=true;controls();$("workspace").hidden=false;
  state("Владелец подтверждён. Доступен только подготовительный перенос.");
 }catch(_){
  if(run===generation)state("Доступ запрещён или невозможно проверить роль владельца.");
 }
});
$("audit").addEventListener("click",()=>job(async()=>{
 const result=await audit();
 say("Аудит обновлён. Переход в D1: "+(result.cutoverAllowed?"разрешён":"заблокирован"));
}));
$("stage-firestore").addEventListener("click",()=>job(async()=>{
 if(!confirm("Подготовить существующие Firestore-заказы в D1 без переключения Staff?"))return;
 let cursor=null,total=0,pages=0;
 do{
  const args=[orderBy(documentId()),limit(100)];
  if(cursor)args.splice(1,0,startAfter(cursor));
  const snapshot=await getDocs(query(collection(db,"orders"),...args));
  if(snapshot.empty)break;
  pages++;
  const ids=snapshot.docs.map(x=>x.id);
  for(let i=0;i<ids.length;i+=10){
   const out=await request("/api/admin/migrate-preorders",{ids:ids.slice(i,i+10)});
   if(out.ok!==true||out.cutover!==false)throw Error("Не удалось подтвердить безопасный импорт.");
   total+=out.staged;say("Подготовлено заказов Firestore: "+total);
  }
  cursor=snapshot.docs.at(-1);
  if(snapshot.size<100)break;
  // Never silently skip remaining rows or create an unbounded scan.
  if(pages>=100)throw Error("Достигнуто ограничение 10 000 записей. Нужен отдельный контроль.");
 }while(true);
 await audit();say("Сверка Firestore завершена: "+total+" заказов. Staff не переключён.");
}));
$("stage-sheets").addEventListener("click",()=>job(async()=>{
 const dates=[$("dates").value].flatMap(s=>s.split(/[\s,;]+/)).filter(Boolean);
 if(!dates.length||dates.length>40||
   dates.some(s=>!/^\d{4}-\d{2}-\d{2}$/.test(s)))
   throw Error("Укажите от 1 до 40 дат в формате ГГГГ-ММ-ДД.");
 if(!confirm("Подготовить заказы Google Таблицы за "+dates.length+" дат без переключения Staff?"))return;
 let total=0;
 for(const date of [...new Set(dates)]){
  const out=await request("/api/admin/migrate-sheets-preorders",{date});
  if(out.ok!==true||out.cutover!==false)throw Error("Сервер отклонил подтверждение импорта.");
  total+=out.staged;say("Подготовлено из Sheets: "+total+" заказов, проверена дата "+date);
 }
 await audit();
 say("Подготовительный перенос Sheets завершён, обработано "+total+" заказов. Staff не переключён.");
}));
