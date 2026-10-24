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

Run the **offline export check** first, without Firebase credentials or writes:

```bash
node scripts/migrate-bali-coins.cjs --offline --input ./private/bali-coin-export.json
```

The offline report includes wallet count, history count, total COIN, a SHA-256
of the private source file and explicit `firebaseIdentityVerified: false`.
It rejects empty exports, duplicate identities, malformed balances and
out-of-order histories. **Passing this check is not proof of source authenticity
or correspondence to Firebase**; verify the original Sheets/Firebase export and
freeze legacy writes separately.

Install Firebase dependencies in `functions/`, configure Firebase Application
Default Credentials locally (never commit credentials), then run the online
read-only identity comparison and only afterwards the explicitly authorized
import:

```bash
npm ci --prefix functions
node scripts/migrate-bali-coins.cjs --input ./private/bali-coin-export.json
node scripts/migrate-bali-coins.cjs --input ./private/bali-coin-export.json \
  --apply --project bali-menu-5a48b \
  --expected-sha256 "$VERIFIED_EXPORT_SHA256" \
  --confirm FIREBASE_COIN_IMPORT
```

Before the import, compare the offline report's `exportSha256` with the SHA-256
of the reviewed, frozen private export. Set `VERIFIED_EXPORT_SHA256` to that
exact 64-character digest. Imports are rejected if the file has changed or the
production project was not selected explicitly. Adjacent transaction balances
are recalculated and validated using signed credit/debit/transfer arithmetic.
A nonzero opening balance before the earliest exported transaction is allowed,
but it must be independently reconciled to the original source.

The online dry run only inspects. The import rejects Firebase UID/number mismatches,
live wallets and duplicates, creates deterministic history references, and
can resume after a network interruption. A wallet with incomplete imported
history cannot be used.

**Actual import status: not run.** No complete export or live Firebase
permissions have been supplied for this migration.

## Server-side COIN release gate

**Default is frozen**, even when a Cloud Functions deployment succeeds.
Balance-changing operations (transfer, manual credit/debit, attendance/activity
rewards and bar/prize purchase) require server-side release settings.
No client-provided flag can bypass the gate. BRSM attendance is recorded while
COIN is frozen with `coinsAwarded: 0`, and may be credited later using the
existing idempotent visit-claim operation. Reversing a visit with existing
COIN credit is blocked during a freeze to avoid leaving an inconsistent ledger.

Configure these server environment variables outside the public repository:
- For **pilot** testing: `BALI_COIN_WRITE_MODE=pilot`,
  `BALI_COIN_PILOT_CONFIRM=ALLOW_TEST_COIN_WRITES` and
  `BALI_COIN_PILOT_UIDS=<comma-separated dedicated test Firebase UIDs>`.
  Both transfer endpoints must be in the pilot allowlist.
- For **live** operation, only after reconciliation and signed-off review:
  `BALI_COIN_WRITE_MODE=live`,
  `BALI_COIN_VERIFIED_EXPORT_SHA256=<64-char approved source file hash>`,
  `BALI_COIN_LIVE_CONFIRM=VERIFIED_SOURCE_AND_WALLETS`.
- Omitting any required value keeps the ledger frozen. Never commit
  `functions/.env` or production wallet export contents into GitHub.
- Fulfilling an already-paid voucher remains possible during a freeze: it
  does not credit/debit guest coin accounts.

This operational release flag is an **additional guard**, not evidence that
legacy balances were successfully imported. Pilot accounts must be verified
and isolated from existing guest history before enabling pilot mode.

In **live** mode the server rejects any balance-changing request for a guest
whose `baliCoinAccounts/{uid}` document does not exist. A missing document
is not equivalent to a zero balance. Guest card endpoints return
`walletReady: false` and `coinBalance: null`; the UI explicitly requests
source reconciliation instead of displaying 0. BRSM attendance can still
be recorded for that guest; automatic COIN credit is deferred until the
preexisting wallet has been verified and imported. The idempotent guest visit
claim can then complete the missed award.

## Firebase Functions v2 IAM readiness (read-only)

The COIN and BRSM callables are deployed using `firebase-functions/v2/https`
in project `bali-menu-5a48b`. Unless a runtime `serviceAccount` is
explicitly configured, **Firebase 2nd-generation functions run as the Compute
Engine default service account**, `PROJECT_NUMBER-compute@developer.gserviceaccount.com`.
The old App Engine account `PROJECT_ID@appspot.gserviceaccount.com` is the
default for **1st-generation** functions, not these v2 callables. Never grant
project-wide Owner/Editor merely to bypass a missing `actAs` permission.

GitHub Actions now offers the **manual and read-only**
`Firebase BALI COIN + BRSM — read-only IAM readiness` workflow on main.
It checks:

- A configured `FIREBASE_DEPLOY_SERVICE_ACCOUNT` environment/repository variable.
- A correctly formatted `BALI_COIN_PILOT_UIDS` environment secret with at
  least two distinct, dedicated test Firebase Authentication UIDs.
- Workload Identity Federation and whether the deployer has
  `iam.serviceAccounts.actAs` on the **actual** v2 Compute runtime service
  account resolved from the Google Cloud project number.

It **does not** deploy any function, modify Firestore, create test users,
transfer COIN, or use Cloudflare MCP. If `actAs` is denied, a project owner
must grant `roles/iam.serviceAccountUser` **on that one Compute runtime
service account** to the dedicated GitHub deployment principal
`bali-firestore-deploy@bali-menu-5a48b.iam.gserviceaccount.com`.
A separate 1st-gen deployment, if used in future, may require an independent
grant on the App Engine account.

A successful readiness check does **not** prove legacy balance reconciliation
and does not activate COIN for real customers. Only the separate pilot release,
selected explicitly with `ENABLE_TEST_COIN_PILOT`, may deploy test-only
mutations; the final live release remains gated by imported, verified wallets.

### Additional safeguards for the dedicated test pilot

The protected manual deployment runs `scripts/verify-bali-coin-pilot.cjs`
**after short-lived Google Cloud authentication but before any Firebase
deployment**. It confirms that every UID in the protected secret belongs to
an enabled, email-verified Firebase Authentication user with both
`users/{uid}` and `baliIds/{uid}`, that card numbers are distinct, and that
the UID does not belong to director/admin or preorder Staff. A preexisting
non-pilot COIN wallet blocks deployment, preventing an existing guest's
balance being used as a test account. This verification is read-only.

Any new COIN wallet created under the pilot must include
`source: "bali-coin-pilot"`. Every later test credit, debit, transfer,
redeem or BRSM visit award refuses an existing wallet with another source.
This protection is enforced **inside the Firestore transaction** as well as
at deployment, even if a protected secret is changed after the audit.

The separate GitHub IAM **diagnostic** deliberately shows missing
`BALI_COIN_PILOT_UIDS` as an explicit `NOT READY` warning, so it can still
independently test Google WIF and IAM. A successful diagnostic job is **not**
pilot-release approval. The actual `ENABLE_TEST_COIN_PILOT` release rejects
missing, invalid or non-existent test identities; no placeholder UIDs are
accepted. The diagnostic automatically runs on reviewed updates to its own
workflow file on main, but never deploys Firebase.

## Immutable BRSM lotto tickets after attendance corrections

A valid BRSM ticket is generated **once**, on reaching the campaign's required
number of different CONTACT visits. If a director cancels an attendance record
before the draw, the guest becomes ineligible and the public-facing
`tickets` array is cleared. The original tickets remain in
`reservedTickets` on the Firestore entry; after a verified manual or
QR reinstatement, the guest receives **the same numbers**. The old single-
campaign BRSM path likewise stores `reservedNumbers`, preserving its original
ten-number ticket.

Malformed, duplicate, out-of-range or wrong-size saved tickets fail closed
rather than being silently replaced with newly randomized numbers. Once a
draw has begun, attendance changes are still blocked. Two correction cycles,
including re-entry through a *different* QR token, are covered by automated
tests. This prevents staff attendance corrections from becoming unlimited
lottery-ticket rerolls.

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
