"use strict";
// Password-free owner utility for the existing dedicated Firebase staff01 user.
// Order permissions are assigned in the existing private Sheets backend.
const admin=require("../functions/node_modules/firebase-admin");
const projectId="bali-menu-5a48b",login=process.env.BALI_STAFF_LOGIN;
const expectedUid=process.env.BALI_STAFF_EXPECTED_UID;
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
main().catch(error=>{console.error("Staff provisioning failed:",error.code||error.message);process.exitCode=1;});
