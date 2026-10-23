/* Visual contract for BALI Staff.
 * The active, published desktop/tablet/mobile Staff stylesheet is locked.
 * Its current approved value is read from main, unchanged by this migration.
 * Change this checksum only after an explicit design-change request and
 * fresh responsive screenshot verification, not for backend/bug-fix work.
 */
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
import {createHash} from "node:crypto";

const file="preorders-workspace.css";
const css=readFileSync(file);
const gitBlob=createHash("sha1")
  .update("blob "+css.length+"\0")
  .update(css)
  .digest("hex");
const approved="1621e8af191db5a6036fefe59316c9b435d653b0";
assert.equal(gitBlob,approved,
  "BALI Staff appearance was modified. Restore the approved CSS for PC, "+
  "tablet and mobile; do not adjust layout, card dimensions or colours "+
  "as part of infrastructure or logic fixes.");
console.log("BALI Staff original PC/mobile appearance unchanged:",gitBlob);
