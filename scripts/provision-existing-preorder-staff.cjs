"use strict";
// Password-free owner utility for the existing dedicated Firebase staff01 user.
// Order permissions are assigned in the existing private Sheets backend.
const admin=require("../functions/node_modules/firebase-admin");
const {readFileSync}=require("node:fs");
const projectId="bali-menu-5a48b",login=process.env.BALI_STAFF_LOGIN;
const expectedUid=process.env.BALI_STAFF_EXPECTED_UID;
const verifyBackend=process.argv.includes("--verify-backend");
async function main(){
  if(login!=="staff01"||expectedUid!=="PpentrythOSBDg9ShRmiucXfK7G3")
    throw Error("Unexpected employee target; refusing to change access.");
  admin.initializeApp({projectId,credential:admin.credential.applicationDefault(),
    serviceAccountId:process.env.BALI_DEPLOY_SERVICE_ACCOUNT});
  const auth=admin.auth(),email="staff+"+login+"@staff.baliminsk.by";
  const user=await auth.getUserByEmail(email);
  if(user.uid!==expectedUid||user.disabled||user.providerData.length!==1||
    user.providerData[0].providerId!=="password")
    throw Error("Employee identity, provider or active status does not match.");
  if(!verifyBackend){
    if(!process.argv.includes("--apply")){
      console.log(JSON.stringify({projectId,login,identityMatches:true,emailVerified:user.emailVerified}));
      return;
    }
    // Dedicated aliases have no inbox; matches the existing owner-only create tool.
    // The password is never read, changed, exported or stored here.
    await auth.updateUser(user.uid,{emailVerified:true,displayName:"Сотрудник BALI"});
    const after=await auth.getUser(user.uid);
    if(after.disabled||!after.emailVerified||after.email!==email)
      throw Error("Firebase identity verification failed.");
    console.log("VERIFIED: staff01 Firebase account is active and email verified; password unchanged.");
    return;
  }
  if(!user.emailVerified)throw Error("Employee is not verified.");
  const apiKey=readFileSync("firebase-config.js","utf8").match(/"apiKey":\s*"([^"]+)"/)?.[1];
  if(!apiKey)throw Error("Public Firebase web configuration is missing.");
  const customToken=await auth.createCustomToken(user.uid);
  const signIn=await fetch("https://identitytoolkit.googleapis.com/v1/accounts:signInWithCustomToken?key="+encodeURIComponent(apiKey),{
    method:"POST",headers:{"Content-Type":"application/json"},
    body:JSON.stringify({token:customToken,returnSecureToken:true})});
  if(!signIn.ok)throw Error("Server test sign-in failed: HTTP "+signIn.status);
  const session=await signIn.json();
  if(session.localId!==expectedUid||!session.idToken)throw Error("Test session identity mismatch.");
  const call=async(action,payload={})=>{
    const response=await fetch("https://baliminsk.by/api/bali-v3",{
      method:"POST",headers:{"Content-Type":"application/json"},
      body:JSON.stringify({action,token:session.idToken,payload})});
    let data;try{data=await response.json()}catch{throw Error("Invalid staff API response.")}
    return {status:response.status,data};
  };
  const me=await call("me");
  if(me.status!==200||me.data?.ok!==true||me.data.data?.role!=="staff")
    throw Error("Existing backend did not grant the limited staff role.");
  const orders=await call("staffRecentOrders");
  if(orders.status!==200||orders.data?.ok!==true||!Array.isArray(orders.data.data?.orders))
    throw Error("Staff queue is unavailable.");
  for(const action of ["adminGuests","adminGuestOrders","adminCard","staffList"]){
    const result=await call(action,{uid:expectedUid});
    if(result.status!==403||result.data?.error?.code!=="permission-denied")
      throw Error("Expected administrative denial for "+action+".");
  }
  console.log("VERIFIED: existing Sheets backend grants staff queue and denies admin guests, admin card, staff management.");
}
main().catch(error=>{console.error("Staff provisioning failed:",error.code||error.message);process.exitCode=1;});
