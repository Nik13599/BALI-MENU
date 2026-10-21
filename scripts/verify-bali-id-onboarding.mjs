import {readFileSync} from "node:fs";
import assert from "node:assert/strict";

const read=path=>readFileSync(path,"utf8");
const html=read("index.html");
const app=read("app.js");
const card=read("bali-id.js");
const welcome=read("bali-id-onboarding.js");
const rules=read("firestore.rules");
const css=read("bali-id-onboarding.css");

for(const id of ["baliIdWelcomeDialog","baliIdWelcomeScroll","baliIdWelcomeAccept","baliIdWelcomeCancel","baliIdWelcomeHint","baliIdWelcomeError"]){
  assert(html.includes('id="'+id+'"'),"Missing BALI ID onboarding element: "+id);
}
assert(html.indexOf('bali-id-onboarding.js?v=')<html.indexOf('bali-id.js?v='),"Consent module must load before ID initialization");
assert(html.includes('id="baliIdLoginDialog"')&&html.includes('id="baliIdLoginAction"')&&html.includes('id="baliIdLoginCancel"'),"Mandatory login dialog is missing");
assert(html.includes("Войдите в личный кабинет или зарегистрируйтесь"),"Login dialog must use the required message");
assert(welcome.includes("promptForLogin()")&&welcome.includes("loginDialog.showModal()"),"Logged-out BALI ID taps must show the login notice");
assert(welcome.includes("window.BaliAuth?.open?.()"),"Login notice must lead to the existing sign-in form");
const pc=read("bali-pc-id-home.js");
assert(pc.includes("BaliIdOnboarding?.open?.()"),"Desktop ID showcase must use the unified login gate");
assert(!app.includes('if(nav.dataset.baliNav==="id"&&!window.BaliAuth?.isRegistered?.())'),"Navigation must not bypass the login notice");
assert(!app.includes('if(!window.BaliAuth?.isRegistered?.()){window.BaliAuth?.open?.();return;}\n        navigateGuestPage("id")'),"Mobile ID button must not bypass the login notice");

assert(html.includes('bali-id-onboarding.css?v=')&&css.includes("#baliIdWelcomeDialog"),"Welcome dialog styles missing");
assert(html.includes("MEMBER, SILVER, GOLD, PLATINUM, BLACK и PRIVATE"),"Public explanation of programme tiers missing");
assert(html.includes("кода")&&html.includes("Ознакомлен"),"QR and acknowledgement explanation missing");
assert(welcome.includes("scroll.scrollTop+scroll.clientHeight>=scroll.scrollHeight-12"),"Must scroll to end before acknowledging");
assert(welcome.includes("accept.disabled=busy||!done")&&welcome.includes("if(busy||!reachedEnd())return"),"Acknowledgement button must stay locked until bottom");
assert(welcome.includes("setDoc(agreementRef(user.uid),{version:VERSION,acceptedAt:serverTimestamp()})"),"Acknowledgement must be stored in Firestore");
assert(welcome.includes('new CustomEvent("bali:id-accepted"'),"First card activation signal missing");
assert(app.includes("function renderGuestPage")&&app.includes('if(page==="id" && !window.BaliIdOnboarding?.isAccepted?.())'),"Direct URL/history must enforce onboarding");
assert(app.includes('if(selected==="id" && !window.BaliIdOnboarding?.isAccepted?.())'),"All internal navigation must enforce onboarding");
assert(card.includes('getDoc(doc(db,"users",user.uid,"baliIdAgreements","privilege"))'),"ID code must read stored acknowledgement");
const initialization=card.slice(card.indexOf('async function initializeForUser('));
const consentGuard=initialization.indexOf('if(!consent.exists()||consent.data()?.version!==1)');
const issueNumber=initialization.indexOf('allocate(user.uid,run)');
assert(consentGuard>=0&&issueNumber>consentGuard,"ID issuance must follow recorded acknowledgement");
assert(rules.includes("match /users/{uid}/baliIdAgreements/{agreementId}"),"Missing immutable per-user agreement rules");
assert(rules.includes("allow update, delete: if false;"),"Agreement updates must be denied");
for(const name of ["validBaliCounter","validBaliId","guestPrivileges"]){
  assert(rules.includes(name),"Missing Firestore rules for "+name);
}
const idRules=rules.slice(rules.indexOf("match /baliIds/{uid}"),rules.indexOf("function validBaliCounter()"));
const counterRules=rules.slice(rules.indexOf("function validBaliCounter()"),rules.indexOf("match /baliCounters/{key}"));
const privilegeRules=rules.slice(rules.indexOf("match /guestPrivileges/{uid}"),rules.indexOf("match /privilegeRules/{id}"));
assert(idRules.includes("hasBaliIdAgreement(uid)"),"IDs can be created without acknowledgement");
assert(counterRules.includes("hasBaliIdAgreement(request.auth.uid)"),"ID counter can be incremented without acknowledgement");
assert(privilegeRules.includes("hasBaliIdAgreement(uid)"),"Default Member privileges can be issued without acknowledgement");
console.log("BALI ID onboarding: modal, scroll lock, persisted agreement, all routes and server-side issuance guards PASS.");
