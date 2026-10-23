"use strict";
// One-time, password-free activation of the existing dedicated Firebase staff01 identity.
// Grant the minimal Firestore role required by the Cloudflare D1 Staff API.
// Do not create a new user, change a password, or assign an admin role.
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

  // The edge API grants Staff access ONLY if this same-UID document exists
  // with both active=true and role=preorders. Firebase Auth alone is not enough.
  const roleRef=admin.firestore().doc("preorderStaff/"+user.uid);
  const previous=await roleRef.get();
  if(previous.exists){
    const role=previous.data();
    if(role.role!=="preorders"||role.active!==true||
      (role.login&&role.login!==login))
      throw Error("Existing staff role differs or was revoked; refusing to override it.");
  }
  if(!process.argv.includes("--apply")){
    console.log(JSON.stringify({projectId,login,identityMatches:true,
      emailVerified:user.emailVerified,staffRoleReady:previous.exists}));
    return;
  }

  // The synthetic staff email has no mailbox. Only the verified owner workflow
  // may mark the pre-identified employee account as email verified.
  await auth.updateUser(user.uid,{emailVerified:true,displayName:"Сотрудник BALI"});
  const after=await auth.getUser(user.uid);
  if(after.uid!==expectedUid||after.disabled||!after.emailVerified||after.email!==email)
    throw Error("Firebase identity verification failed.");

  if(!previous.exists){
    try{
      await roleRef.create({
        active:true,role:"preorders",name:"Сотрудник BALI",login,
        createdAt:admin.firestore.FieldValue.serverTimestamp(),
        updatedAt:admin.firestore.FieldValue.serverTimestamp()
      });
    }catch(error){
      // Do not mistake a concurrent role change for a successful provision.
      throw Error("Unable to create preorderStaff role: "+(error.code||error.message));
    }
  }
  const verified=await roleRef.get();
  if(!verified.exists||verified.data().active!==true||
    verified.data().role!=="preorders"||
    (verified.data().login&&verified.data().login!==login))
    throw Error("Firestore preorderStaff role verification failed.");
  console.log("VERIFIED: staff01 identity and minimal Firestore preorder role are active; password unchanged.");
}
main().catch(error=>{console.error("Staff provisioning failed:",error.code||error.message);process.exitCode=1;});
