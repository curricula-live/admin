import assert from "node:assert/strict";
import test from "node:test";
import { atlasAccessDecision } from "../lib/server/owner-access-policy.ts";
import type { OwnerIdentity } from "../lib/server/session-contract.ts";

const future = new Date(Date.now() + 60_000).toISOString();
const past = new Date(Date.now() - 60_000).toISOString();
const identity: OwnerIdentity = {
  subjectId: "c74fe051-ac5e-521b-8770-3180fb0decb6",
  role: "owner",
  expiresAt: future,
};

test("workspace remains invisible while preview gate is off", () => {
  assert.equal(atlasAccessDecision(false, identity), "disabled");
  assert.equal(atlasAccessDecision(false, null), "disabled");
});

test("owner session must exist before the guarded route may render", () => {
  assert.equal(atlasAccessDecision(true, null), "unauthorized");
  assert.equal(atlasAccessDecision(true, identity), "owner");
});

test("expired, malformed or fabricated role denies access", () => {
  assert.equal(atlasAccessDecision(true, { ...identity, expiresAt: past }), "unauthorized");
  assert.equal(atlasAccessDecision(true, { ...identity, expiresAt: "invalid" }), "unauthorized");
  assert.equal(
    atlasAccessDecision(true, { ...identity, role: "admin" } as unknown as OwnerIdentity),
    "unauthorized"
  );
});
