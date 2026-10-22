/**
 * Durable, per-staff pending status changes for BALI STAFF.
 * Only order IDs, expected versions and intended statuses are persisted.
 * A locally queued action is not represented as a server acknowledgement.
 */
const PREFIX="bali-staff-status-queue-v1:";
const ALLOWED=new Set(["pending","confirmed","cancelled"]);
const VALID_ID=/^[a-zA-Z0-9_-]{1,100}$/;
const waitDelay=attempt=>Math.min(30000,Math.round(1500*Math.pow(2,Math.min(attempt,5))));
export function createDurableStaffStatusQueue({storage,send,onChange=()=>{},onSynced=()=>{},onConflict=()=>{},onDeferred=()=>{}}){
  let uid="",queued=new Map(),running=false,timer=null,attempt=0,revision=0;
  const getKey=()=>PREFIX+uid;
  function persist(){
    if(!uid)throw new Error("Необходимо войти в BALI STAFF.");
    storage.setItem(getKey(),JSON.stringify([...queued.values()]));
  }
  function get(orderId){return queued.get(String(orderId))||null;}
  function all(){return [...queued.values()];}
  function read(id){
    let rows=[];
    try{
      const parsed=JSON.parse(storage.getItem(PREFIX+id)||"[]");
      if(Array.isArray(parsed))rows=parsed;
    }catch(_){rows=[];}
    const clean=new Map();
    for(const op of rows.slice(-250)){
      if(!op||typeof op!=="object"||!VALID_ID.test(String(op.id||""))||
          !ALLOWED.has(op.status)||typeof op.requestId!=="string"||
          !/^[a-f0-9]{32}$/.test(op.requestId))continue;
      clean.set(op.id,{id:op.id,status:op.status,requestId:op.requestId,
        expectedUpdatedAt:typeof op.expectedUpdatedAt==="string"?op.expectedUpdatedAt.slice(0,60):"",
        enqueuedAt:Number(op.enqueuedAt)||0});
    }
    return clean;
  }
  function deactivate(){
    revision++;uid="";queued=new Map();attempt=0;
    if(timer!==null){clearTimeout(timer);timer=null;}
    onChange();
  }
  function activate(id){
    if(!id||typeof id!=="string")throw new Error("Нужен аккаунт сотрудника.");
    if(uid===id)return;
    deactivate();
    uid=id;queued=read(id);onChange();
    if(queued.size)void flush();
  }
  function enqueue(row,status){
    if(!uid)throw new Error("Сеанс сотрудника не активирован.");
    const id=String(row?.id||"");
    if(!VALID_ID.test(id)||!ALLOWED.has(status))throw new Error("Некорректное изменение заказа.");
    if(queued.has(id))return queued.get(id);
    if(queued.size>=200)throw new Error("Очередь синхронизации заполнена. Дождитесь отправки.");
    const bytes=new Uint8Array(16);
    if(typeof crypto==="undefined"||!crypto.getRandomValues)throw new Error("Защищённое соединение обязательно.");
    crypto.getRandomValues(bytes);
    const op={id,status,requestId:[...bytes].map(b=>b.toString(16).padStart(2,"0")).join(""),
      expectedUpdatedAt:typeof row.updatedAt==="string"?row.updatedAt:"",
      enqueuedAt:Date.now()};
    queued.set(id,op);
    try{persist()}catch(e){queued.delete(id);throw new Error("Браузер не сохранил действие. Разрешите хранение данных сайта: "+(e.message||"ошибка"));}
    onChange();void flush();return op;
  }
  function retry(){
    if(timer!==null||!uid||!queued.size)return;
    timer=setTimeout(()=>{timer=null;void flush()},waitDelay(attempt++));
  }
  async function flush(){
    if(running||!uid||!queued.size)return;
    if(timer!==null){clearTimeout(timer);timer=null;}
    const run=revision,owner=uid;
    running=true;
    try{
      for(const op of all()){
        if(owner!==uid||revision!==run)break;
        if(get(op.id)?.requestId!==op.requestId)continue;
        try{
          const result=await send({...op});
          if(owner!==uid||revision!==run)break;
          if(get(op.id)?.requestId!==op.requestId)continue;
          queued.delete(op.id);
          try{persist();}catch(e){queued.set(op.id,op);throw e;}
          attempt=0;
          onSynced(op,result);onChange();
        }catch(error){
          if(owner!==uid||revision!==run)break;
          const code=String(error?.code||"");
          // 401, stale data or revoked permissions must never be retried blindly.
          const permanent=["permission-denied","unauthenticated","invalid-argument","not-found","failed-precondition","aborted"].includes(code);
          if(permanent){
            queued.delete(op.id);
            try{persist()}catch(_){}
            onConflict(op,error);onChange();
            continue;
          }
          // Unknown transport errors are transient, not proof of a failed write.
          onDeferred(op,error);
          retry();break;
        }
      }
    }finally{
      running=false;
      // If an earlier session's in-flight fetch ended after switching accounts,
      // resume the new account's pending actions rather than leaving them idle.
      if(uid&&queued.size&&revision!==run&&timer===null)queueMicrotask(()=>void flush());
    }
  }
  function resume(){if(uid&&queued.size)void flush();}
  return {activate,deactivate,enqueue,get,all,flush:resume};
}
