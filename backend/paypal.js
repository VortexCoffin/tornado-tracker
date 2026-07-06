import "./env.js";
import { readFileSync, writeFileSync, existsSync, mkdirSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { TIERS } from "./subscriptions.js";
import { getAccountById, updateAccount } from "./accounts.js";
import { listOverlaysForTier } from "./subscriptions.js";

const __dirname = dirname(fileURLToPath(import.meta.url));
const DATA_DIR = join(__dirname, "data");
const PLANS_FILE = join(DATA_DIR, "paypal-plans.json");
const PENDING_FILE = join(DATA_DIR, "paypal-pending.json");

function paypalEnv() {
  const mode = process.env.PAYPAL_MODE === "live" ? "live" : "sandbox";
  return {
    clientId: process.env.PAYPAL_CLIENT_ID || "",
    clientSecret: process.env.PAYPAL_CLIENT_SECRET || "",
    mode,
    apiBase:
      mode === "live"
        ? "https://api-m.paypal.com"
        : "https://api-m.sandbox.paypal.com",
  };
}

let accessToken = null;
let tokenExpiresAt = 0;

function ensureDataFiles() {
  if (!existsSync(DATA_DIR)) mkdirSync(DATA_DIR, { recursive: true });
  if (!existsSync(PLANS_FILE)) writeFileSync(PLANS_FILE, "{}");
  if (!existsSync(PENDING_FILE)) writeFileSync(PENDING_FILE, "{}");
}

function readJson(path, fallback) {
  ensureDataFiles();
  return JSON.parse(readFileSync(path, "utf8"));
}

function writeJson(path, data) {
  ensureDataFiles();
  writeFileSync(path, JSON.stringify(data, null, 2));
}

export function paypalConfigured() {
  const { clientId, clientSecret } = paypalEnv();
  return Boolean(clientId && clientSecret);
}

export function getPayPalConfig() {
  const { clientId, mode } = paypalEnv();
  return {
    configured: paypalConfigured(),
    clientId,
    mode,
  };
}

function readPlansStore() {
  const store = readJson(PLANS_FILE, {});
  const { mode } = paypalEnv();
  if (store.mode && store.mode !== mode) {
    return { mode };
  }
  return { ...store, mode };
}

function writePlansStore(store) {
  const { mode } = paypalEnv();
  writeJson(PLANS_FILE, { ...store, mode });
}

async function getAccessToken() {
  const { clientId, clientSecret, apiBase } = paypalEnv();
  if (!clientId || !clientSecret) {
    throw new Error("PayPal is not configured. Add credentials to backend/.env");
  }

  if (accessToken && Date.now() < tokenExpiresAt - 60_000) {
    return accessToken;
  }

  const auth = Buffer.from(`${clientId}:${clientSecret}`).toString("base64");
  const response = await fetch(`${apiBase}/v1/oauth2/token`, {
    method: "POST",
    headers: {
      Authorization: `Basic ${auth}`,
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body: "grant_type=client_credentials",
  });

  if (!response.ok) {
    const text = await response.text();
    throw new Error(`PayPal auth failed: ${text}`);
  }

  const data = await response.json();
  accessToken = data.access_token;
  tokenExpiresAt = Date.now() + data.expires_in * 1000;
  return accessToken;
}

async function paypalRequest(path, options = {}) {
  const { apiBase } = paypalEnv();
  const token = await getAccessToken();
  const response = await fetch(`${apiBase}${path}`, {
    ...options,
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
      ...options.headers,
    },
  });

  const text = await response.text();
  const data = text ? JSON.parse(text) : {};

  if (!response.ok) {
    throw new Error(data.message || data.error_description || text || "PayPal request failed");
  }

  return data;
}

async function ensureProduct() {
  const plans = readPlansStore();
  if (plans.productId) return plans.productId;

  const product = await paypalRequest("/v1/catalogs/products", {
    method: "POST",
    body: JSON.stringify({
      name: "Canada Tornado Tracker",
      description: "Premium map overlays and weather layers",
      type: "SERVICE",
      category: "SOFTWARE",
    }),
  });

  plans.productId = product.id;
  writePlansStore(plans);
  return product.id;
}

async function ensurePlanForTier(tierId) {
  const tier = TIERS[tierId];
  if (!tier || tier.price <= 0) {
    throw new Error("Paid plan required");
  }

  const plans = readPlansStore();
  if (plans[tierId]) return plans[tierId];

  const productId = await ensureProduct();
  const plan = await paypalRequest("/v1/billing/plans", {
    method: "POST",
    body: JSON.stringify({
      product_id: productId,
      name: `${tier.name} Monthly`,
      description: tier.description,
      status: "ACTIVE",
      billing_cycles: [
        {
          frequency: {
            interval_unit: "MONTH",
            interval_count: 1,
          },
          tenure_type: "REGULAR",
          sequence: 1,
          total_cycles: 0,
          pricing_scheme: {
            fixed_price: {
              value: tier.price.toFixed(2),
              currency_code: "CAD",
            },
          },
        },
      ],
      payment_preferences: {
        auto_bill_outstanding: true,
        setup_fee_failure_action: "CONTINUE",
        payment_failure_threshold: 3,
      },
    }),
  });

  plans[tierId] = plan.id;
  writePlansStore(plans);
  return plan.id;
}

export async function createPayPalSubscription(userId, tierId, returnUrl, cancelUrl) {
  if (!paypalConfigured()) {
    throw new Error("PayPal is not configured on the server");
  }

  const account = getAccountById(userId);
  if (!account) throw new Error("Account not found");

  const planId = await ensurePlanForTier(tierId);
  const subscription = await paypalRequest("/v1/billing/subscriptions", {
    method: "POST",
    body: JSON.stringify({
      plan_id: planId,
      custom_id: userId,
      application_context: {
        brand_name: "Canada Tornado Tracker",
        locale: "en-CA",
        shipping_preference: "NO_SHIPPING",
        user_action: "SUBSCRIBE_NOW",
        return_url: returnUrl,
        cancel_url: cancelUrl,
      },
    }),
  });

  const approvalUrl = subscription.links?.find((link) => link.rel === "approve")?.href;
  if (!approvalUrl) {
    throw new Error("PayPal did not return an approval URL");
  }

  const pending = readJson(PENDING_FILE, {});
  pending[subscription.id] = {
    userId,
    tier: tierId,
    createdAt: new Date().toISOString(),
  };
  writeJson(PENDING_FILE, pending);

  return {
    subscriptionId: subscription.id,
    approvalUrl,
  };
}

async function fetchPayPalSubscription(subscriptionId) {
  return paypalRequest(`/v1/billing/subscriptions/${subscriptionId}`, {
    method: "GET",
  });
}

function subscriptionFromPayPal(tierId, paypalSubscription) {
  const nextBilling = paypalSubscription.billing_info?.next_billing_time;
  return {
    tier: tierId,
    status: paypalSubscription.status === "ACTIVE" ? "active" : "pending",
    provider: "paypal",
    paypalSubscriptionId: paypalSubscription.id,
    startedAt: new Date().toISOString(),
    expiresAt: nextBilling || null,
  };
}

export async function completePayPalSubscription(userId, subscriptionId) {
  const pending = readJson(PENDING_FILE, {});
  const record = pending[subscriptionId];

  const paypalSubscription = await fetchPayPalSubscription(subscriptionId);
  const tierId = record?.tier || null;

  if (!tierId) {
    throw new Error("Unknown PayPal subscription");
  }

  if (record && record.userId !== userId) {
    throw new Error("Subscription does not belong to this account");
  }

  if (paypalSubscription.custom_id && paypalSubscription.custom_id !== userId) {
    throw new Error("Subscription does not belong to this account");
  }

  const validStatuses = ["ACTIVE", "APPROVED"];
  if (!validStatuses.includes(paypalSubscription.status)) {
    throw new Error(`PayPal subscription status is ${paypalSubscription.status}`);
  }

  const account = getAccountById(userId);
  const allowedOverlays = listOverlaysForTier(tierId)
    .filter((item) => item.unlocked && item.type === "base")
    .map((item) => item.id);

  const mapOverlay = allowedOverlays.includes(account.preferences?.mapOverlay)
    ? account.preferences.mapOverlay
    : "standard";

  const updated = updateAccount(userId, {
    subscription: subscriptionFromPayPal(tierId, paypalSubscription),
    preferences: { ...account.preferences, mapOverlay },
  });

  delete pending[subscriptionId];
  writeJson(PENDING_FILE, pending);

  return updated;
}

export async function cancelPayPalSubscription(subscriptionId) {
  if (!subscriptionId) return;
  try {
    await paypalRequest(`/v1/billing/subscriptions/${subscriptionId}/cancel`, {
      method: "POST",
      body: JSON.stringify({ reason: "Customer switched plans" }),
    });
  } catch (error) {
    console.warn("PayPal cancel warning:", error.message);
  }
}

export async function downgradeToFree(userId) {
  const account = getAccountById(userId);
  if (!account) throw new Error("Account not found");

  if (account.subscription?.paypalSubscriptionId) {
    await cancelPayPalSubscription(account.subscription.paypalSubscriptionId);
  }

  const allowedOverlays = listOverlaysForTier("free")
    .filter((item) => item.unlocked && item.type === "base")
    .map((item) => item.id);

  return updateAccount(userId, {
    subscription: {
      tier: "free",
      status: "active",
      provider: null,
      paypalSubscriptionId: null,
      startedAt: new Date().toISOString(),
      expiresAt: null,
    },
    preferences: {
      ...account.preferences,
      mapOverlay: allowedOverlays.includes(account.preferences?.mapOverlay)
        ? account.preferences.mapOverlay
        : "standard",
      showRadar: false,
      showClouds: false,
    },
  });
}
