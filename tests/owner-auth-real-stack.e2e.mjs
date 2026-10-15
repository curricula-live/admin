/**
 * Cross-repository, disposable end-to-end test:
 * real Next.js BFF -> real Django -> real PostgreSQL -> Django outbox worker
 * -> Django's filesystem email backend -> explicit browser-style POST.
 *
 * Synthetic identity and credentials only. Never contacts deployed services.
 */
import assert from "node:assert/strict";
import { spawn, execFileSync } from "node:child_process";
import { createServer as createHttpsServer } from "node:https";
import { request as httpRequest } from "node:http";
import { connect as tcpConnect } from "node:net";
import { readFileSync } from "node:fs";
import { mkdtemp, readdir, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { setTimeout as sleep } from "node:timers/promises";
import { startSmtpSink } from "./owner-auth-smtp-sink.mjs";

const TLS = process.env.OWNER_E2E_TRANSPORT === "https";
const MAIL_TRANSPORT = process.env.OWNER_E2E_MAIL_TRANSPORT || "file";
if (!["file", "smtp"].includes(MAIL_TRANSPORT)) throw Error("Unexpected isolated mail transport");
const SMTP = MAIL_TRANSPORT === "smtp";
const ADMIN = TLS ? "https://localhost:3443" : "http://localhost:3000";
const API = "http://127.0.0.1:8000";
const OWNER_EMAIL = "owner-e2e@example.invalid";
const COOKIE_NAME = "__Host-curricula_admin_session";
const apiDir = resolve(process.env.API_REPO_DIR || "api-integration");
const bffSecret = "disposable-fullstack-BFF-fixture-no-real-account-2026";
const hmacSecret = "disposable-fullstack-challenge-HMAC-fixture-2026";
const rateSecret = "disposable-fullstack-hashed-quota-fixture-2026";
let djangoProcess;
let nextProcess;
let tlsProxy;
let spool;
let smtpSink;
let logs = "";
const env = { ...process.env };

function die(message) { throw Error(message); }
function assertSafeHeaders(response) {
  assert.match(response.headers.get("cache-control") || "", /no-store/i);
  assert.equal(response.headers.get("referrer-policy"), "no-referrer");
}
function redirectedToLogin(response) {
  return [302, 303, 307, 308].includes(response.status) &&
    response.headers.get("location")?.includes("/login");
}

function db(sql) {
  // Fixed test-only SQL; NEVER interpolate user input or real credentials.
  return execFileSync("psql", [env.DATABASE_URL, "-X", "-q", "-t", "-A", "-v", "ON_ERROR_STOP=1", "-c", sql], {
    encoding: "utf8", env,
  }).trim();
}
function start(command, args, cwd, stage) {
  const proc = spawn(command, args, { cwd, env, stdio: ["ignore", "pipe", "pipe"] });
  for (const stream of [proc.stdout, proc.stderr]) {
    stream.on("data", part => {
      logs = (logs + "[" + stage + "] " + part.toString()).slice(-10000);
    });
  }
  return proc;
}
async function startTlsProxy() {
  const cert = process.env.OWNER_E2E_TLS_CERT;
  const key = process.env.OWNER_E2E_TLS_KEY;
  if (!cert || !key) die("Temporary TLS certificate and key required for HTTPS fixture");
  tlsProxy = createHttpsServer({
    cert: readFileSync(cert),
    key: readFileSync(key),
  }, (request, response) => {
    const upstream = httpRequest({
      hostname: "127.0.0.1",
      port: 3000,
      method: request.method,
      path: request.url,
      headers: { ...request.headers, host: "localhost:3000" },
    }, result => {
      response.writeHead(result.statusCode || 502, result.headers);
      result.pipe(response);
    });
    upstream.on("error", () => {
      if (!response.headersSent) response.writeHead(502);
      response.end();
    });
    request.pipe(upstream);
  });
  // Next dev's Turbopack/HMR client uses WebSocket upgrades. Tunnel those
  // only to the local Next test server so the page can hydrate over HTTPS.
  tlsProxy.on("upgrade", (request, client, head) => {
    const upstream = tcpConnect(3000, "127.0.0.1");
    upstream.once("connect", () => {
      const lines = [`${request.method} ${request.url} HTTP/1.1`];
      for (let i = 0; i < request.rawHeaders.length; i += 2) {
        const key = request.rawHeaders[i];
        const value = /^host$/i.test(key) ? "localhost:3000" : request.rawHeaders[i + 1];
        lines.push(`${key}: ${value}`);
      }
      upstream.write(lines.join("\r\n") + "\r\n\r\n");
      if (head.length) upstream.write(head);
      client.pipe(upstream);
      upstream.pipe(client);
    });
    upstream.on("error", () => client.destroy());
    client.on("error", () => upstream.destroy());
  });
  await new Promise((resolveReady, rejectReady) => {
    tlsProxy.once("error", rejectReady);
    tlsProxy.listen(3443, "127.0.0.1", resolveReady);
  });
}

async function run(command, args, cwd) {
  const proc = start(command, args, cwd, "worker");
  const exitCode = await new Promise((resolveExit, rejectExit) => {
    proc.once("error", rejectExit);
    proc.once("close", resolveExit);
  });
  if (exitCode !== 0) die("Isolated Django management command failed (exit " + exitCode + ")");
}
async function waitFor(url, proc) {
  for (let i = 0; i < 100; i++) {
    if (proc.exitCode !== null) die("Service exited before readiness: " + url);
    try {
      const response = await fetch(url, { signal: AbortSignal.timeout(750) });
      if (response.status < 500) return;
    } catch { /* Startup pending. */ }
    await sleep(450);
  }
  die("Isolated test service did not start: " + url);
}
async function call(path, method = "GET", body, headers = {}) {
  return fetch(ADMIN + path, {
    method, redirect: "manual", cache: "no-store",
    headers: {
      ...(body === undefined ? {} : { "Content-Type": "application/json" }),
      ...headers,
    },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
    signal: AbortSignal.timeout(15000),
  });
}
const origin = { Origin: ADMIN, "Sec-Fetch-Site": "same-origin" };
async function mailChallenge() {
  for (let i = 0; i < 40; i++) {
    const count = SMTP ? smtpSink.messages.length : (await readdir(spool)).length;
    if (count) {
      assert.equal(count, 1, "Exactly one owner email expected");
      let message;
      if (SMTP) {
        const sent = smtpSink.messages[0];
        assert.match(sent.sender, /^<no-reply@curricula\.live>(?:\s+size=\d+)?$/i);
        assert.deepEqual(sent.recipients, ["<owner-e2e@example.invalid>"]);
        message = sent.body;
      } else {
        const names = await readdir(spool);
        message = await readFile(join(spool, names[0]), "utf8");
      }
      assert.match(message, /To: owner-e2e@example\.invalid/i);
      const challenge = message.match(/#challenge=([A-Za-z0-9_-]{43})/);
      if (!challenge) die("Worker email did not contain a valid opaque challenge");
      return challenge[1];
    }
    await sleep(150);
  }
  die("Isolated mail transport did not capture an owner email");
}

async function scenario() {
  const anonymous = await call("/atlas");
  assert.ok(redirectedToLogin(anonymous), "Anonymous SSR route must be denied");
  if (process.env.OWNER_E2E_ATLAS_RELEASE) {
    const direct = await call("/api/atlas/concepts/c74fe051-ac5e-521b-8770-3180fb0decb6");
    assert.equal(direct.status, 401, "Direct concept inspector access requires owner session");
  }

  for (const headers of [{}, { Origin: "https://evil.example" }]) {
    const rejected = await call("/api/auth/request", "POST", { email: OWNER_EMAIL }, headers);
    assert.equal(rejected.status, 403, "Untrusted browser POST must be refused");
  }
  assert.equal(db("select count(*) from admin.owner_auth_rate_bucket"), "0");

  const unknown = await call("/api/auth/request", "POST", { email: "unknown@fixture.invalid" }, origin);
  const requested = await call("/api/auth/request", "POST", { email: OWNER_EMAIL }, origin);
  assert.equal(unknown.status, 202);
  assert.equal(requested.status, 202);
  assert.deepEqual(await unknown.json(), await requested.json());
  assertSafeHeaders(requested);
  assert.equal(db("select count(*) from admin.email_challenge"), "1");
  assert.equal(db("select count(*) from admin.owner_email_outbox"), "1");
  assert.equal(SMTP ? smtpSink.messages.length : (await readdir(spool)).length, 0,
    "HTTP request must not send email synchronously");

  const preview = await call("/login/verify");
  assert.equal(preview.status, 200);
  assert.equal(db("select count(*) from admin.owner_session"), "0", "GET never consumes a challenge");

  await run("uv", [
    "run", "python", "manage.py", "dispatch_owner_mail", "--limit", "1",
    "--confirm", "SEND-STAGING-OWNER-MAIL",
  ], apiDir);

  const challenge = await mailChallenge();
  assert.equal(db("select count(*) from admin.owner_email_outbox where delivered_at is not null"), "1");

  const notValid = await call("/api/auth/redeem", "POST", { challenge: "z".repeat(43) }, origin);
  assert.equal(notValid.status, 401);
  assert.equal(notValid.headers.has("set-cookie"), false);

  // The browser test verifies actual DOM interaction and cookie persistence;
  // HTTP-only contract checks remain in tests/owner-auth-http.e2e.mjs.
  const { chromium } = await import("playwright");
  const browser = await chromium.launch({ headless: true,
    ...(process.env.OWNER_E2E_CHROMIUM ? { executablePath: process.env.OWNER_E2E_CHROMIUM } : {}) });
  let context;
  let page;
  let session;
  try {
    context = await browser.newContext({
      // Disposable self-signed local CA; this does not assess public PKI trust.
      ignoreHTTPSErrors: TLS,
    });
    page = await context.newPage();
    const failures = [];
    page.on("requestfailed", request => {
      const target = new URL(request.url());
      failures.push(`request: ${target.origin}${target.pathname} -> ${request.failure()?.errorText || "unknown"}`);
    });
    page.on("pageerror", error => failures.push(`page: ${error.name}: ${error.message.slice(0, 160)}`));
    await page.goto(ADMIN + "/login/verify#challenge=" + challenge);
    try {
      await page.getByRole("button", { name: "Confirm sign-in" }).waitFor({ timeout: 12000 });
    } catch (error) {
      const state = await page.getByRole("status").allTextContents();
      const alerts = await page.getByRole("alert").allTextContents();
      const scripts = await page.locator("script[src]").evaluateAll(
        nodes => [...new Set(nodes.map(node => new URL(node.src).origin))]
      );
      throw Error("Verification page failed to hydrate (no challenge values logged): " +
        JSON.stringify({ state, alerts, scriptOrigins: scripts, failures: failures.slice(0, 12) }) +
        " / " + error.name);
    }
    assert.equal(new URL(page.url()).hash, "", "Token fragment must be erased after page load");
    assert.equal(db("select count(*) from admin.owner_session"), "0",
      "Loading the email link must not create a session");
    const redeemEvent = page.waitForResponse(r => r.url().endsWith("/api/auth/redeem") && r.request().method() === "POST");
    await page.getByRole("button", { name: "Confirm sign-in" }).click();
    const redeemResponse = await redeemEvent;
    assert.equal(redeemResponse.status(), 200, "Real browser POST must redeem the challenge");
    // Redirect navigation can dispose of the intercepted response body in Chromium.
    // The endpoint payload is already checked in the HTTP contract suite.
    await page.waitForURL("**/atlas");
    await page.getByRole("heading", { name: "Knowledge Atlas" }).waitFor();
    if (process.env.OWNER_E2E_ATLAS_RELEASE) {
      await page.getByRole("heading", { name: "Explore the knowledge index" }).waitFor();
      await page.getByRole("button", { name: /O \(\d+\)/ }).first().click();
      await page.getByRole("button", { name: /Operating System/ }).first().click();
      await page.getByRole("heading", { name: "Operating System", exact: true }).waitFor();
      assert.match(await page.locator(".atlas-main").innerText(), /Statements and relationships/);
      assert.match(await page.locator(".atlas-main").innerText(), /evidence missing/i);
      await page.getByLabel("Evidence state").selectOption("missing");
      await page.getByRole("button", { name: "Map" }).click();
      assert.ok(await page.getByLabel("Contextual typed graph").isVisible());
      const { default: AxeBuilder } = await import("@axe-core/playwright");
      const accessibility = await new AxeBuilder({ page }).withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa"]).analyze();
      assert.deepEqual(accessibility.violations.map(v => `${v.id}: ${v.nodes.length} affected nodes`), [],
        "Atlas should have no WCAG A/AA violations");
      await page.goBack();
      await page.getByRole("heading", { name: "O index" }).waitFor();
    }
    assert.equal(await page.evaluate(() =>
      document.cookie.includes("__Host-curricula_admin_session")), false,
      "Session bearer must never be readable from browser JavaScript");
    const cookies = await context.cookies();
    const ownerCookies = cookies.filter(c => c.name === COOKIE_NAME);
    assert.equal(ownerCookies.length, 1,
      "Chromium must persist exactly one secure host-only owner cookie");
    const stored = ownerCookies[0];
    assert.equal(stored.httpOnly, true);
    assert.equal(stored.secure, true);
    assert.equal(stored.sameSite, "Lax");
    assert.equal(stored.path, "/");
    assert.ok(stored.expires * 1000 > Date.now());
    session = stored.value;
    assert.notEqual(session, challenge);
    assert.ok(/^[A-Za-z0-9_-]{32,256}$/.test(session));
    assert.equal(db("select count(*) from admin.owner_session"), "1");
    assert.equal(db("select count(*) from admin.email_challenge where consumed_at is not null"), "1");

    const replay = await call("/api/auth/redeem", "POST", { challenge }, origin);
    assert.equal(replay.status, 401);
    assert.equal(replay.headers.has("set-cookie"), false);

    const cookie = { Cookie: COOKIE_NAME + "=" + session };
    const allowed = await call("/atlas", "GET", undefined, cookie);
    assert.equal(allowed.status, 200);
    assert.match(await allowed.text(), /Knowledge Atlas/);
    if (process.env.OWNER_E2E_ATLAS_RELEASE) {
      const publicKnowledge = await fetch(API + "/v2/concepts/?q=operating-system");
      assert.equal(publicKnowledge.status, 200, "Published knowledge must remain anonymous");
      const payload = await publicKnowledge.json();
      assert.equal(payload.results[0].id, "c74fe051-ac5e-521b-8770-3180fb0decb6");
    }

    db("update admin.owner_principal set active=false,disabled_at=now() where email='owner-e2e@example.invalid'");
    const inactive = await call("/atlas", "GET", undefined, cookie);
    assert.ok(redirectedToLogin(inactive), "Persisted owner deactivation must revoke authorization");
    db("update admin.owner_principal set active=true,disabled_at=null where email='owner-e2e@example.invalid'");

    const logoutEvent = page.waitForResponse(r => r.url().endsWith("/api/auth/logout") && r.request().method() === "POST");
    await page.getByRole("button", { name: "Sign out" }).click();
    const logoutResponse = await logoutEvent;
    assert.equal(logoutResponse.status(), 204);
    await page.waitForURL("**/login");
    assert.equal((await context.cookies()).filter(c => c.name === COOKIE_NAME).length, 0,
      "Logout must erase the browser's session cookie");
    assert.equal(db("select count(*) from admin.owner_session where revoked_at is not null"), "1");
    const denied = await call("/atlas", "GET", undefined, cookie);
    assert.ok(redirectedToLogin(denied), "Revoked session must not authorize Atlas");
    if (process.env.OWNER_E2E_ATLAS_RELEASE) {
      const direct = await call("/api/atlas/concepts/c74fe051-ac5e-521b-8770-3180fb0decb6", "GET", undefined, cookie);
      assert.equal(direct.status, 401, "Revoked owner session must not read inspector BFF");
    }
    await page.goto(ADMIN + "/atlas");
    await page.waitForURL("**/login");
  } finally {
    await context?.close();
    await browser.close();
  }
  console.log(`PASS: ${TLS ? "TLS browser" : "HTTP browser"} + isolated ${MAIL_TRANSPORT} delivery -> Next.js -> Django -> PostgreSQL`);

}
try {
  if (!env.DATABASE_URL || !env.DJANGO_SECRET_KEY) die("Disposable CI database variables required");
  if (SMTP) smtpSink = await startSmtpSink();
  else spool = await mkdtemp(join(tmpdir(), "curricula-e2e-mail-"));
  Object.assign(env, {
    APP_ENV: "staging",
    DJANGO_DEBUG: "false",
    DJANGO_ALLOWED_HOSTS: "127.0.0.1,localhost",
    DJANGO_EMAIL_BACKEND: SMTP
      ? "django.core.mail.backends.smtp.EmailBackend"
      : "django.core.mail.backends.filebased.EmailBackend",
    DJANGO_EMAIL_FILE_PATH: spool || "",
    DJANGO_EMAIL_HOST: "127.0.0.1",
    DJANGO_EMAIL_PORT: "1025",
    OWNER_AUTH_ENABLED: "true",
    OWNER_AUTH_HTTP_ENABLED: "true",
    OWNER_ASYNC_MAIL_ENABLED: "true",
    OWNER_EMAIL_WORKER_ENABLED: "true",
    OWNER_BFF_SHARED_SECRET: bffSecret,
    OWNER_LOGIN_SENDER: "no-reply@curricula.live",
    OWNER_LOGIN_LINK_BASE: ADMIN + "/login/verify",
    OWNER_RATE_LIMIT_KEY: rateSecret,
    OWNER_EMAIL_TOKEN_KEY: hmacSecret,
    ADMIN_OWNER_LOGIN_ENABLED: "true",
    ADMIN_OWNER_PREVIEW_ENABLED: "true",
    ADMIN_PUBLIC_ORIGIN: ADMIN,
    CURRICULA_API_ORIGIN: API,
    NEXT_TELEMETRY_DISABLED: "1",
  });
  if (db("select count(*) from admin.owner_principal where email='owner-e2e@example.invalid'") !== "1") {
    die("Expected disposable synthetic owner principal missing");
  }
  djangoProcess = start("uv", [
    "run", "python", "manage.py", "runserver", "--noreload", "127.0.0.1:8000"
  ], apiDir, "django");
  await waitFor(API + "/v1/admin/auth/session/", djangoProcess);
  nextProcess = start(process.execPath, [
    resolve("node_modules/next/dist/bin/next"), "dev", "-H", "127.0.0.1", "-p", "3000"
  ], process.cwd(), "next");
  await waitFor("http://127.0.0.1:3000/login", nextProcess);
  if (TLS) await startTlsProxy();
  await waitFor(ADMIN + "/login", nextProcess);
  await scenario();
} catch (error) {
  console.error("Cross-repository owner login integration failed:", error);
  console.error("Service tail:", logs.slice(-3500));
  process.exitCode = 1;
} finally {
  for (const proc of [nextProcess, djangoProcess]) {
    if (!proc || proc.exitCode !== null) continue;
    proc.kill("SIGTERM");
    await Promise.race([
      new Promise(done => proc.once("exit", done)),
      sleep(2500),
    ]);
    if (proc.exitCode === null) proc.kill("SIGKILL");
  }
  if (tlsProxy) await new Promise(resolveClose => tlsProxy.close(resolveClose));
  if (smtpSink) await smtpSink.close();
  if (spool) await rm(spool, { recursive: true, force: true });
}
