import assert from "node:assert/strict";
import test from "node:test";
import {
  MAX_JSON_BYTES, ownerAuthApiUrl, ownerAuthConfig, parseIssuedOwnerSession,
  readBoundedJson, safeEmail, safeOpaqueToken, trustedBrowserPost
} from "../lib/server/owner-auth-policy.ts";

const base = {
  APP_ENV: "staging",
  ADMIN_OWNER_LOGIN_ENABLED: "true",
  CURRICULA_API_ORIGIN: "https://api.curricula.live",
  ADMIN_PUBLIC_ORIGIN: "https://admin.curricula.live",
  OWNER_BFF_SHARED_SECRET: "a".repeat(48)
};
const cfg = ownerAuthConfig(base)!;

test("owner login is opt-in and cannot be activated in production", () => {
  assert.equal(ownerAuthConfig({ ...base, APP_ENV: "production" }), null);
  assert.equal(ownerAuthConfig({ ...base, ADMIN_OWNER_LOGIN_ENABLED: "false" }), null);
  assert.equal(ownerAuthConfig({ ...base, OWNER_BFF_SHARED_SECRET: "short" }), null);
  assert.equal(ownerAuthConfig({ ...base, ADMIN_PUBLIC_ORIGIN: undefined }), null);
});

test("both API and browser origins are strict allowlists", () => {
  for (const url of ["https://evil.example", "https://api.curricula.live.evil.example",
    "https://username:secret@api.curricula.live", "https://api.curricula.live/other",
    "https://api.curricula.live:8443", "http://api.curricula.live"]) {
    assert.equal(ownerAuthConfig({ ...base, CURRICULA_API_ORIGIN: url }), null);
  }
  for (const url of ["https://evil.example", "https://admin.curricula.live.evil.com",
    "https://admin.curricula.live:8443", "http://admin.curricula.live"]) {
    assert.equal(ownerAuthConfig({ ...base, ADMIN_PUBLIC_ORIGIN: url }), null);
  }
  assert.equal(ownerAuthConfig({ ...base, APP_ENV: "staging",
    CURRICULA_API_ORIGIN: "http://localhost:8000" }), null);
  assert.ok(ownerAuthConfig({ ...base, APP_ENV: "development",
    CURRICULA_API_ORIGIN: "http://127.0.0.1:8000",
    ADMIN_PUBLIC_ORIGIN: "http://localhost:3000" }));
  assert.equal(ownerAuthApiUrl(cfg, "request"), "https://api.curricula.live/v1/admin/auth/request/");
  assert.equal(ownerAuthApiUrl(cfg, "redeem"), "https://api.curricula.live/v1/admin/auth/redeem/");
  assert.equal(ownerAuthApiUrl(cfg, "logout"), "https://api.curricula.live/v1/admin/auth/logout/");
});

test("cross-origin and missing-Origin POST requests fail closed", () => {
  const headers = { Origin: "https://admin.curricula.live", "Sec-Fetch-Site": "same-origin" };
  assert.equal(trustedBrowserPost(new Request("https://admin.curricula.live/api/owner-auth/redeem",
    { method: "POST", headers }), cfg), true);
  for (const candidate of [undefined, "https://evil.example", "https://admin.curricula.live.evil.com"]) {
    const unsafe = candidate ? { Origin: candidate } : {};
    assert.equal(trustedBrowserPost(new Request("https://admin.curricula.live",
      { method: "POST", headers: unsafe }), cfg), false);
  }
  assert.equal(trustedBrowserPost(new Request("https://admin.curricula.live", {
    method: "POST", headers: { ...headers, "Sec-Fetch-Site": "cross-site" }
  }), cfg), false);
  assert.equal(trustedBrowserPost(new Request("https://admin.curricula.live",
    { headers }), cfg), false);
});

test("JSON bodies are streamed, restricted to objects and capped at 2048 bytes", async () => {
  const request = (value: string, type = "application/json") => new Request(
    "https://admin.curricula.live/api/owner-auth/request",
    { method: "POST", headers: { "Content-Type": type }, body: value }
  );
  assert.deepEqual(await readBoundedJson(request('{"email":"owner@example.org"}')),
    { email: "owner@example.org" });
  assert.equal(await readBoundedJson(request("[]")), null);
  assert.equal(await readBoundedJson(request("not-json")), null);
  assert.equal(await readBoundedJson(request('{"x":"a"}', "text/plain")), null);
  assert.equal(await readBoundedJson(request('{"x":"' + "a".repeat(MAX_JSON_BYTES) + '"}')), null);
});

test("only bounded opaque bearer strings and time-limited sessions are accepted", () => {
  const now = new Date("2026-10-12T00:00:00Z");
  const value = { session_token: "b".repeat(48), expires_at: "2026-10-12T08:00:00Z" };
  assert.equal(parseIssuedOwnerSession(value, now)?.maxAge, 28800);
  assert.equal(safeOpaqueToken(value.session_token), true);
  assert.equal(safeOpaqueToken("short"), false);
  assert.equal(parseIssuedOwnerSession({ ...value, session_token: "a b" }, now), null);
  assert.equal(parseIssuedOwnerSession({ ...value, expires_at: "2026-10-13T00:00:00Z" }, now), null);
  assert.equal(parseIssuedOwnerSession({ ...value, expires_at: "2026-10-11T00:00:00Z" }, now), null);
  assert.equal(safeEmail(" Owner@Example.org "), "owner@example.org");
  assert.equal(safeEmail("bad address"), null);
});
