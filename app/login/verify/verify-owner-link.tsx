"use client";

import { useEffect, useState } from "react";

type Status = "loading" | "ready" | "submitting" | "failed" | "missing";

export default function VerifyOwnerLink() {
  const [challenge, setChallenge] = useState<string | null>(null);
  const [status, setStatus] = useState<Status>("loading");

  useEffect(() => {
    // The token is in the fragment, never in HTTP request URLs or SSR logs.
    const params = new URLSearchParams(window.location.hash.slice(1));
    const token = params.get("challenge");
    // Remove it promptly from browser history and address bar.
    window.history.replaceState(null, "", window.location.pathname);
    if (token && /^[A-Za-z0-9_-]{32,256}$/.test(token)) {
      setChallenge(token);
      setStatus("ready");
    } else {
      setStatus("missing");
    }
  }, []);

  async function confirm() {
    if (status !== "ready" || !challenge) return;
    setStatus("submitting");
    try {
      const response = await fetch("/api/auth/redeem", {
        method: "POST",
        credentials: "same-origin",
        cache: "no-store",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ challenge }),
      });
      setChallenge(null); // Do not retain the used challenge in React state.
      if (response.ok) {
        window.location.replace("/atlas");
        return;
      }
      setStatus("failed");
    } catch {
      setChallenge(null);
      setStatus("failed");
    }
  }

  return (
    <main className="page">
      <section className="panel" aria-labelledby="verify-title">
        <span className="eyebrow">curricula.live / secure sign-in</span>
        <h1 id="verify-title">Confirm owner sign-in</h1>
        <p>This link can be used only once and expires shortly after issuance.</p>
        {status === "ready" && (
          <button type="button" onClick={confirm}>Confirm sign-in</button>
        )}
        {status === "submitting" && <p role="status">Verifying your link…</p>}
        {status === "loading" && <p role="status">Reading sign-in link…</p>}
        {status === "missing" && (
          <p role="alert">No valid sign-in challenge was found in this link.</p>
        )}
        {status === "failed" && (
          <p role="alert">The link could not be verified. It may be expired or already used.</p>
        )}
        <a href="/login">Return to sign in</a>
      </section>
    </main>
  );
}
