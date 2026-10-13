import assert from "node:assert/strict";
import test from "node:test";

import {
  OWNER_SESSION_CONTRACT,
  verifyOwnerSession,
} from "../lib/server/session-contract.ts";
import { atlasAccessDecision } from "../lib/server/owner-access-policy.ts";

const token = "a".repeat(48);
const origin = "http://127.0.0.1:8000";
const now = new Date();
const expiresAt = new Date(now.getTime() + 60 * 60 * 1000);
const attestation = {
  contract_version: OWNER_SESSION_CONTRACT,
  authenticated: true,
  active: true,
  role: "owner",
  subject_id: "c74fe051-ac5e-521b-8770-3180fb0decb6",
  expires_at: expiresAt.toISOString(),
};

test("upstream outage and malformed responses never authorize Atlas", async () => {
  const cases = [
    async () => { throw new Error("connection refused"); },
    async () => ({ ok: false, json: async () => attestation }),
    async () => ({ ok: true, json: async () => { throw new SyntaxError("invalid JSON"); } }),
    async () => ({ ok: true, json: async () => null }),
    async () => ({ ok: true, json: async () => ({ ...attestation, contract_version: "unexpected" }) }),
  ];
  for (const requester of cases) {
    const identity = await verifyOwnerSession(token, origin, false, requester, now);
    assert.equal(identity, null);
    assert.equal(atlasAccessDecision(true, identity), "unauthorized");
  }
});

test("attestation expiry is enforced at verification boundary", async () => {
  const requester = async () => ({ ok: true, json: async () => attestation });
  const valid = await verifyOwnerSession(token, origin, false, requester, now);
  assert.ok(valid);
  assert.equal(atlasAccessDecision(true, valid), "owner");

  const expired = await verifyOwnerSession(
    token, origin, false, requester, expiresAt
  );
  assert.equal(expired, null);
  assert.equal(atlasAccessDecision(true, expired), "unauthorized");
});

test("invalid API origins fail closed without any outbound request", async () => {
  let calls = 0;
  const requester = async () => {
    calls += 1;
    return { ok: true, json: async () => attestation };
  };
  for (const invalidOrigin of [
    "http://example.com",
    "https://api.curricula.live.evil.test",
    "https://api.curricula.live/other",
    "https://user:pass@api.curricula.live",
  ]) {
    assert.equal(await verifyOwnerSession(token, invalidOrigin, false, requester, now), null);
  }
  assert.equal(calls, 0);
});
