# BALI · Firestore-only migration status

**Design choice:** Firestore is the operational database for BALI ID, BRSM cards,
event check-ins, campaign lotto, all BALI COIN balances, bonus transfers, bar
vouchers and COIN operations. Firebase Authentication remains the only sign-in
provider. No second ID numbering counter or bonus balance in Google Sheets.

## Implemented in the PR
- Immutable BALI ID is `baliIds/{uid}.number` from the existing Firebase transaction.
- BALI COIN is `baliCoinAccounts/{uid}.balance`, linked by Firebase Auth UID.
- Every credit, debit, transfer and redeem goes through Cloud Functions and
  Firestore transactions. `baliCoinRequests` prevents duplicate mutations.
- `baliCoinAccounts/{uid}/history` keeps each user's private operation history.
- Bar and prize catalog uses `baliCoinLots`. A fulfilled voucher is marked
  `served` in the global voucher document and the owner's voucher in one
  transaction. Guests cannot directly write coin documents.
- BRSM campaign check-in and configured visit COIN award are committed inside
  **one** Firestore transaction. Subsequent catch-up calls are idempotent.
- Standard Member/Gold/etc. and BRSM views share the same coin account.
- Existing `guestWallets` keeps distinct physical quantity benefits (shots,
  cocktails, hookahs, entry), with the existing Firebase transfer mechanism.

## Migration of historical Sheets balances and transactions
**Never import production balances while balances can still change in Sheets.**
Export the private data into a local, untracked JSON file with Firebase UID,
six-digit BALI ID and a **verified final** BALI COIN balance. Provide historical
transactions in their original chronological order.

Example private file:
```json
{
  "cards": [{"uid":"firebase_uid_001","number":"000123","coinBalance":125}],
  "history":[{"uid":"firebase_uid_001","id":"old_row_001","type":"credit",
    "count":125,"balance":125,"createdAt":"2026-10-23T18:00:00Z",
    "reason":"Посещение КОНТАКТ"}]
}
```

Install the Firebase dependencies in `functions/`, configure Firebase
Application Default Credentials locally (never commit credentials), then run:

```bash
npm ci --prefix functions
node scripts/migrate-bali-coins.cjs --input ./private/bali-coin-export.json
node scripts/migrate-bali-coins.cjs --input ./private/bali-coin-export.json --apply --confirm FIREBASE_COIN_IMPORT
```

First command only inspects. The import rejects Firebase UID/number mismatches,
live wallets and duplicates, creates deterministic history references, and
can resume after a network interruption. A wallet with incomplete imported
history cannot be used.

**Actual import status: not run.** No complete export or live Firebase
permissions have been supplied for this migration.

## Deployment checklist
1. Run all backend, Firestore emulator, BRSM, admin and mobile tests.
2. Validate source-to-target BALI IDs, final COIN sums and histories using a
   read-only audit. Freeze Sheets-based mutation before applying any import.
3. Deploy Firestore rules and functions in staging; rehearse two distinct
   guest accounts, 3 check-ins, a COIN transfer, a bar redemption and an
   idempotent voucher fulfillment with real auth claims.
4. Only then publish frontend changes. Do not publish a partial wallet cutover:
   new Firebase writes + continuing Sheets writes would split balances.
5. Later migrate remaining non-wallet legacy Sheets/Cloudflare processes
   separately; preserve existing BALI STAFF and preorder UI during cutover.

**Operational scope:** This PR migrates the BRSM/BALI ID loyalty stack and
BALI COIN, but does **not** claim that every preordering/reporting feature has
already been migrated. Do not remove their old APIs until their data and
transactions have been reconciled.

**Costs:** Firestore and Cloud Functions usage is metered. 800 concurrent QR
check-ins incur reads/writes. Simulate peak traffic and verify quotas before
offering a cost guarantee.
