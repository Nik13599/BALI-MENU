/* BALI protected staff session validation for edge APIs.
 * Never trusts role, uid, email, or balance supplied by the browser.
 * Firebase Auth remains the identity provider during staged D1 rollout.
 */
const PROJECT="bali-menu-5a48b";
const API_KEY="AIzaSyAiGyt5O6x2V0pBNIJ2pOlXxXBgaYqzzUA";
export const errorJson=(status,error)=>new Response(JSON.stringify({error}),{status,headers:{
  "Content-Type":"application/json; charset=utf-8","Cache-Control":"no-store",
  "X-Content-Type-Options":"nosniff","Vary":"Authorization"
}});
const deny=error=>{throw Object.assign(new Error(error),{status:403});};
export async function authorizeUser(request){
  const bearer=request.headers.get("Authorization")||"";
  if(!/^Bearer [A-Za-z0-9_.-]{100,5000}$/.test(bearer))
    throw Object.assign(Error("authentication-required"),{status:401});
  const token=bearer.slice(7);
  const abort=AbortSignal.timeout(7000);
  const identity=await fetch("https://identitytoolkit.googleapis.com/v1/accounts:lookup?key="+API_KEY,{
    method:"POST",headers:{"Content-Type":"application/json"},
    body:JSON.stringify({idToken:token}),signal:abort
  });
  if(!identity.ok)throw Object.assign(Error("authentication-invalid"),{status:401});
  const profile=(await identity.json()).users?.[0];
  const uid=profile?.localId;
  if(!profile||profile.emailVerified!==true||profile.disabled===true||
     typeof uid!=="string"||!/^[a-zA-Z0-9_-]{8,128}$/.test(uid))
    throw Object.assign(Error("authentication-invalid"),{status:401});
  return {uid,email:profile.email||"",token};
}
export async function authorizeStaff(request,{adminOnly=false}={}){
  const {uid,token}=await authorizeUser(request);
  const root="https://firestore.googleapis.com/v1/projects/"+PROJECT+
    "/databases/(default)/documents/";
  async function getRole(path){
    const response=await fetch(root+path+encodeURIComponent(uid),{
      headers:{Authorization:"Bearer "+token},signal:AbortSignal.timeout(7000)
    });
    if(response.status===404||response.status===403)return null;
    if(!response.ok)throw Object.assign(Error("access-check-unavailable"),{status:503});
    return (await response.json()).fields;
  }
  const admin=await getRole("admins/");
  if(admin?.active?.booleanValue===true)return {uid,role:"admin"};
  if(adminOnly)deny("administrator-required");
  const staff=await getRole("preorderStaff/");
  if(staff?.active?.booleanValue===true&&staff?.role?.stringValue==="preorders")
    return {uid,role:"staff"};
  deny("preorder-staff-required");
}
export const handlerError=e=>errorJson(e.status===401?401:e.status===403?403:503,
  e.status===401?"authentication-required":e.status===403?"access-denied":"service-unavailable");
