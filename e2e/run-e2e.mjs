/**
 * Real end-to-end check: boots the real backend against the dev Postgres DB
 * (already seeded with the live sponsor register + real SOC/ISL data),
 * loads the actual built unpacked extension into real headless Chromium via
 * Playwright, and drives the "Select from Page" + "Check Sponsorship" flow.
 *
 * What this does NOT cover (documented limitation, not a gap in this
 * script): a live Google OAuth consent screen and live Stripe Checkout —
 * this sandbox has no egress to accounts.google.com/stripe.com, and Chrome
 * extension OAuth requires a real registered client id. Instead, a real
 * backend-issued JWT is injected directly into chrome.storage.local (the
 * same storage shape the real sign-in flow writes), so everything
 * downstream of "the user is signed in" — the form, Select-from-Page,
 * the real /api/check call, and rendering real results — is exercised for
 * real.
 *
 * Playwright has no API to drive a *docked* side panel specifically (it's
 * not a tab). The pragmatic approach used here, and the one documented in
 * the build plan: open the side panel's own extension page
 * (chrome-extension://<id>/sidepanel.html) as a Playwright page, and a
 * separate fixture job-posting page as another page in the same context.
 * Chrome's "active tab" bookkeeping (what chrome.tabs.query({active:true})
 * returns, which the background script relies on to know where to inject
 * the picker) is driven by which page was last brought to front — so the
 * fixture page is kept frontmost throughout, while Playwright still
 * operates the side panel page's own DOM directly, regardless of which tab
 * is frontmost. This matches how a real docked side panel behaves: the
 * content tab stays active/focused while the side panel UI is interacted
 * with alongside it.
 */
import { chromium } from "playwright";
import { spawn, execFile } from "child_process";
import { createServer } from "http";
import { readFile, writeFile, cp } from "fs/promises";
import { existsSync, mkdtempSync, rmSync } from "fs";
import { tmpdir } from "os";
import { join, dirname } from "path";
import { fileURLToPath } from "url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const repoRoot = join(__dirname, "..");
const backendDir = join(repoRoot, "backend");
const extensionDist = join(repoRoot, "extension", "dist");
const chromiumPath = "/opt/pw-browsers/chromium-1194/chrome-linux/chrome";

const BACKEND_PORT = 3000;
const FIXTURE_PORT = 4455;
const BACKEND_URL = `http://localhost:${BACKEND_PORT}`;
const FIXTURE_URL = `http://localhost:${FIXTURE_PORT}/fixture-job-posting.html`;

const cleanupFns = [];
async function cleanup() {
  for (const fn of cleanupFns.reverse()) {
    try {
      await fn();
    } catch (err) {
      console.error("cleanup step failed:", err);
    }
  }
}

function log(step) {
  console.log(`\n=== ${step} ===`);
}

function assert(condition, message) {
  if (!condition) throw new Error(`Assertion failed: ${message}`);
}

async function waitForHealthz(timeoutMs = 20000) {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    try {
      const res = await fetch(`${BACKEND_URL}/healthz`);
      if (res.ok) return await res.json();
    } catch {
      // not up yet
    }
    await new Promise((r) => setTimeout(r, 300));
  }
  throw new Error(`Backend did not become healthy within ${timeoutMs}ms`);
}

function startFixtureServer() {
  const server = createServer(async (req, res) => {
    const file = join(__dirname, "fixture-job-posting.html");
    const body = await readFile(file, "utf-8");
    res.writeHead(200, { "Content-Type": "text/html" });
    res.end(body);
  });
  return new Promise((resolve) => {
    server.listen(FIXTURE_PORT, () => resolve(server));
  });
}

function mintSessionToken() {
  return new Promise((resolve, reject) => {
    const script = `
      import { pool } from "./src/db/pool";
      import { upsertUserFromGoogle } from "./src/services/users.service";
      import { signSessionToken } from "./src/services/jwt.service";
      (async () => {
        const user = await upsertUserFromGoogle(pool, { sub: "e2e-fixture-sub", email: "e2e@example.com", name: "E2E Fixture User", picture: null });
        const token = signSessionToken(user.id);
        process.stdout.write(JSON.stringify({ token, user: { id: user.id, email: user.email, displayName: user.displayName, avatarUrl: user.avatarUrl } }));
        await pool.end();
      })();
    `;
    execFile("npx", ["tsx", "-e", script], { cwd: backendDir, timeout: 15000 }, (err, stdout, stderr) => {
      if (err) {
        reject(new Error(`mintSessionToken failed: ${err.message}\n${stderr}`));
        return;
      }
      try {
        resolve(JSON.parse(stdout.trim()));
      } catch {
        reject(new Error(`Could not parse mintSessionToken output: ${stdout}\n${stderr}`));
      }
    });
  });
}

async function main() {
  if (!existsSync(extensionDist)) {
    throw new Error(`${extensionDist} does not exist — run "npm run build" in extension/ first.`);
  }

  log("Starting backend (real Postgres, real sponsor/SOC/ISL data)");
  // detached + killing the negative PID (the process group) is needed because
  // `npx tsx ...` spawns tsx as a child of npx; a plain backendProc.kill()
  // only kills the npx wrapper and leaks the actual node process underneath.
  const backendProc = spawn("npx", ["tsx", "src/index.ts"], {
    cwd: backendDir,
    stdio: ["ignore", "pipe", "pipe"],
    detached: true,
  });
  let backendLog = "";
  backendProc.stdout.on("data", (d) => (backendLog += d.toString()));
  backendProc.stderr.on("data", (d) => (backendLog += d.toString()));
  cleanupFns.push(() => {
    try {
      process.kill(-backendProc.pid, "SIGTERM");
    } catch {
      backendProc.kill();
    }
  });
  const health = await waitForHealthz();
  console.log(`Backend healthy: ${JSON.stringify(health)}`);

  log("Minting a real session JWT (bypasses live Google OAuth, which this sandbox can't reach)");
  const auth = await mintSessionToken();
  console.log(`Signed in as ${auth.user.email} (user id ${auth.user.id})`);

  log("Starting fixture job-posting server");
  const fixtureServer = await startFixtureServer();
  cleanupFns.push(() => new Promise((resolve) => fixtureServer.close(resolve)));
  console.log(`Fixture page: ${FIXTURE_URL}`);

  log("Preparing a test-only copy of the built extension (narrow host_permissions merged in — see manifest.e2e-overrides.json)");
  const e2eExtensionDir = mkdtempSync(join(tmpdir(), "visa-checker-e2e-ext-"));
  cleanupFns.push(() => rmSync(e2eExtensionDir, { recursive: true, force: true }));
  await cp(extensionDist, e2eExtensionDir, { recursive: true });
  const realManifest = JSON.parse(await readFile(join(extensionDist, "manifest.json"), "utf-8"));
  const overrides = JSON.parse(await readFile(join(__dirname, "manifest.e2e-overrides.json"), "utf-8"));
  delete overrides._comment;
  await writeFile(join(e2eExtensionDir, "manifest.json"), JSON.stringify({ ...realManifest, ...overrides }, null, 2));

  log("Launching headless Chromium with the (test-only) extension copy loaded");
  const userDataDir = mkdtempSync(join(tmpdir(), "visa-checker-e2e-profile-"));
  cleanupFns.push(() => rmSync(userDataDir, { recursive: true, force: true }));
  const context = await chromium.launchPersistentContext(userDataDir, {
    headless: true,
    executablePath: chromiumPath,
    args: [`--disable-extensions-except=${e2eExtensionDir}`, `--load-extension=${e2eExtensionDir}`],
  });
  cleanupFns.push(() => context.close());

  let sw = context.serviceWorkers()[0];
  if (!sw) sw = await context.waitForEvent("serviceworker", { timeout: 10000 });
  const extensionId = new URL(sw.url()).host;
  console.log(`Extension loaded, id = ${extensionId}`);
  try {
    sw.on("console", (msg) => console.log(`[background console] ${msg.text()}`));
  } catch {
    // service worker console capture isn't available in this Playwright version — not fatal
  }

  log("Opening fixture page (this is the real 'active tab' the picker injects into)");
  const fixturePage = await context.newPage();
  fixturePage.on("console", (msg) => console.log(`[fixture console] ${msg.text()}`));
  fixturePage.on("pageerror", (err) => console.log(`[fixture pageerror] ${err}`));
  await fixturePage.goto(FIXTURE_URL);
  await fixturePage.bringToFront();

  log("Opening the side panel's own page and signing in (injected real JWT)");
  const panel = await context.newPage();
  panel.on("console", (msg) => console.log(`[sidepanel console] ${msg.text()}`));
  panel.on("pageerror", (err) => console.log(`[sidepanel pageerror] ${err}`));
  await panel.goto(`chrome-extension://${extensionId}/sidepanel.html`);
  await panel.evaluate((authData) => {
    return chrome.storage.local.set({ "visaChecker.auth": authData });
  }, auth);
  await fixturePage.bringToFront(); // keep the fixture tab active, not the panel we're about to reload
  await panel.reload();
  await panel.waitForSelector("#companyName", { timeout: 10000 });
  console.log("Side panel shows the signed-in form.");

  async function selectFromPage(field, pageSelector, expectedText) {
    await fixturePage.bringToFront();
    await panel.locator(`button[data-field="${field}"]`).click();
    await panel.waitForFunction(
      (f) => document.querySelector(`button[data-field="${f}"]`)?.textContent?.includes("Click text on page"),
      field,
      { timeout: 5000 },
    );
    await fixturePage.bringToFront();
    await fixturePage.locator(pageSelector).click();
    await panel.waitForFunction(
      ({ f, expected }) => document.getElementById(f)?.value === expected,
      { f: field, expected: expectedText },
      { timeout: 10000 },
    );
    const actual = await panel.locator(`#${field}`).inputValue();
    assert(actual === expectedText, `${field} should be picked text "${expectedText}", got "${actual}"`);
    console.log(`${field} field populated via Select-from-Page: "${actual}"`);
  }

  log("Select from Page: Company Name");
  await selectFromPage("companyName", "#company-name", "Google (UK) Limited");

  log("Select from Page: Job Title");
  await selectFromPage("jobTitle", "#job-title", "Bricklayer");

  log("Submitting a real /api/check call against the real backend + real data");
  await panel.getByRole("button", { name: /check sponsorship/i }).click();
  await panel.waitForSelector("text=Sponsor match", { timeout: 15000 });

  const sponsorConfidence = await panel.locator(".card", { hasText: "Sponsor match" }).locator(".badge").innerText();
  const socCode = await panel
    .locator(".card", { hasText: "SOC code" })
    .locator(".row", { hasText: "Code" })
    .locator(".row-value")
    .innerText();
  const islBadge = await panel.locator(".card", { hasText: "Immigration Salary List" }).locator(".badge").innerText();

  assert(sponsorConfidence === "Exact match", `expected sponsor "Exact match", got "${sponsorConfidence}"`);
  assert(socCode === "5313", `expected SOC code 5313 (Bricklayers), got "${socCode}"`);
  assert(islBadge.startsWith("On the list"), `expected Bricklayers to be on the Immigration Salary List, got "${islBadge}"`);

  console.log(`Real check result: sponsor=${sponsorConfidence}, soc=${socCode}, isl="${islBadge}"`);

  await panel.screenshot({ path: join(__dirname, "e2e-result.png"), fullPage: true });
  console.log(`Screenshot saved to e2e/e2e-result.png`);

  console.log("\n✅ ALL E2E CHECKS PASSED");
}

main()
  .then(async () => {
    await cleanup();
    process.exit(0);
  })
  .catch(async (err) => {
    console.error("\n❌ E2E CHECK FAILED:", err);
    await cleanup();
    process.exit(1);
  });
