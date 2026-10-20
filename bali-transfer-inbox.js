/* Realtime Firestore gift inbox; cross-device events from verified transfers. */
import {initializeApp,getApps,getApp} from "https://www.gstatic.com/firebasejs/10.14.1/firebase-app.js";
import {getAuth,onAuthStateChanged} from "https://www.gstatic.com/firebasejs/10.14.1/firebase-auth.js";
import {getFirestore,collection,query,orderBy,limit,onSnapshot} from "https://www.gstatic.com/firebasejs/10.14.1/firebase-firestore.js";
const app=getApps().length?getApp():initializeApp(window.BALI_FIREBASE_CONFIG);
const auth=getAuth(app),db=getFirestore(app);
let off=null,activeUid=null,initial=true,seen=new Set();
onAuthStateChanged(auth,user=>{
  off?.();off=null;activeUid=null;initial=true;seen.clear();
  if(!user?.emailVerified){
    window.dispatchEvent(new CustomEvent("bali:transfer-inbox",{detail:{uid:null,items:[]}}));
    return;
  }
  activeUid=user.uid;
  off=onSnapshot(query(collection(db,"baliTransferInbox",user.uid,"items"),orderBy("createdAt","desc"),limit(30)),snapshot=>{
    if(activeUid!==user.uid)return;
    const items=snapshot.docs.map(d=>({id:d.id,...d.data(),createdAt:d.data().createdAt?.toMillis?.()||0}));
    const fresh=initial?[]:items.filter(x=>!seen.has(x.id));
    seen=new Set(items.map(x=>x.id));initial=false;
    window.dispatchEvent(new CustomEvent("bali:transfer-inbox",{detail:{uid:activeUid,items,fresh}}));
  },()=>window.dispatchEvent(new CustomEvent("bali:transfer-inbox",{detail:{uid:activeUid,items:[],error:true}})));
});
