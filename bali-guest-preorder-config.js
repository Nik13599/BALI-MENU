/* Explicit rollout switch for anonymous preorders.
 * Switch to true only after publishing BaliBackend.gs with guestCreateOrder
 * and confirming a real Turnstile-verified test order in the private Sheet. */
// Temporary opt-in test mode. Everyone else keeps the previous checkout.
window.BALI_GUEST_PREORDER_ENABLED =
  new URLSearchParams(location.search).get("guestPreorderTest")==="1";
window.BALI_GUEST_TURNSTILE_SITEKEY="0x4AAAAAAFgaCfqEqtblIfyT";
