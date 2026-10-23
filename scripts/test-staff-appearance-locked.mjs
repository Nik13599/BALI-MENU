/* Visual contract for BALI Staff.
 * The original desktop/tablet/mobile Staff stylesheet was restored at
 * commit 8bbded7d. The user explicitly prohibited changing its appearance.
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
const approved="c4a1d74134868e4a06b0867fd22c60654b83c5f5";
assert.equal(gitBlob,approved,
  "BALI Staff appearance was modified. Restore the approved CSS for PC, "+
  "tablet and mobile; do not adjust layout, card dimensions or colours "+
  "as part of infrastructure or logic fixes.");
console.log("BALI Staff original PC/mobile appearance unchanged:",gitBlob);
