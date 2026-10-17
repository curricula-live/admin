/**
 * Real Next.js HTTP integration against a local, in-memory Django-contract stub.
 * No database, SMTP, external network, real credentials or deployed hostname.
 * Checks Set-Cookie, BFF origin checks, API attestations and SSR authorization.
 */
import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { createServer } from "node:http";
import { resolve } from "node:path";
import { setTimeout as sleep } from "node:timers/promises";

const ADMIN = "http://127.0.0.1:3000";
const API_HOST = "127.0.0.1";
const API_PORT = 8000;
const BFF_SECRET = "isolated-http-e2e-fake-bff-secret-over-32-characters";
const CHALLENGE = "c".repeat(43);
const OTHER_CHALLENGE = "d".repeat(43);
const OWNER = "c74fe051-ac5e-521b-8770-3180fb0decb6";
const SESSION_COOKIE = "__Host-curricula_admin_session";
const counters = { request: 0, redeem: 0, session: 0, logout: 0 };
const consumed = new Set();
const activeTokens = new Set();
let ownerActive = true;
let serial = 0;
let nextProcess;
let tail = "";

function json(response, status, body) {
  response.writeHead(status, {
    "Content-Type": "application/json",
    "Cache-Control": "no-store",
  });
  response.end(JSON.stringify(body));
}

async function stubRequest(request, response) {
  const path = new URL(request.url, "http://127.0.0.1:8000").pathname;
  let body = "";
  for await (const part of request) {
    body += part.toString("utf8");
    if (body.length > 4096) return json(response, 413, { error: "too large" });
  }
  if (path !== "/v1/admin/auth/session/" &&
      request.headers["x-admin-bff-secret"] !== BFF_SECRET) {
    return json(response, 403, { error: "forbidden" });
  }
  if (path === "/v1/admin/auth/request/" && request.method === "POST") {
    counters.request++;
    return json(response, 202, { message: "neutral" });
  }
  if (path === "/v1/admin/auth/redeem/" && request.method === "POST") {
    counters.redeem++;
    let value;
    try { value = JSON.parse(body); } catch { return json(response, 400, {}); }
    if (!([CHALLENGE, OTHER_CHALLENGE].includes(value?.challenge)) ||
        consumed.has(value.challenge)) {
      return json(response, 401, { error: "invalid" });
    }
    consumed.add(value.challenge);
    serial++;
    const token = "s".repeat(42) + String(serial);
    activeTokens.add(token);
    return json(response, 200, {
      session_token: token,
      expires_at: new Date(Date.now() + 60 * 60 * 1000).toISOString(),
    });
  }
  if (path === "/v1/admin/auth/session/" && request.method === "GET") {
    counters.session++;
    const raw = request.headers.authorization || "";
    const token = raw.startsWith("Bearer ") ? raw.slice(7) : "";
    if (!ownerActive || !activeTokens.has(token)) return json(response, 401, {});
    return json(response, 200, {
      contract_version: "owner-session@1",
      authenticated: true,
      active: true,
      role: "owner",
      subject_id: OWNER,
      expires_at: new Date(Date.now() + 30 * 60 * 1000).toISOString(),
    });
  }
  if (path === "/v1/admin/auth/logout/" && request.method === "POST") {
    counters.logout++;
    const token = (request.headers.authorization || "").replace(/^Bearer /, "");
    activeTokens.delete(token);
    response.writeHead(204, { "Cache-Control": "no-store" });
    return response.end();
  }
  return json(response, 404, { error: "not found" });
}

async function adminRequest(path, method = "GET", body, headers = {}) {
  return fetch(ADMIN + path, {
    method,
    headers: {
      ...(body === undefined ? {} : { "Content-Type": "application/json" }),
      ...headers,
    },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
    redirect: "manual",
    cache: "no-store",
    signal: AbortSignal.timeout(20_000),
  });
}

function isRedirectToLogin(response) {
  return [302, 303, 307, 308].includes(response.status) &&
    response.headers.get("location")?.includes("/login") === true;
}

async function assertNoStore(response) {
  assert.match(response.headers.get("cache-control") || "", /no-store/i);
  assert.equal(response.headers.get("referrer-policy"), "no-referrer");
}

async function waitForAdmin() {
  for (let i = 0; i < 120; i++) {
    if (nextProcess.exitCode !== null) throw Error("Next.js exited: " + tail.slice(-3500));
    try {
      const response = await fetch(ADMIN + "/login", { signal: AbortSignal.timeout(1000) });
      if (response.ok) return;
    } catch { /* Not listening yet. */ }
    await sleep(500);
  }
  throw Error("Next.js dev HTTP server did not start: " + tail.slice(-3500));
}

async function runScenarios() {
  const sameOrigin = { Origin: ADMIN, "Sec-Fetch-Site": "same-origin" };

  const withoutSession = await adminRequest("/atlas");
  assert.equal(isRedirectToLogin(withoutSession), true, "Atlas must deny anonymous requests");

  const missingOrigin = await adminRequest(
    "/api/auth/request", "POST", { email: "owner@fixture.invalid" }
  );
  assert.equal(missingOrigin.status, 403);
  const crossSite = await adminRequest(
    "/api/auth/request", "POST", { email: "owner@fixture.invalid" },
    { Origin: "https://evil.example", "Sec-Fetch-Site": "cross-site" }
  );
  assert.equal(crossSite.status, 403);
  assert.equal(counters.request, 0, "Denied browser requests must never reach Django");

  const known = await adminRequest(
    "/api/auth/request", "POST", { email: "owner@fixture.invalid" }, sameOrigin
  );
  const unknown = await adminRequest(
    "/api/auth/request", "POST", { email: "unknown@fixture.invalid" }, sameOrigin
  );
  assert.equal(known.status, 202);
  assert.equal(unknown.status, 202);
  assert.deepEqual(await known.json(), await unknown.json());
  await assertNoStore(known);
  assert.equal(counters.request, 2);

  const oversized = await adminRequest(
    "/api/auth/request", "POST", { email: "a".repeat(2200) }, sameOrigin
  );
  assert.equal(oversized.status, 400);
  assert.equal(counters.request, 2, "Rejected payload must not be proxied");

  const beforeLink = counters.redeem;
  const preview = await adminRequest("/login/verify");
  assert.equal(preview.status, 200);
  assert.equal(counters.redeem, beforeLink, "GET must never redeem a magic link");

  const malformed = await adminRequest(
    "/api/auth/redeem", "POST", { challenge: "unsafe token" }, sameOrigin
  );
  assert.equal(malformed.status, 400);
  assert.equal(counters.redeem, beforeLink);

  const rejected = await adminRequest(
    "/api/auth/redeem", "POST", { challenge: "z".repeat(43) }, sameOrigin
  );
  assert.equal(rejected.status, 401);
  assert.equal(rejected.headers.has("set-cookie"), false);

  const redeemed = await adminRequest(
    "/api/auth/redeem", "POST", { challenge: CHALLENGE }, sameOrigin
  );
  assert.equal(redeemed.status, 200);
  await assertNoStore(redeemed);
  assert.deepEqual(await redeemed.json(), { authenticated: true });
  const cookie = redeemed.headers.get("set-cookie") || "";
  assert.match(cookie, /^__Host-curricula_admin_session=s{42}1;/);
  assert.match(cookie, /;\s*HttpOnly/i);
  assert.match(cookie, /;\s*Secure/i);
  assert.match(cookie, /;\s*SameSite=Lax/i);
  assert.match(cookie, /;\s*Path=\//i);
  assert.match(cookie, /;\s*Expires=/i);
  assert.doesNotMatch(cookie, /;\s*Domain=/i);
  const sessionToken = cookie.split("=")[1]?.split(";")[0];
  assert.equal(sessionToken, "s".repeat(42) + "1");
  assert.equal(cookie.includes(BFF_SECRET), false, "BFF shared secret may not leak");
  const cookieHeader = SESSION_COOKIE + "=" + sessionToken;

  const replay = await adminRequest(
    "/api/auth/redeem", "POST", { challenge: CHALLENGE }, sameOrigin
  );
  assert.equal(replay.status, 401);
  assert.equal(replay.headers.has("set-cookie"), false);

  const forgedCookie = await adminRequest("/atlas", "GET", undefined, {
    Cookie: SESSION_COOKIE + "=" + "f".repeat(43),
  });
  assert.equal(isRedirectToLogin(forgedCookie), true);
  const protectedPage = await adminRequest("/atlas", "GET", undefined, {
    Cookie: cookieHeader,
  });
  assert.equal(protectedPage.status, 200);
  assert.match(await protectedPage.text(), /Knowledge Atlas/);

  const invalidLogout = await adminRequest(
    "/api/auth/logout", "POST", undefined,
    { Cookie: cookieHeader, Origin: "https://evil.example" }
  );
  assert.equal(invalidLogout.status, 403);
  assert.equal(counters.logout, 0);

  const logout = await adminRequest(
    "/api/auth/logout", "POST", undefined, { Cookie: cookieHeader, ...sameOrigin }
  );
  assert.equal(logout.status, 204);
  const cleared = logout.headers.get("set-cookie") || "";
  assert.match(cleared, /__Host-curricula_admin_session=/);
  assert.match(cleared, /;\s*HttpOnly/i);
  assert.match(cleared, /;\s*Secure/i);
  assert.doesNotMatch(cleared, /;\s*Domain=/i);
  assert.match(cleared, /(?:Expires=Thu, 01 Jan 1970|Max-Age=0)/i);
  assert.equal(counters.logout, 1);
  const afterLogout = await adminRequest("/atlas", "GET", undefined, { Cookie: cookieHeader });
  assert.equal(isRedirectToLogin(afterLogout), true, "Revoked session cannot reopen Atlas");

  ownerActive = false;
  const deniedAttestation = await adminRequest(
    "/api/auth/redeem", "POST", { challenge: OTHER_CHALLENGE }, sameOrigin
  );
  assert.equal(deniedAttestation.status, 503);
  assert.equal(deniedAttestation.headers.has("set-cookie"), false);
  assert.equal(counters.logout, 2, "Unverified newly minted session must be revoked");

  console.log("PASS: owner HTTP integration — BFF Origin, POST-only link, replay,");
  console.log("      server attestation, host-only cookie, SSR guard, revoke and logout.");
}

const backend = createServer((req, res) => {
  stubRequest(req, res).catch(() => json(res, 500, { error: "test stub failure" }));
});

try {
  await new Promise((resolveReady, rejectReady) => {
    backend.once("error", rejectReady);
    backend.listen(API_PORT, API_HOST, resolveReady);
  });
  const env = {
    ...process.env,
    APP_ENV: "staging",
    ADMIN_OWNER_LOGIN_ENABLED: "true",
    ADMIN_OWNER_PREVIEW_ENABLED: "true",
    ADMIN_PUBLIC_ORIGIN: ADMIN,
    CURRICULA_API_ORIGIN: "http://127.0.0.1:8000",
    OWNER_BFF_SHARED_SECRET: BFF_SECRET,
    NEXT_TELEMETRY_DISABLED: "1",
  };
  // next dev, not next start: the production hostname allowlist intentionally
  // rejects loopback when NODE_ENV=production.
  nextProcess = spawn(process.execPath, [
    resolve("node_modules/next/dist/bin/next"), "dev", "-H", "127.0.0.1", "-p", "3000",
  ], { cwd: process.cwd(), env, stdio: ["ignore", "pipe", "pipe"] });
  for (const stream of [nextProcess.stdout, nextProcess.stderr]) {
    stream.on("data", part => {
      tail = (tail + part.toString()).slice(-12_000);
    });
  }
  await waitForAdmin();
  await runScenarios();
} catch (error) {
  console.error("Owner HTTP integration failed:", error);
  console.error("Next.js output:", tail.slice(-5000));
  process.exitCode = 1;
} finally {
  if (nextProcess && nextProcess.exitCode === null) {
    nextProcess.kill("SIGTERM");
    await Promise.race([
      new Promise(resolveExit => nextProcess.once("exit", resolveExit)),
      sleep(4000),
    ]);
    if (nextProcess.exitCode === null) nextProcess.kill("SIGKILL");
  }
  await new Promise(resolveClose => backend.close(resolveClose));
}
