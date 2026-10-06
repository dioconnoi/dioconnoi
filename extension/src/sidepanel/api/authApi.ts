import { apiFetch } from "./client";
import { setStoredAuth, clearStoredAuth, type StoredAuth } from "../../shared/storage";
import type { MeResponseBody } from "../../shared/types";

/**
 * Runs the Google sign-in flow (chrome.identity.getAuthToken) and exchanges
 * the resulting Google access token for our own backend session JWT.
 */
export async function signInWithGoogle(): Promise<StoredAuth> {
  const googleAccessToken = await new Promise<string>((resolve, reject) => {
    chrome.identity.getAuthToken({ interactive: true }, (token) => {
      if (chrome.runtime.lastError || !token) {
        reject(new Error(chrome.runtime.lastError?.message ?? "Google sign-in was cancelled or failed."));
        return;
      }
      resolve(typeof token === "string" ? token : (token as unknown as { token: string }).token);
    });
  });

  const result = await apiFetch<{ token: string; user: StoredAuth["user"] }>("/api/auth/google", {
    method: "POST",
    body: JSON.stringify({ googleAccessToken }),
  });

  const auth: StoredAuth = { token: result.token, user: result.user };
  await setStoredAuth(auth);
  return auth;
}

export async function signOut(): Promise<void> {
  await new Promise<void>((resolve) => {
    chrome.identity.getAuthToken({ interactive: false }, (token) => {
      const tokenStr = typeof token === "string" ? token : undefined;
      if (tokenStr) {
        chrome.identity.removeCachedAuthToken({ token: tokenStr }, () => resolve());
      } else {
        resolve();
      }
    });
  });
  await clearStoredAuth();
}

export function getMe(): Promise<MeResponseBody> {
  return apiFetch<MeResponseBody>("/api/me");
}
