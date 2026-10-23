import {authorizeStaff} from "../_lib/staff-auth.js";
// A minimal server-side role probe. Staff pages no longer fetch and parse all
// preorder rows just to decide whether to show the login panel.
const json=(data,status=200)=>new Response(JSON.stringify(data),{status,headers:{
  "Content-Type":"application/json; charset=utf-8","Cache-Control":"private,no-store",
  "Vary":"Authorization","X-Content-Type-Options":"nosniff"
}});
export async function onRequestGet({request,env}){
  try{
    const origin=request.headers.get("Origin");
    if(origin&&origin!==new URL(request.url).origin)
      return json({ok:false,error:"origin"},403);
    const actor=await authorizeStaff(request,{env});
    return json({ok:true,role:actor.role});
  }catch(error){
    return json({ok:false,error:error?.status===401?"unauthenticated":
      error?.status===403?"permission-denied":"unavailable"},
      error?.status===401?401:error?.status===403?403:503);
  }
}
export async function onRequestPost(){return json({ok:false,error:"method-not-allowed"},405)}
