import assert from "node:assert/strict";
import test from "node:test";
import {
  authBackendEndpoint, configuredAdminOrigin, isValidChallenge,
  parseIssuedSession, validBrowserPost
} from "../lib/server/owner-auth-bff-contract.ts";

const ADMIN = "https://admin.curricula.live";
const API = "https://api.curricula.live";
const NOW = new Date("2026-10-12T10:00:00Z");

test("only exact admin host or explicitly allowed loopback can receive browser posts", () => {
  assert.equal(configuredAdminOrigin(ADMIN, true), ADMIN);
  assert.equal(configuredAdminOrigin("http://localhost:3000", false), "http://localhost:3000");
  assert.equal(configuredAdminOrigin("http://localhost:3000", true), null);
  for (const bad of [
    "https://admin.curricula.live.evil.com",
    "https://admin.curricula.live/path",
    "https://admin.curricula.live?next=https://evil.com",
    "https://user:pass@admin.curricula.live",
    "http://admin.curricula.live",
    undefined,
  ]) assert.equal(configuredAdminOrigin(bad, true), null);
});

test("Origin is required and cross-site fetch metadata is rejected", () => {
  assert.equal(validBrowserPost(ADMIN, "same-origin", ADMIN, true), true);
  assert.equal(validBrowserPost(ADMIN, null, ADMIN, true), true);
  assert.equal(validBrowserPost(null, "same-origin", ADMIN, true), false);
  assert.equal(validBrowserPost(ADMIN, "cross-site", ADMIN, true), false);
  assert.equal(validBrowserPost("https://evil.com", null, ADMIN, true), false);
});

test("BFF only constructs fixed Django endpoint paths on allowlisted origin", () => {
  assert.equal(
    authBackendEndpoint(API, true, "request"),
    "https://api.curricula.live/v1/admin/auth/request/"
  );
  assert.equal(
    authBackendEndpoint(API, true, "redeem"),
    "https://api.curricula.live/v1/admin/auth/redeem/"
  );
  assert.equal(
    authBackendEndpoint(API, true, "logout"),
    "https://api.curricula.live/v1/admin/auth/logout/"
  );
  assert.equal(authBackendEndpoint("https://evil.com", true, "request"), null);
  assert.equal(authBackendEndpoint("http://localhost:8000", true, "request"), null);
});

test("only bounded opaque session credentials and time-limited expiry are accepted", () => {
  const good = {
    session_token: "a".repeat(43),
    expires_at: new Date(NOW.getTime() + 60 * 60 * 1000).toISOString()
  };
  const session = parseIssuedSession(good, NOW);
  assert.equal(session?.token, good.session_token);
  assert.equal(session?.expiresAt.toISOString(), good.expires_at);
  for (const bad of [
    { ...good, session_token: "too short" },
    { ...good, session_token: "a".repeat(300) },
    { ...good, expires_at: NOW.toISOString() },
    { ...good, expires_at: new Date(NOW.getTime() + 9 * 60 * 60 * 1000).toISOString() },
    { ...good, expires_at: "invalid" },
    { ...good, expires_at: 17 },
    null,
  ]) assert.equal(parseIssuedSession(bad, NOW), null);
});

test("magic-link challenge is syntactically constrained before proxying", () => {
  assert.equal(isValidChallenge("A".repeat(43)), true);
  assert.equal(isValidChallenge("short"), false);
  assert.equal(isValidChallenge("a".repeat(43) + "?redirect=/evil"), false);
  assert.equal(isValidChallenge(null), false);
});
