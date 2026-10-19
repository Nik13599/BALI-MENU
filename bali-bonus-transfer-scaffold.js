/* BALI ID · BONUS TRANSFER (RESERVED, NOT ENABLED).
 * This module defines the admin-only interface contract, not a transfer API.
 * No Firestore writes, no callable invocation, and no guest-facing controls.
 */
export const TRANSFER_FEATURE = Object.freeze({
  enabled: false,
  endpoint: null,
  allowedRoles: Object.freeze(["director","admin"]),
  collection: "bonusTransfers",
  walletCollection: "guestWallets",
  transferableKinds: Object.freeze(["cocktail","shot","hookah","entry"])
});
export const BENEFIT_NAMES = Object.freeze({
  cocktail:"Бесплатные коктейли",
  shot:"Бесплатные шоты",
  hookah:"Бесплатные кальяны",
  entry:"Бесплатные проходы"
});
export function validateTransferDraft(raw) {
  const from=String(raw?.fromCardNumber||"").trim();
  const to=String(raw?.toCardNumber||"").trim();
  const kind=String(raw?.kind||"");
  const quantity=Number(raw?.quantity);
  if(!/^\d{1,9}$/.test(from)||Number(from)<1)throw Error("Укажите номер карты отправителя.");
  if(!/^\d{1,9}$/.test(to)||Number(to)<1)throw Error("Укажите номер карты получателя.");
  if(Number(from)===Number(to))throw Error("Нельзя переводить бонусы самому себе.");
  if(!TRANSFER_FEATURE.transferableKinds.includes(kind))throw Error("Тип бонуса не поддерживает перевод.");
  if(!Number.isInteger(quantity)||quantity<1||quantity>500)throw Error("Допустимое количество: 1–500 шт.");
  return Object.freeze({
    fromCardNumber:Number(from),
    toCardNumber:Number(to),
    kind,
    quantity
  });
}
export function isTransferableGrant(grant) {
  // Category privileges, percentage discounts, unlimited passes, expired or
  // event-bound grants are never transferable by default.
  return Boolean(grant &&
    TRANSFER_FEATURE.transferableKinds.includes(grant.kind) &&
    grant.transferable===true &&
    grant.unlimited!==true &&
    Number.isInteger(grant.remaining) && grant.remaining>0 &&
    !grant.eventRef &&
    (!grant.expiresAt||typeof grant.expiresAt.toMillis!=="function"||grant.expiresAt.toMillis()>Date.now()));
}
export function initBonusTransferScaffold() {
  document.querySelectorAll("[data-bali-transfer-form]").forEach(form=>{
    const submit=form.querySelector("[data-bali-transfer-submit]");
    if(submit){submit.disabled=true;submit.setAttribute("aria-disabled","true");}
    form.addEventListener("submit",event=>{
      event.preventDefault();
      const status=form.querySelector("[data-bali-transfer-status]");
      if(status)status.textContent="Переводы пока отключены. Операция не выполнена.";
    });
  });
}
if(document.readyState==="loading")document.addEventListener("DOMContentLoaded",initBonusTransferScaffold,{once:true});
else initBonusTransferScaffold();
