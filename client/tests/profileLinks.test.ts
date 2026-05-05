import assert from "node:assert/strict";
import test from "node:test";

import { getProfilePath, canLinkToProfile } from "../src/lib/profile-links";

test("getProfilePath builds an encoded public profile route", () => {
  assert.equal(getProfilePath("Zero X"), "/profile/Zero%20X");
  assert.equal(getProfilePath("Player#123"), "/profile/Player%23123");
});

test("canLinkToProfile rejects placeholders and empty usernames", () => {
  assert.equal(canLinkToProfile("ZeroX"), true);
  assert.equal(canLinkToProfile("  "), false);
  assert.equal(canLinkToProfile("Scrim Bot 1", { isBot: true }), false);
  assert.equal(canLinkToProfile("Player", { placeholder: true }), false);
});
