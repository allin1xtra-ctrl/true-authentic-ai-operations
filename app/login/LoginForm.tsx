"use client";

import { FormEvent, useState } from "react";
import { safeReturnPath } from "../../lib/account-policy.mjs";

export default function LoginForm({ created = false }: { created?: boolean }) {
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy(true);
    setError("");
    const data = new FormData(event.currentTarget);
    try {
      const response = await fetch("/api/auth/login", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ email: data.get("email"), password: data.get("password") }),
      });
      if (response.ok) {
        location.href = safeReturnPath(new URLSearchParams(location.search).get("return_to") || "/");
        return;
      }
      setError("Sign-in failed. Check your credentials and try again.");
    } catch {
      setError("Sign-in is temporarily unavailable. Check your connection and try again.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      {created && <p className="ta-auth-success" role="status">Owner account created. Sign in with your new password.</p>}
      <form onSubmit={submit}>
        <label>Email<input name="email" type="email" autoComplete="email" required /></label>
        <label>Password<input name="password" type="password" autoComplete="current-password" minLength={12} maxLength={256} required /></label>
        {error && <p className="ta-auth-error" role="alert">{error}</p>}
        <button disabled={busy}>{busy ? "Signing in…" : "Sign in"}</button>
      </form>
    </>
  );
}
