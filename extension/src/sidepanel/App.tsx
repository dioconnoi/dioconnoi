import { useCallback, useEffect, useState } from "react";
import type { PickableField } from "../shared/messages";
import type { CheckResponseBody, MeResponseBody } from "../shared/types";
import { getStoredAuth, type StoredAuth } from "../shared/storage";
import { signInWithGoogle, signOut, getMe } from "./api/authApi";
import { runCheck } from "./api/checkApi";
import { startPremiumCheckout } from "./api/billingApi";
import { ApiError } from "./api/client";
import FieldWithPicker from "./components/FieldWithPicker";
import ResultsPanel from "./components/ResultsPanel";
import QuotaFooter from "./components/QuotaFooter";
import SignInButton from "./components/SignInButton";

interface FormState {
  companyName: string;
  jobTitle: string;
  jobDescription: string;
}

const EMPTY_FORM: FormState = { companyName: "", jobTitle: "", jobDescription: "" };

export default function App() {
  const [auth, setAuth] = useState<StoredAuth | null | undefined>(undefined); // undefined = still loading
  const [me, setMe] = useState<MeResponseBody | null>(null);
  const [signingIn, setSigningIn] = useState(false);
  const [authError, setAuthError] = useState<string | null>(null);

  const [form, setForm] = useState<FormState>(EMPTY_FORM);
  const [pickingField, setPickingField] = useState<PickableField | null>(null);

  const [checking, setChecking] = useState(false);
  const [checkError, setCheckError] = useState<string | null>(null);
  const [result, setResult] = useState<CheckResponseBody | null>(null);

  const [upgrading, setUpgrading] = useState(false);

  const refreshMe = useCallback(async () => {
    try {
      const meResult = await getMe();
      setMe(meResult);
    } catch (err) {
      if (err instanceof ApiError && err.status === 401) {
        setAuth(null);
        setMe(null);
      }
    }
  }, []);

  useEffect(() => {
    getStoredAuth().then((stored) => {
      setAuth(stored);
      if (stored) refreshMe();
    });
  }, [refreshMe]);

  // Relay from background: the user finished (or cancelled) a "Select from Page" pick.
  useEffect(() => {
    function handleMessage(message: { type: string; field?: PickableField; text?: string }) {
      if (message.type === "PICKED_TEXT" && message.field) {
        setForm((prev) => ({ ...prev, [message.field as PickableField]: message.text ?? "" }));
        setPickingField(null);
      } else if (message.type === "PICKER_CANCELLED") {
        setPickingField(null);
      }
    }
    chrome.runtime.onMessage.addListener(handleMessage);
    return () => chrome.runtime.onMessage.removeListener(handleMessage);
  }, []);

  function startPicking(field: PickableField) {
    setPickingField(field);
    chrome.runtime.sendMessage({ type: "START_PICKER", field });
  }

  async function handleSignIn() {
    setSigningIn(true);
    setAuthError(null);
    try {
      const newAuth = await signInWithGoogle();
      setAuth(newAuth);
      await refreshMe();
    } catch (err) {
      setAuthError(err instanceof Error ? err.message : "Sign-in failed");
    } finally {
      setSigningIn(false);
    }
  }

  async function handleSignOut() {
    await signOut();
    setAuth(null);
    setMe(null);
    setResult(null);
  }

  async function submitCheck(socOverrideCode?: string) {
    if (!form.companyName.trim() || !form.jobTitle.trim()) {
      setCheckError("Company Name and Job Title are required.");
      return;
    }
    setChecking(true);
    setCheckError(null);
    try {
      const checkResult = await runCheck({
        companyName: form.companyName.trim(),
        jobTitle: form.jobTitle.trim(),
        jobDescription: form.jobDescription.trim() || undefined,
        socOverrideCode,
      });
      setResult(checkResult);
      setMe((prev) => (prev ? { ...prev, quota: checkResult.quota } : prev));
    } catch (err) {
      if (err instanceof ApiError && err.status === 429) {
        setCheckError("Daily free search quota exceeded. Upgrade to Premium for unlimited searches.");
      } else if (err instanceof ApiError && err.status === 401) {
        setAuth(null);
        setMe(null);
      } else {
        setCheckError(err instanceof Error ? err.message : "Something went wrong.");
      }
    } finally {
      setChecking(false);
    }
  }

  async function handleUpgrade() {
    setUpgrading(true);
    try {
      await startPremiumCheckout();
    } catch (err) {
      setCheckError(err instanceof Error ? err.message : "Could not start checkout.");
    } finally {
      setUpgrading(false);
    }
  }

  return (
    <>
      <header className="header">
        <h1>UK Sponsorship Checker</h1>
        {auth && (
          <div className="user-row">
            {auth.user.avatarUrl && <img src={auth.user.avatarUrl} alt="" />}
            <span>{auth.user.displayName ?? auth.user.email}</span>
            <button type="button" className="link-btn" onClick={handleSignOut}>
              Sign out
            </button>
          </div>
        )}
      </header>

      <main className="main">
        {auth === undefined && <p>Loading…</p>}

        {auth === null && (
          <>
            {authError && <div className="error-banner">{authError}</div>}
            <SignInButton loading={signingIn} onSignIn={handleSignIn} />
          </>
        )}

        {auth && (
          <>
            <FieldWithPicker
              field="companyName"
              label="Company Name"
              value={form.companyName}
              onChange={(v) => setForm((prev) => ({ ...prev, companyName: v }))}
              placeholder="e.g. Acme Consulting Ltd"
              isPicking={pickingField === "companyName"}
              onStartPicking={startPicking}
            />
            <FieldWithPicker
              field="jobTitle"
              label="Job Title"
              value={form.jobTitle}
              onChange={(v) => setForm((prev) => ({ ...prev, jobTitle: v }))}
              placeholder="e.g. Software Engineer"
              isPicking={pickingField === "jobTitle"}
              onStartPicking={startPicking}
            />
            <FieldWithPicker
              field="jobDescription"
              label="Job Description (optional)"
              value={form.jobDescription}
              onChange={(v) => setForm((prev) => ({ ...prev, jobDescription: v }))}
              placeholder="Paste the job description to improve SOC matching"
              multiline
              isPicking={pickingField === "jobDescription"}
              onStartPicking={startPicking}
            />

            {checkError && <div className="error-banner">{checkError}</div>}

            <button type="button" className="primary-btn" onClick={() => submitCheck()} disabled={checking}>
              {checking ? <span className="spinner" /> : "Check Sponsorship"}
            </button>

            {result && <ResultsPanel result={result} onSocOverride={(code) => submitCheck(code)} />}
          </>
        )}
      </main>

      {auth && me && <QuotaFooter quota={me.quota} onUpgrade={handleUpgrade} upgrading={upgrading} />}
    </>
  );
}
