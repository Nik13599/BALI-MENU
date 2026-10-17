/* 18+ consent: account-only persistence, no guest bypass cookie. */
import {getApp,getApps,initializeApp} from "https://www.gstatic.com/firebasejs/10.14.1/firebase-app.js";
import {getAuth,onAuthStateChanged} from "https://www.gstatic.com/firebasejs/10.14.1/firebase-auth.js";
import {getFirestore,doc,getDoc,setDoc,serverTimestamp} from "https://www.gstatic.com/firebasejs/10.14.1/firebase-firestore.js";
const app=getApps().length?getApp():initializeApp(window.BALI_FIREBASE_CONFIG);
const auth=getAuth(app),db=getFirestore(app);
const dialog=document.getElementById("baliAgeGate");
let current=null,version=0,acceptedUid=null,busy=false;
onAuthStateChanged(auth,user=>{
  current=user?.emailVerified?user:null;version++;acceptedUid=null;
});
const consentRef=uid=>doc(db,"users",uid,"ageConfirmations","restrictedMenus");
async function confirm(){
  if(busy||!dialog)return false;
  busy=true;
  const snapshotVersion=version;
  const user=current;
  const profile=window.BaliAuth?.getProfile?.();
  const recognized=Boolean(user&&window.BaliAuth?.isRegistered?.()&&profile?.uid===user.uid);
  try{
    if(recognized){
      if(acceptedUid===user.uid)return true;
      try{
        const saved=await getDoc(consentRef(user.uid));
        if(saved.exists()&&saved.data()?.over18===true){
          if(snapshotVersion!==version)return false;
          acceptedUid=user.uid;return true;
        }
      }catch(error){console.warn("BALI 18+ saved status:",error.code||error);}
    }
    if(snapshotVersion!==version)return false;
    const allowed=await new Promise(resolve=>{
      const yes=dialog.querySelector('[data-age-answer="yes"]');
      const no=dialog.querySelector('[data-age-answer="no"]');
      let finished=false;
      const done=result=>{
        if(finished)return;
        finished=true;
        yes.removeEventListener("click",approve);
        no.removeEventListener("click",reject);
        dialog.removeEventListener("cancel",cancel);
        dialog.close();
        resolve(result);
      };
      const approve=()=>done(true),reject=()=>done(false);
      const cancel=e=>{e.preventDefault();done(false);};
      yes.addEventListener("click",approve);
      no.addEventListener("click",reject);
      dialog.addEventListener("cancel",cancel);
      dialog.showModal();
      no.focus();
    });
    if(!allowed||snapshotVersion!==version)return false;
    if(recognized){
      try{
        await setDoc(consentRef(user.uid),{over18:true,confirmedAt:serverTimestamp()});
        if(snapshotVersion!==version)return false;
        acceptedUid=user.uid;
      }catch(error){
        console.warn("BALI 18+ saving status:",error.code||error);
        // A failed account save must not silently grant a permanent bypass.
        // The visitor can view this session; they will be asked again next time.
      }
    }
    return true;
  }finally{busy=false;}
}
window.BaliAgeGate={confirm};
