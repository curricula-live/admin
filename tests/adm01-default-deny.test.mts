import assert from "node:assert/strict";
import test from "node:test";

import { atlasAccessDecision } from "../lib/server/owner-access-policy.ts";
import {
  OWNER_SESSION_CONTRACT,
  parseOwnerIdentity,
  verifyOwnerSession,
} from "../lib/server/session-contract.ts";

const subjectId = "c74fe051-ac5e-521b-8770-3180fb0decb6";
const expiresAt = new Date(Date.now() + 60_000).toISOString();
const attestation = {
  contract_version: OWNER_SESSION_CONTRACT,
  authenticated: true,
  active: true,
  role: "owner",
  subject_id: subjectId,
  expires_at: expiresAt,
};

test("disabled Atlas is unavailable even with API-attested owner identity", () => {
  const identity = parseOwnerIdentity(attestation, new Date());
  assert.ok(identity);
  assert.equal(atlasAccessDecision(false, identity), "disabled");
});

test("fabricated or malformed owner attestations fail closed", () => {
  const invalid: unknown[] = [
    null,
    {},
    { role: "owner", expires_at: expiresAt },
    { ...attestation, contract_version: "forged-version" },
    { ...attestation, authenticated: false },
    { ...attestation, active: false },
    { ...attestation, role: "admin" },
    { ...attestation, subject_id: "not-a-uuid" },
    { ...attestation, subject_id: undefined },
    { ...attestation, expires_at: "" },
    { ...attestation, expires_at: "not-a-date" },
    { ...attestation, expires_at: new Date(Date.now() - 60_000).toISOString() },
  ];
  for (const payload of invalid) {
    const identity = parseOwnerIdentity(payload, new Date());
    assert.equal(identity, null, JSON.stringify(payload));
    assert.equal(atlasAccessDecision(true, identity), "unauthorized");
  }
});

test("a syntactically valid forged token is not trusted without API attestation", async () => {
  let requests = 0;
  const identity = await verifyOwnerSession(
    "a".repeat(48),
    "http://127.0.0.1:8000",
    false,
    async () => {
      requests += 1;
      return { ok: false, json: async () => attestation };
    }
  );
  assert.equal(requests, 1);
  assert.equal(identity, null);
  assert.equal(atlasAccessDecision(true, identity), "unauthorized");
});

test("owner-looking data from an untrusted session response remains denied", async () => {
  const identity = await verifyOwnerSession(
    "b".repeat(48),
    "http://127.0.0.1:8000",
    false,
    async () => ({
      ok: true,
      json: async () => ({ ...attestation, active: false }),
    })
  );
  assert.equal(identity, null);
  assert.equal(atlasAccessDecision(true, identity), "unauthorized");
});
