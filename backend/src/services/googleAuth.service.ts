export interface GoogleUserInfo {
  sub: string;
  email: string | null;
  name: string | null;
  picture: string | null;
}

/**
 * Verifies a Google OAuth access token and returns the signed-in user's
 * profile. Interface (not a concrete class) so tests can inject a stub and
 * exercise the rest of the auth flow without network egress to Google.
 */
export interface GoogleTokenVerifier {
  verify(accessToken: string): Promise<GoogleUserInfo>;
}

export class RealGoogleTokenVerifier implements GoogleTokenVerifier {
  async verify(accessToken: string): Promise<GoogleUserInfo> {
    const res = await fetch("https://www.googleapis.com/oauth2/v3/userinfo", {
      headers: { Authorization: `Bearer ${accessToken}` },
    });
    if (!res.ok) {
      throw new Error(`Google token verification failed: HTTP ${res.status}`);
    }
    const data = (await res.json()) as Record<string, unknown>;
    if (typeof data.sub !== "string" || data.sub.length === 0) {
      throw new Error("Google userinfo response missing 'sub'");
    }
    return {
      sub: data.sub,
      email: typeof data.email === "string" ? data.email : null,
      name: typeof data.name === "string" ? data.name : null,
      picture: typeof data.picture === "string" ? data.picture : null,
    };
  }
}
