"use client";

import { useState, type FormEvent } from "react";

type State = "idle" | "sending" | "sent" | "error";

export default function OwnerLoginForm() {
  const [email, setEmail] = useState("");
  const [state, setState] = useState<State>("idle");

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (state === "sending") return;
    setState("sending");
    try {
      const response = await fetch("/api/auth/request", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "same-origin",
        cache: "no-store",
        body: JSON.stringify({ email }),
      });
      setState(response.status === 202 ? "sent" : "error");
    } catch {
      setState("error");
    }
  }

  return (
    <main className="page">
      <section className="panel" aria-labelledby="login-title">
        <span className="eyebrow">curricula.live / owner access</span>
        <h1 id="login-title">Sign in to administration</h1>
        <p>Enter the email address assigned to the platform owner.</p>
        <form onSubmit={submit} className="auth-form">
          <label htmlFor="owner-email">Email address</label>
          <input
            id="owner-email"
            type="email"
            autoComplete="email"
            value={email}
            onChange={(event) => setEmail(event.target.value)}
            required
            maxLength={320}
            disabled={state === "sending"}
          />
          <button type="submit" disabled={state === "sending"}>
            {state === "sending" ? "Requesting link…" : "Email me a sign-in link"}
          </button>
        </form>
        <p className="secondary" role="status" aria-live="polite">
          {state === "sent"
            ? "If this address is eligible, a sign-in link will arrive shortly."
            : state === "error"
              ? "Sign-in requests are temporarily unavailable."
              : "Only authorized owner access is supported."}
        </p>
      </section>
    </main>
  );
}
