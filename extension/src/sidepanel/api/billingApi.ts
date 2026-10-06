import { apiFetch } from "./client";

export async function startPremiumCheckout(): Promise<void> {
  const result = await apiFetch<{ checkoutUrl: string }>("/api/billing/create-checkout-session", {
    method: "POST",
    body: JSON.stringify({}),
  });
  await chrome.tabs.create({ url: result.checkoutUrl });
}
