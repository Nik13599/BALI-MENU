/* 18+ consent: account-only persistence, no guest bypass cookie. */
const dialog=document.getElementById("baliAgeGate");
let current=null,version=0,acceptedUid=null,busy=false;
let db,doc,getDoc,setDoc,serverTimestamp;
// Guest confirmation is local and immediately available. Account persistence
// attaches in the background, without blocking access to the public cards.
Promise.all([
  import("https://www.gstatic.com/firebasejs/10.14.1/firebase-app.js"),
  import("https://www.gstatic.com/firebasejs/10.14.1/firebase-auth.js"),
  import("https://www.gstatic.com/firebasejs/10.14.1/firebase-firestore.js")
]).then(([apps,authApi,store])=>{
  const app=apps.getApps().length?apps.getApp():apps.initializeApp(window.BALI_FIREBASE_CONFIG);
  db=store.getFirestore(app);
  ({doc,getDoc,setDoc,serverTimestamp}=store);
  authApi.onAuthStateChanged(authApi.getAuth(app),user=>{
    const next=user?.emailVerified?user:null;
    if(current?.uid!==next?.uid){version++;acceptedUid=null;}
    current=next;
  });
}).catch(error=>console.warn("BALI 18+ account storage:",error.code||"unavailable"));
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
