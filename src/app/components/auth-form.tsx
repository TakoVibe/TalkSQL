"use client";

import { FormEvent, useState } from "react";

import { Logo } from "@/app/components/logo";
import { authClient } from "@/lib/auth-client";

type Mode = "sign-in" | "sign-up" | "verify" | "forgot-password" | "reset-password";
type Verification = { email: string; name: string };

function workspaceSlug(name: string) {
  return `${name.toLowerCase().trim().replace(/[^a-z0-9]+/g, "-").replace(/(^-|-$)/g, "") || "workspace"}-${Math.random().toString(36).slice(2, 8)}`;
}

function messageFor(error: unknown) {
  return error instanceof Error ? error.message : "Something went wrong. Please try again.";
}

export function AuthForm() {
  const [mode, setMode] = useState<Mode>("sign-up");
  const [pending, setPending] = useState(false);
  const [message, setMessage] = useState("");
  const [verification, setVerification] = useState<Verification>();
  const [code, setCode] = useState("");
  const [activationReady, setActivationReady] = useState(false);
  const [resetEmail, setResetEmail] = useState("");
  const [passwordResetComplete, setPasswordResetComplete] = useState(false);

  async function sendCode(email: string) {
    const { error } = await authClient.emailOtp.sendVerificationOtp({
      email,
      type: "email-verification",
    });
    if (error) throw new Error(error.message);
  }

  async function ensureWorkspace(name: string) {
    const organizationsResponse = await fetch("/api/auth/organization/list", { credentials: "same-origin" });
    if (!organizationsResponse.ok) throw new Error("Your email is verified, but we could not finish workspace setup.");
    const organizations = await organizationsResponse.json() as unknown;
    if (!Array.isArray(organizations) || organizations.length) return;

    const { error } = await authClient.organization.create({
      name: `${name}'s workspace`,
      slug: workspaceSlug(name),
    });
    if (error) throw new Error(error.message);
  }

  async function finishActivation(name: string) {
    setPending(true);
    setMessage("");
    try {
      await ensureWorkspace(name);
      window.location.assign("/");
    } catch (error) {
      setMessage(messageFor(error));
    } finally {
      setPending(false);
    }
  }

  async function submitCredentials(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setPending(true);
    setMessage("");
    setPasswordResetComplete(false);
    const form = new FormData(event.currentTarget);
    const email = String(form.get("email") ?? "").trim().toLowerCase();
    const password = String(form.get("password") ?? "");

    try {
      if (mode === "sign-in") {
        const { error } = await authClient.signIn.email({ email, password });
        if (error) {
          if (error.status === 403) {
            setVerification({ email, name: "" });
            setCode("");
            setActivationReady(false);
            setMode("verify");
            setMessage("We sent a new six-digit code to activate your account.");
            return;
          }
          throw new Error(error.message);
        }
        window.location.assign("/");
        return;
      }

      const name = String(form.get("name") ?? "").trim();
      const { error } = await authClient.signUp.email({ name, email, password });
      if (error) throw new Error(error.message);

      // This request also covers the generic response returned for an existing email.
      // It avoids leaking whether that email already has a TalkSQL account.
      await sendCode(email);
      setVerification({ email, name });
      setCode("");
      setActivationReady(false);
      setMode("verify");
      setMessage("We sent a six-digit verification code to your email.");
    } catch (error) {
      setMessage(messageFor(error));
    } finally {
      setPending(false);
    }
  }

  async function verifyCode(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!verification || code.trim().length !== 6) return;
    setPending(true);
    setMessage("");
    try {
      const { data, error } = await authClient.emailOtp.verifyEmail({
        email: verification.email,
        otp: code.trim(),
      });
      if (error) throw new Error(error.message);

      const name = data?.user.name || verification.name || "My";
      setActivationReady(true);
      await ensureWorkspace(name);
      window.location.assign("/");
    } catch (error) {
      setMessage(messageFor(error));
    } finally {
      setPending(false);
    }
  }

  async function resendCode() {
    if (!verification || pending) return;
    setPending(true);
    setMessage("");
    try {
      await sendCode(verification.email);
      setMessage("A new six-digit code is on its way.");
    } catch (error) {
      setMessage(messageFor(error));
    } finally {
      setPending(false);
    }
  }

  async function requestPasswordReset(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setPending(true);
    setMessage("");
    const form = new FormData(event.currentTarget);
    const email = String(form.get("email") ?? "").trim().toLowerCase();
    try {
      const { error } = await authClient.emailOtp.requestPasswordReset({ email });
      if (error) throw new Error(error.message);
      setResetEmail(email);
      setCode("");
      setMode("reset-password");
      setMessage("If an account exists for this email, a six-digit reset code is on its way.");
    } catch (error) {
      setMessage(messageFor(error));
    } finally {
      setPending(false);
    }
  }

  async function resetPassword(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!resetEmail || code.length !== 6) return;
    setPending(true);
    setMessage("");
    const form = new FormData(event.currentTarget);
    const password = String(form.get("newPassword") ?? "");
    const confirmation = String(form.get("confirmPassword") ?? "");
    if (password !== confirmation) {
      setMessage("The passwords do not match.");
      setPending(false);
      return;
    }
    try {
      const { error } = await authClient.emailOtp.resetPassword({ email: resetEmail, otp: code, password });
      if (error) throw new Error(error.message);
      setMode("sign-in");
      setCode("");
      setResetEmail("");
      setPasswordResetComplete(true);
      setMessage("Password updated. You can now sign in with your new password.");
    } catch (error) {
      setMessage(messageFor(error));
    } finally {
      setPending(false);
    }
  }

  async function resendResetCode() {
    if (!resetEmail || pending) return;
    setPending(true);
    setMessage("");
    try {
      const { error } = await authClient.emailOtp.requestPasswordReset({ email: resetEmail });
      if (error) throw new Error(error.message);
      setCode("");
      setMessage("If an account exists for this email, a new reset code is on its way.");
    } catch (error) {
      setMessage(messageFor(error));
    } finally {
      setPending(false);
    }
  }

  if (mode === "forgot-password") {
    return (
      <section className="w-full max-w-md rounded-2xl border border-[#dfe4df] bg-white p-7 shadow-[0_18px_50px_rgba(28,49,37,0.08)]">
        <div className="flex items-center gap-2.5"><Logo size={32} /><span className="text-lg font-semibold">TalkSQL</span></div>
        <p className="mt-8 text-xs font-semibold tracking-[0.14em] text-[#27704f]">ACCOUNT RECOVERY</p>
        <h1 className="mt-2 text-2xl font-semibold tracking-tight">Reset your password</h1>
        <p className="mt-2 text-sm leading-6 text-[#66716b]">Enter your account email. If it matches a TalkSQL account, we’ll send a six-digit reset code.</p>
        <form onSubmit={requestPasswordReset} className="mt-6 space-y-4">
          <label className="block text-sm font-medium">Email<input required autoFocus name="email" type="email" autoComplete="email" className="mt-1.5 min-h-11 w-full rounded-lg border border-[#cfd7d1] px-3 py-2 outline-none focus:border-[#205b43]" /></label>
          {message && <p role="alert" className="rounded-lg bg-[#fff0ee] px-3 py-2 text-sm text-[#a63d2f]">{message}</p>}
          <button disabled={pending} className="min-h-11 w-full rounded-lg bg-[#205b43] px-4 py-2.5 text-sm font-medium text-white disabled:opacity-60">{pending ? "Sending…" : "Send reset code"}</button>
        </form>
        <button type="button" onClick={() => { setMode("sign-in"); setMessage(""); }} className="mt-5 min-h-11 w-full text-sm font-semibold text-[#205b43]">Back to sign in</button>
      </section>
    );
  }

  if (mode === "reset-password" && resetEmail) {
    return (
      <section className="w-full max-w-md rounded-2xl border border-[#dfe4df] bg-white p-7 shadow-[0_18px_50px_rgba(28,49,37,0.08)]">
        <div className="flex items-center gap-2.5"><Logo size={32} /><span className="text-lg font-semibold">TalkSQL</span></div>
        <p className="mt-8 text-xs font-semibold tracking-[0.14em] text-[#27704f]">ACCOUNT RECOVERY</p>
        <h1 className="mt-2 text-2xl font-semibold tracking-tight">Choose a new password</h1>
        <p className="mt-2 text-sm leading-6 text-[#66716b]">Enter the code sent to <span className="font-medium text-[#17211c]">{resetEmail}</span> and choose a password with at least eight characters.</p>
        <form onSubmit={resetPassword} className="mt-6 space-y-4">
          <label className="block text-sm font-medium">Reset code<input required autoFocus value={code} onChange={(event) => setCode(event.target.value.replace(/\D/g, "").slice(0, 6))} inputMode="numeric" autoComplete="one-time-code" pattern="[0-9]{6}" placeholder="000000" className="mt-1.5 min-h-11 w-full rounded-lg border border-[#cfd7d1] px-3 py-3 text-center font-mono text-2xl tracking-[0.45em] outline-none focus:border-[#205b43]" /></label>
          <label className="block text-sm font-medium">New password<input required name="newPassword" type="password" minLength={8} autoComplete="new-password" className="mt-1.5 min-h-11 w-full rounded-lg border border-[#cfd7d1] px-3 py-2 outline-none focus:border-[#205b43]" /></label>
          <label className="block text-sm font-medium">Confirm new password<input required name="confirmPassword" type="password" minLength={8} autoComplete="new-password" className="mt-1.5 min-h-11 w-full rounded-lg border border-[#cfd7d1] px-3 py-2 outline-none focus:border-[#205b43]" /></label>
          {message && <p role="status" className="rounded-lg bg-[#f0f4f1] px-3 py-2 text-sm text-[#526059]">{message}</p>}
          <button disabled={pending || code.length !== 6} className="min-h-11 w-full rounded-lg bg-[#205b43] px-4 py-2.5 text-sm font-medium text-white disabled:opacity-60">{pending ? "Updating…" : "Update password"}</button>
        </form>
        <div className="mt-5 flex items-center justify-between gap-3 text-sm">
          <button type="button" onClick={resendResetCode} disabled={pending} className="min-h-11 font-semibold text-[#205b43] disabled:opacity-50">Resend code</button>
          <button type="button" onClick={() => { setMode("forgot-password"); setMessage(""); setCode(""); }} className="min-h-11 text-[#66716b] hover:text-[#205b43]">Use another email</button>
        </div>
      </section>
    );
  }

  if (mode === "verify" && verification) {
    return (
      <section className="w-full max-w-md rounded-2xl border border-[#dfe4df] bg-white p-7 shadow-[0_18px_50px_rgba(28,49,37,0.08)]">
        <div className="flex items-center gap-2.5"><Logo size={32} /><span className="text-lg font-semibold">TalkSQL</span></div>
        <p className="mt-8 text-xs font-semibold tracking-[0.14em] text-[#27704f]">ACTIVATE YOUR ACCOUNT</p>
        <h1 className="mt-2 text-2xl font-semibold tracking-tight">Check your email</h1>
        <p className="mt-2 text-sm leading-6 text-[#66716b]">Enter the six-digit code sent to <span className="font-medium text-[#17211c]">{verification.email}</span>. It expires in five minutes.</p>

        {activationReady ? (
          <div className="mt-6">
            <p className="rounded-lg bg-[#e6f1eb] px-3 py-2 text-sm text-[#205b43]">Your email is verified. Finish setting up your workspace.</p>
            {message && <p role="alert" className="mt-3 rounded-lg bg-[#fff0ee] px-3 py-2 text-sm text-[#a63d2f]">{message}</p>}
            <button onClick={() => finishActivation(verification.name || "My")} disabled={pending} className="mt-4 w-full rounded-lg bg-[#205b43] px-4 py-2.5 text-sm font-medium text-white disabled:opacity-60">{pending ? "Finishing setup…" : "Finish setup"}</button>
          </div>
        ) : (
          <form onSubmit={verifyCode} className="mt-6 space-y-4">
            <label className="block text-sm font-medium">Verification code<input required autoFocus value={code} onChange={(event) => setCode(event.target.value.replace(/\D/g, "").slice(0, 6))} inputMode="numeric" autoComplete="one-time-code" pattern="[0-9]{6}" placeholder="000000" className="mt-1.5 w-full rounded-lg border border-[#cfd7d1] px-3 py-3 text-center font-mono text-2xl tracking-[0.45em] outline-none focus:border-[#205b43]" /></label>
            {message && <p role="status" className="rounded-lg bg-[#f0f4f1] px-3 py-2 text-sm text-[#526059]">{message}</p>}
            <button disabled={pending || code.length !== 6} className="w-full rounded-lg bg-[#205b43] px-4 py-2.5 text-sm font-medium text-white disabled:opacity-60">{pending ? "Verifying…" : "Verify and continue"}</button>
          </form>
        )}

        {!activationReady && <div className="mt-5 flex items-center justify-between gap-3 text-sm"><button type="button" onClick={resendCode} disabled={pending} className="font-semibold text-[#205b43] disabled:opacity-50">Resend code</button><button type="button" onClick={() => { setMode("sign-in"); setMessage(""); setCode(""); }} className="text-[#66716b] hover:text-[#205b43]">Use another email</button></div>}
      </section>
    );
  }

  return (
    <section className="w-full max-w-md rounded-2xl border border-[#dfe4df] bg-white p-7 shadow-[0_18px_50px_rgba(28,49,37,0.08)]">
      <div className="flex items-center gap-2.5"><Logo size={32} /><span className="text-lg font-semibold">TalkSQL</span></div>
      <h1 className="mt-8 text-2xl font-semibold tracking-tight">{mode === "sign-up" ? "Create your workspace" : "Welcome back"}</h1>
      <p className="mt-2 text-sm text-[#66716b]">{mode === "sign-up" ? "We’ll email a six-digit code to activate your account." : "Sign in to manage your connected data."}</p>
      <form onSubmit={submitCredentials} className="mt-6 space-y-4">
        {mode === "sign-up" && <label className="block text-sm font-medium">Your name<input required name="name" autoComplete="name" className="mt-1.5 w-full rounded-lg border border-[#cfd7d1] px-3 py-2 outline-none focus:border-[#205b43]" /></label>}
        <label className="block text-sm font-medium">Email<input required name="email" type="email" autoComplete="email" className="mt-1.5 w-full rounded-lg border border-[#cfd7d1] px-3 py-2 outline-none focus:border-[#205b43]" /></label>
        <div>
          <div className="flex items-center justify-between gap-3"><label htmlFor="auth-password" className="text-sm font-medium">Password</label>{mode === "sign-in" && <button type="button" onClick={() => { setMode("forgot-password"); setMessage(""); setPasswordResetComplete(false); }} className="text-sm font-semibold text-[#205b43] hover:text-[#174532]">Forgot password?</button>}</div>
          <input id="auth-password" required name="password" type="password" minLength={8} autoComplete={mode === "sign-up" ? "new-password" : "current-password"} className="mt-1.5 min-h-11 w-full rounded-lg border border-[#cfd7d1] px-3 py-2 outline-none focus:border-[#205b43]" />
        </div>
        {message && <p role={passwordResetComplete ? "status" : "alert"} className={`rounded-lg px-3 py-2 text-sm ${passwordResetComplete ? "bg-[#e6f1eb] text-[#205b43]" : "bg-[#fff0ee] text-[#a63d2f]"}`}>{message}</p>}
        <button disabled={pending} className="w-full rounded-lg bg-[#205b43] px-4 py-2.5 text-sm font-medium text-white disabled:opacity-60">{pending ? "Please wait…" : mode === "sign-up" ? "Create account" : "Sign in"}</button>
      </form>
      <p className="mt-5 text-center text-sm text-[#66716b]">{mode === "sign-up" ? "Already have an account?" : "New to TalkSQL?"} <button type="button" onClick={() => { setMode(mode === "sign-up" ? "sign-in" : "sign-up"); setMessage(""); setPasswordResetComplete(false); }} className="font-semibold text-[#205b43]">{mode === "sign-up" ? "Sign in" : "Create an account"}</button></p>
    </section>
  );
}
