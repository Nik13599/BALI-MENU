"use strict";
// Owner-only, password-free provisioning of an existing dedicated Firebase user.
// Refuses disabled/revoked users and accounts with any wider administrative role.
const admin=require("../functions/node_modules/firebase-admin");
const projectId="bali-menu-5a48b";
const login=process.env.BALI_STAFF_LOGIN;
const expectedUid=process.env.BALI_STAFF_EXPECTED_UID;
const apply=process.argv.includes("--apply");
async function main(){
  if(login!=="staff01"||expectedUid!=="PpentrythOSBDg9ShRmiucXfK7G3")
    throw Error("Unexpected target employee; refusing to change access.");
  const credential=admin.credential.applicationDefault();
  admin.initializeApp({projectId,credential});
  const token=await credential.getAccessToken();
  const meta=await fetch(`https://firestore.googleapis.com/v1/projects/${projectId}/databases/(default)`,{
    headers:{Authorization:`Bearer ${token.access_token}`}
  });
  if(!meta.ok)throw Error(`Cannot inspect existing Firestore database: HTTP ${meta.status}.`);
  const database=await meta.json();
  if(database.databaseEdition!=="STANDARD"||database.type!=="FIRESTORE_NATIVE")
    throw Error("Expected the existing STANDARD native Firestore database.");
  const auth=admin.auth(),db=admin.firestore();
  const email=`staff+${login}@staff.baliminsk.by`;
  const user=await auth.getUserByEmail(email);
  if(user.uid!==expectedUid||user.disabled||user.providerData.length!==1||
      user.providerData[0].providerId!=="password")
    throw Error("Employee identity/provider/active status does not match.");
  const roleRef=db.doc("preorderStaff/"+user.uid);
  const [owner,director,role]=await Promise.all([
    db.doc("admins/"+user.uid).get(),db.doc("staffRoles/"+user.uid).get(),roleRef.get()
  ]);
  if(owner.exists||director.exists)throw Error("Account already has a wider administrative role.");
  if(role.exists&&(role.data().active!==true||role.data().role!=="preorders"||role.data().login!==login))
    throw Error("Existing role differs or has been revoked; refusing to overwrite.");
  console.log(JSON.stringify({projectId,login,databaseEdition:database.databaseEdition,
    identityMatches:true,hasAdminRole:false,hasDirectorRole:false,
    role:role.exists?role.data().role:null,emailVerified:user.emailVerified,apply}));
  if(!apply)return;
  if(!role.exists)await roleRef.create({login,name:"Сотрудник BALI",active:true,role:"preorders",
    createdAt:admin.firestore.FieldValue.serverTimestamp()});
  // A dedicated alias has no inbox. This matches the existing owner-only create tool.
  // No password is read, reset, exported, or stored by this utility.
  await auth.updateUser(user.uid,{emailVerified:true,displayName:"Сотрудник BALI"});
  const [after,staff,adminRole,directorRole]=await Promise.all([
    auth.getUser(user.uid),roleRef.get(),db.doc("admins/"+user.uid).get(),db.doc("staffRoles/"+user.uid).get()
  ]);
  if(after.disabled||!after.emailVerified||!staff.exists||staff.data().role!=="preorders"||
      staff.data().active!==true||adminRole.exists||directorRole.exists)
    throw Error("Post-provision verification failed.");
  console.log("VERIFIED: staff01 is active, email verified, preorder-only; no admin/director role.");
}
main().catch(error=>{console.error("Staff provisioning failed:",error.code||error.message);process.exitCode=1;});
