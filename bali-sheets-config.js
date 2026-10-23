/* Production safety switch. Turn ON only after the private Google Apps Script
 * deployment, Cloudflare Worker route and secrets have all been verified. */
window.BALI_SHEETS_API_ENABLED = false;

// Orders only: Cloudflare D1. Never use this switch for BALI ID or COIN.
window.BALI_D1_PREORDERS_ENABLED = false; // Enable only after backend CI + D1 cutover.
