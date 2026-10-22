/**
 * BALI COIN ledger for a Google Apps Script project bound to the BALI MENU v3 sheet.
 *
 * SECURITY: Internal server functions only. Do not expose these functions through
 * doGet/doPost, google.script.run or a public web-app endpoint. The Apps Script
 * project editor is an administrator; restrict editor access accordingly.
 * No client-controlled balance writes are permitted.
 *
 * To install, copy this file into the Apps Script project owned by the sheet.
 * The GitHub copy by itself is NOT deployed.
 */
const BALI_COIN_DB_ID = '1QxY-WgMwTT_5F3tdHxZICVbdUo4XOvgqI_7endBhOe0';
const BALI_COIN_WALLETS = 'BALI COIN';
const BALI_COIN_LOG = 'История BALI COIN';

function baliCoinSheet_(name) {
  const sheet = SpreadsheetApp.openById(BALI_COIN_DB_ID).getSheetByName(name);
  if (!sheet) throw new Error('Отсутствует лист: ' + name);
  return sheet;
}

function baliCoinValidateUid_(uid) {
  if (typeof uid !== 'string' || !/^[A-Za-z0-9:_-]{6,128}$/.test(uid))
    throw new Error('Недопустимый UID');
  return uid;
}
function baliCoinValidateAmount_(amount) {
  if (typeof amount !== 'number' || !Number.isSafeInteger(amount) || amount <= 0)
    throw new Error('Количество монет должно быть положительным целым числом');
  return amount;
}
function baliCoinValidateKey_(key) {
  if (typeof key !== 'string' || !/^[A-Za-z0-9:_-]{12,128}$/.test(key))
    throw new Error('Укажите уникальный ID запроса длиной от 12 символов');
  return key;
}
function baliCoinClean_(text, maxLength) {
  return String(text || '').replace(/[\x00-\x1f]/g, ' ').slice(0, maxLength);
}
function baliCoinSafeCell_(value) {
  const s = String(value);
  return /^[=+@\-\t\r]/.test(s) ? "'" + s : s;
}
function baliCoinRows_(sheet, width) {
  const count = sheet.getLastRow();
  return count > 1 ? sheet.getRange(2, 1, count - 1, width).getValues() : [];
}
function baliCoinIndex_(rows, uid) {
  return rows.findIndex(row => String(row[0]) === uid);
}
function baliCoinEnsureWallet_(sheet, rows, uid) {
  const index = baliCoinIndex_(rows, uid);
  if (index !== -1) return { rowNumber: index + 2, balance: Number(rows[index][1]) };
  sheet.appendRow([baliCoinSafeCell_(uid), 0, new Date(), 1]);
  const rowNumber = sheet.getLastRow();
  rows.push([uid, 0, new Date(), 1]);
  return { rowNumber, balance: 0 };
}
function baliCoinSetBalance_(sheet, wallet, value) {
  if (!Number.isSafeInteger(value) || value < 0) throw new Error('Недопустимый остаток');
  const version = Number(sheet.getRange(wallet.rowNumber, 4).getValue()) || 1;
  sheet.getRange(wallet.rowNumber, 2, 1, 3).setValues([[value, new Date(), version + 1]]);
}
function baliCoinLog_(sheet, uid, type, amount, balance, operator, note, requestId) {
  sheet.appendRow([
    Utilities.getUuid(), new Date(), baliCoinSafeCell_(uid), type, amount, balance,
    baliCoinSafeCell_(operator), baliCoinSafeCell_(note), baliCoinSafeCell_(requestId)
  ]);
}
function baliCoinHasRequest_(sheet, key) {
  return baliCoinRows_(sheet, 9).some(row => String(row[8]) === key);
}
function baliCoinLocked_(callback) {
  const lock = LockService.getScriptLock();
  lock.waitLock(30000);
  try { return callback(); } finally { lock.releaseLock(); }
}

/**
 * INTERNAL operator action; intended to be invoked only by a trusted script editor.
 * type: CREDIT | DEBIT. Use a new requestId for each operation.
 * operatorUid is an audit label, NOT an authorization credential.
 */
function baliCoinAdminAdjustment(uid, type, amount, operatorUid, note, requestId) {
  baliCoinValidateUid_(uid);
  baliCoinValidateUid_(operatorUid);
  baliCoinValidateAmount_(amount);
  baliCoinValidateKey_(requestId);
  if (type !== 'CREDIT' && type !== 'DEBIT') throw new Error('Недопустимая операция');
  if (!String(note || '').trim()) throw new Error('Требуется основание операции');
  return baliCoinLocked_(() => {
    const wallets = baliCoinSheet_(BALI_COIN_WALLETS);
    const log = baliCoinSheet_(BALI_COIN_LOG);
    if (baliCoinHasRequest_(log, requestId)) return { duplicate: true };
    const rows = baliCoinRows_(wallets, 4);
    const wallet = baliCoinEnsureWallet_(wallets, rows, uid);
    if (!Number.isSafeInteger(wallet.balance) || wallet.balance < 0)
      throw new Error('Повреждён баланс кошелька');
    const delta = type === 'CREDIT' ? amount : -amount;
    const nextBalance = wallet.balance + delta;
    if (!Number.isSafeInteger(nextBalance) || nextBalance < 0)
      throw new Error('Недостаточно BALI COIN или переполнение');
    // Record planned operation before balance mutation for recovery/audit.
    baliCoinLog_(log, uid, type, delta, nextBalance, operatorUid,
      baliCoinClean_(note, 180), requestId);
    SpreadsheetApp.flush();
    baliCoinSetBalance_(wallets, wallet, nextBalance);
    SpreadsheetApp.flush();
    return { uid, balance: nextBalance, requestId };
  });
}

/**
 * INTERNAL reconciliation check. Report only. Does not change balances.
 * Initial balances must be zero and all changes must go through the ledger.
 */
function baliCoinAudit() {
  return baliCoinLocked_(() => {
    const wallets = baliCoinRows_(baliCoinSheet_(BALI_COIN_WALLETS), 4);
    const log = baliCoinRows_(baliCoinSheet_(BALI_COIN_LOG), 9);
    const expected = new Map();
    const duplicates = [];
    const requestIds = new Set();
    log.forEach(r => {
      const uid = String(r[2]), delta = Number(r[4]), key = String(r[8]);
      if (!Number.isSafeInteger(delta)) throw new Error('Неизвестная сумма в истории');
      if (requestIds.has(key)) duplicates.push(key);
      requestIds.add(key);
      expected.set(uid, (expected.get(uid) || 0) + delta);
    });
    const discrepancies = [];
    wallets.forEach(r => {
      const uid = String(r[0]), actual = Number(r[1]), calculated = expected.get(uid) || 0;
      if (actual !== calculated) discrepancies.push({ uid, actual, calculated });
      expected.delete(uid);
    });
    expected.forEach((calculated, uid) => discrepancies.push({ uid, actual: null, calculated }));
    return { discrepancies, duplicates, walletCount: wallets.length, operationCount: log.length };
  });
}


/**
 * INTERNAL read model for a verified caller. This function does not authenticate
 * browser users. A future HTTP adapter MUST verify an ID token server-side,
 * derive uid from that token and enforce account ownership.
 * Never accept a UID supplied by an untrusted browser as authorization.
 */
function baliCoinInternalSnapshot(uid, limit) {
  baliCoinValidateUid_(uid);
  const safeLimit = Number.isSafeInteger(limit) ? Math.max(1, Math.min(limit, 30)) : 20;
  return baliCoinLocked_(() => {
    const wallets = baliCoinRows_(baliCoinSheet_(BALI_COIN_WALLETS), 4);
    const index = baliCoinIndex_(wallets, uid);
    const balance = index < 0 ? 0 : Number(wallets[index][1]);
    if (!Number.isSafeInteger(balance) || balance < 0)
      throw new Error('Повреждён баланс кошелька');
    const entries = baliCoinRows_(baliCoinSheet_(BALI_COIN_LOG), 9)
      .filter(row => String(row[2]) === uid)
      .slice(-safeLimit).reverse()
      .map(row => ({
        id: String(row[0]),
        at: row[1] instanceof Date ? row[1].toISOString() : String(row[1]),
        type: String(row[3]),
        amount: Number(row[4]),
        balanceAfter: Number(row[5]),
        reason: String(row[7])
      }));
    return { uid, balance, entries };
  });
}
