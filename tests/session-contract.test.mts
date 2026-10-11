import assert from "node:assert/strict";
import test from "node:test";
import {
  OWNER_COOKIE_NAME, OWNER_SESSION_CONTRACT,
  parseOwnerIdentity, sessionVerificationUrl, verifyOwnerSession
} from "../lib/server/session-contract.ts";

const NOW = new Date("2026-10-11T19:00:00Z");
const TOKEN = "a".repeat(48);
const ID = "c74fe051-ac5e-521b-8770-3180fb0decb6";
const valid = {
  contract_version: OWNER_SESSION_CONTRACT,
  authenticated: true,
  active: true,
  role: "owner",
  subject_id: ID,
  expires_at: "2026-10-11T20:00:00Z"
};

test("session cookie must be host-only prefix", () => {
  assert.equal(OWNER_COOKIE_NAME, "__Host-curricula_admin_session");
});

test("only trusted production origin is permitted", () => {
  assert.equal(sessionVerificationUrl("https://api.curricula.live", true), "https://api.curricula.live/v1/admin/auth/session/");
  assert.equal(sessionVerificationUrl("http://localhost:8000", true), null);
  assert.equal(sessionVerificationUrl("http://localhost:8000", false), "http://localhost:8000/v1/admin/auth/session/");
  for (const origin of ["https://evil.com", "https://api.curricula.live.evil.com", "https://user:pass@api.curricula.live", "https://api.curricula.live/other", "file:///tmp/nope"]) {
    assert.equal(sessionVerificationUrl(origin, true), null);
  }
});

test("only active, unexpired owner identities are trusted", () => {
  assert.equal(parseOwnerIdentity(valid, NOW)?.subjectId, ID);
  for (const field of [
    { role: "admin" }, { active: false }, { authenticated: false },
    { contract_version: "other-version" }, { subject_id: "not-uuid" },
    { expires_at: "2026-10-11T18:00:00Z" }
  ]) assert.equal(parseOwnerIdentity({ ...valid, ...field }, NOW), null);
  assert.equal(parseOwnerIdentity(null, NOW), null);
});

test("missing cookie token fails closed without any network call", async () => {
  let calls = 0;
  const requester = async () => { calls++; throw Error("should never call"); };
  assert.equal(await verifyOwnerSession(undefined, "https://api.curricula.live", true, requester, NOW), null);
  assert.equal(calls, 0);
});

test("API verification is server-only, no-store and uses credentials only as bearer header", async () => {
  let invoked = false;
  const requester = async (url: string, init: RequestInit) => {
    invoked = true;
    assert.equal(url, "https://api.curricula.live/v1/admin/auth/session/");
    assert.equal(init.method, "GET");
    assert.equal(init.cache, "no-store");
    assert.equal(init.redirect, "error");
    assert.equal((init.headers as Record<string, string>).Authorization, `Bearer ${TOKEN}`);
    return { ok: true, json: async () => valid };
  };
  const identity = await verifyOwnerSession(TOKEN, "https://api.curricula.live", true, requester, NOW);
  assert.equal(invoked, true);
  assert.equal(identity?.role, "owner");
});

test("revoked, unauthorized, failing and malformed API sessions all deny access", async () => {
  const cases = [
    async () => ({ ok: false, json: async () => valid }),
    async () => ({ ok: true, json: async () => ({ ...valid, role: "viewer" }) }),
    async () => { throw Error("network down"); },
    async () => ({ ok: true, json: async () => { throw Error("bad JSON"); } })
  ];
  for (const requester of cases)
    assert.equal(await verifyOwnerSession(TOKEN, "https://api.curricula.live", true, requester, NOW), null);
});
