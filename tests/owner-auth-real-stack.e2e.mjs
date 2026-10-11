/**
 * Cross-repository, disposable end-to-end test:
 * real Next.js BFF -> real Django -> real PostgreSQL -> Django outbox worker
 * -> Django's filesystem email backend -> explicit browser-style POST.
 *
 * Synthetic identity and credentials only. Never contacts deployed services.
 */
import assert from "node:assert/strict";
import { spawn, execFileSync } from "node:child_process";
import { mkdtemp, readdir, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { setTimeout as sleep } from "node:timers/promises";

const ADMIN = "http://127.0.0.1:3000";
const API = "http://127.0.0.1:8000";
const OWNER_EMAIL = "owner-e2e@example.invalid";
const COOKIE_NAME = "__Host-curricula_admin_session";
const apiDir = resolve(process.env.API_REPO_DIR || "api-integration");
const dataDir = resolve(process.env.DATA_REPO_DIR || "data-integration");
const bffSecret = "disposable-fullstack-BFF-fixture-no-real-account-2026";
const hmacSecret = "disposable-fullstack-challenge-HMAC-fixture-2026";
const rateSecret = "disposable-fullstack-hashed-quota-fixture-2026";
let djangoProcess;
let nextProcess;
let spool;
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
    const names = await readdir(spool);
    if (names.length) {
      assert.equal(names.length, 1, "Exactly one message expected");
      const message = await readFile(join(spool, names[0]), "utf8");
      assert.match(message, /To: owner-e2e@example\.invalid/i);
      const challenge = message.match(/#challenge=([A-Za-z0-9_-]{43})/);
      if (!challenge) die("Worker email did not contain a valid opaque challenge");
      return challenge[1];
    }
    await sleep(150);
  }
  die("Worker did not create an isolated filesystem email");
}

async function scenario() {
  const anonymous = await call("/atlas");
  assert.ok(redirectedToLogin(anonymous), "Anonymous SSR route must be denied");

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
  assert.equal((await readdir(spool)).length, 0, "HTTP request must not send email synchronously");

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

  const redeemed = await call("/api/auth/redeem", "POST", { challenge }, origin);
  assert.equal(redeemed.status, 200);
  assertSafeHeaders(redeemed);
  assert.deepEqual(await redeemed.json(), { authenticated: true });
  const header = redeemed.headers.get("set-cookie") || "";
  assert.match(header, /^__Host-curricula_admin_session=[A-Za-z0-9_-]+;/);
  assert.match(header, /;\s*Secure/i);
  assert.match(header, /;\s*HttpOnly/i);
  assert.match(header, /;\s*SameSite=Lax/i);
  assert.match(header, /;\s*Path=\//i);
  assert.doesNotMatch(header, /;\s*Domain=/i);
  const session = header.split("=")[1].split(";")[0];
  assert.notEqual(session, challenge);
  assert.equal(db("select count(*) from admin.owner_session"), "1");
  assert.equal(db("select count(*) from admin.email_challenge where consumed_at is not null"), "1");

  const replay = await call("/api/auth/redeem", "POST", { challenge }, origin);
  assert.equal(replay.status, 401);
  assert.equal(replay.headers.has("set-cookie"), false);

  const cookie = { Cookie: COOKIE_NAME + "=" + session };
  const allowed = await call("/atlas", "GET", undefined, cookie);
  assert.equal(allowed.status, 200);
  assert.match(await allowed.text(), /Knowledge Atlas/);

  db("update admin.owner_principal set active=false,disabled_at=now() where email='owner-e2e@example.invalid'");
  const inactive = await call("/atlas", "GET", undefined, cookie);
  assert.ok(redirectedToLogin(inactive), "Persisted owner deactivation must revoke authorization");
  db("update admin.owner_principal set active=true,disabled_at=null where email='owner-e2e@example.invalid'");

  const logout = await call("/api/auth/logout", "POST", undefined, { ...origin, ...cookie });
  assert.equal(logout.status, 204);
  const cleared = logout.headers.get("set-cookie") || "";
  assert.match(cleared, /^__Host-curricula_admin_session=/);
  assert.match(cleared, /;\s*Secure/i);
  assert.match(cleared, /;\s*HttpOnly/i);
  assert.match(cleared, /(?:Expires=Thu, 01 Jan 1970|Max-Age=0)/i);
  assert.equal(db("select count(*) from admin.owner_session where revoked_at is not null"), "1");
  const denied = await call("/atlas", "GET", undefined, cookie);
  assert.ok(redirectedToLogin(denied), "Revoked database session must not authorize Atlas");
  console.log("PASS: real Next.js -> Django -> PostgreSQL -> mail worker -> cookie -> logout");
}
try {
  if (!env.DATABASE_URL || !env.DJANGO_SECRET_KEY) die("Disposable CI database variables required");
  spool = await mkdtemp(join(tmpdir(), "curricula-e2e-mail-"));
  Object.assign(env, {
    APP_ENV: "staging",
    DJANGO_DEBUG: "false",
    DJANGO_ALLOWED_HOSTS: "127.0.0.1,localhost",
    DJANGO_EMAIL_BACKEND: "django.core.mail.backends.filebased.EmailBackend",
    DJANGO_EMAIL_FILE_PATH: spool,
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
  if (spool) await rm(spool, { recursive: true, force: true });
}
