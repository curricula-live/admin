"use client";

import { useState } from "react";

export default function OwnerLogoutButton() {
  const [status, setStatus] = useState<"idle" | "logging-out" | "error">("idle");

  async function logout() {
    if (status === "logging-out") return;
    setStatus("logging-out");
    try {
      const response = await fetch("/api/auth/logout", {
        method: "POST",
        cache: "no-store",
        credentials: "same-origin",
      });
      if (response.status === 204) {
        window.location.replace("/login");
        return;
      }
    } catch {
      // Keep a visible warning if server revocation could not be confirmed.
    }
    setStatus("error");
  }

  return (
    <div>
      <button type="button" onClick={logout} disabled={status === "logging-out"}>
        {status === "logging-out" ? "Signing out…" : "Sign out"}
      </button>
      {status === "error" && (
        <p role="alert">
          Your browser cookie was cleared if the server was reached, but session
          revocation could not be confirmed. Retry or contact the administrator.
        </p>
      )}
    </div>
  );
}
