/* Safe Apple Web Clip profile: a removable Home Screen shortcut only.
 * No credentials, VPN, certificates, device management or supervision.
 */
const identifier="by.baliminsk.staff";
const esc=value=>String(value).replace(/&/g,"&amp;").replace(/</g,"&lt;");
export async function onRequestGet({request,env}){
  const iconUrl=new URL("/bali-staff-approved-icon.png",request.url);
  let icon="";
  try{
    const response=await env.ASSETS.fetch(new Request(iconUrl));
    if(response.ok){
      const bytes=new Uint8Array(await response.arrayBuffer());
      if(bytes.length>0&&bytes.length<200000)
        icon=btoa(Array.from(bytes,c=>String.fromCharCode(c)).join(""));
    }
  }catch{}
  const profile=`<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0"><dict>
<key>PayloadContent</key><array><dict>
<key>FullScreen</key><true/>
<key>Icon</key><data>${icon}</data>
<key>IgnoreManifestScope</key><false/>
<key>IsRemovable</key><true/>
<key>Label</key><string>BALI STAFF</string>
<key>Precomposed</key><true/>
<key>URL</key><string>https://baliminsk.by/preorders.html</string>
<key>PayloadIdentifier</key><string>${identifier}.webclip</string>
<key>PayloadType</key><string>com.apple.webClip.managed</string>
<key>PayloadUUID</key><string>705a2ab3-0f46-5a2e-90db-5916fafadb5b</string>
<key>PayloadVersion</key><integer>1</integer>
</dict></array>
<key>PayloadDisplayName</key><string>BALI STAFF</string>
<key>PayloadDescription</key><string>${esc("Ярлык BALI STAFF для авторизованных сотрудников. Можно удалить.")}</string>
<key>PayloadIdentifier</key><string>${identifier}.install</string>
<key>PayloadOrganization</key><string>BALI NIGHT CLUB</string>
<key>PayloadRemovalDisallowed</key><false/>
<key>PayloadType</key><string>Configuration</string>
<key>PayloadUUID</key><string>f981ce9b-f58d-5064-b9cb-f37630fa421a</string>
<key>PayloadVersion</key><integer>1</integer>
</dict></plist>`;
  return new Response(profile,{headers:{
    "Content-Type":"application/x-apple-aspen-config",
    "Content-Disposition":"attachment; filename=\"BALI-STAFF.mobileconfig\"",
    "Cache-Control":"public, max-age=600",
    "X-Content-Type-Options":"nosniff"
  }});
}
