// Thin client for the FastAPI service. With NEXT_PUBLIC_API_URL unset, every
// call is answered from lib/demo.ts instead, so the UI runs with no backend.

import * as demo from "./demo";
import type {
  Alert, Dashboard, Drug, Lot, Me, NewDrug, NewLot, SellerSignup,
} from "./types";

const API_URL = process.env.NEXT_PUBLIC_API_URL?.replace(/\/$/, "");
export const DEMO = !API_URL;

const TOKEN_KEY = "medx.token";

export class ApiError extends Error {
  constructor(public status: number, message: string) {
    super(message);
  }
}

export function getToken(): string | null {
  try {
    return localStorage.getItem(TOKEN_KEY);
  } catch {
    return null;
  }
}

function setToken(token: string | null) {
  try {
    if (token) localStorage.setItem(TOKEN_KEY, token);
    else localStorage.removeItem(TOKEN_KEY);
  } catch {
    // Private mode or blocked storage: the session just won't persist.
  }
}

export const isSignedIn = () => getToken() !== null;

// FastAPI returns a string for HTTPException and a list of field errors for
// validation failures. Turn either into one readable sentence.
function describe(detail: unknown, fallback: string): string {
  if (typeof detail === "string") return detail;
  if (Array.isArray(detail)) {
    return detail
      .map((d: { msg?: string; loc?: unknown[] }) => {
        const field = d.loc?.at(-1);
        const msg = (d.msg ?? "invalid").replace(/^Value error, /, "");
        return typeof field === "string" && field !== "body" ? `${field.replace(/_/g, " ")}: ${msg}` : msg;
      })
      .join("; ");
  }
  return fallback;
}

async function request<T>(path: string, init: RequestInit & { json?: unknown } = {}): Promise<T> {
  const { json, ...rest } = init;
  const headers = new Headers(rest.headers);
  const token = getToken();
  if (token) headers.set("Authorization", `Bearer ${token}`);
  if (json !== undefined) headers.set("Content-Type", "application/json");

  const res = await fetch(`${API_URL}${path}`, {
    ...rest,
    headers,
    body: json !== undefined ? JSON.stringify(json) : rest.body,
  });
  if (!res.ok) {
    let detail: unknown = res.statusText;
    try {
      detail = (await res.json()).detail ?? detail;
    } catch {}
    if (res.status === 401) setToken(null);
    throw new ApiError(res.status, describe(detail, "Request failed"));
  }
  return (res.status === 204 ? undefined : await res.json()) as T;
}

// Small delay in demo mode so loading states are exercised like the real thing.
const later = <T>(value: T, ms = 250) =>
  new Promise<T>((resolve) => setTimeout(() => resolve(value), ms));

function demoCall<T>(fn: () => T): Promise<T> {
  try {
    return later(fn());
  } catch (e) {
    return Promise.reject(new ApiError(400, e instanceof Error ? e.message : String(e)));
  }
}

export async function login(email: string, password: string): Promise<void> {
  if (DEMO) {
    if (!email || !password) throw new ApiError(401, "Enter an email and password");
    setToken("demo");
    return;
  }
  const body = new URLSearchParams({ username: email, password });
  const { access_token } = await request<{ access_token: string }>("/auth/login", {
    method: "POST",
    body,
  });
  setToken(access_token);
}

export async function registerSeller(body: SellerSignup): Promise<void> {
  if (DEMO) {
    await demoCall(() => demo.demoRegister(body));
    setToken("demo");
    return;
  }
  const { access_token } = await request<{ access_token: string }>("/auth/register/seller", {
    method: "POST",
    json: body,
  });
  setToken(access_token);
}

export function logout() {
  setToken(null);
}

export const api = {
  me: (): Promise<Me> => (DEMO ? later(demo.demoMe()) : request("/auth/me")),

  dashboard: (): Promise<Dashboard> =>
    DEMO ? later(demo.demoDashboard()) : request("/forecast/dashboard"),

  lots: (): Promise<Lot[]> => (DEMO ? later(demo.demoLots()) : request("/listings")),

  lot: (id: string): Promise<Lot> =>
    DEMO ? demoCall(() => demo.demoLot(id)) : request(`/listings/${id}`),

  createLot: (body: NewLot): Promise<Lot> =>
    DEMO ? demoCall(() => demo.demoCreateLot(body)) : request("/listings", { method: "POST", json: body }),

  changePrice: (id: string, price: number, source: "seller" | "model"): Promise<Lot> =>
    DEMO
      ? demoCall(() => demo.demoChangePrice(id, price))
      : request(`/listings/${id}/price`, { method: "PATCH", json: { price, source } }),

  rescore: async (id: string): Promise<Lot> => {
    if (DEMO) return demoCall(() => demo.demoRescore(id));
    await request(`/forecast/score/${id}`, { method: "POST" });
    return api.lot(id);
  },

  searchDrugs: (q: string): Promise<Drug[]> =>
    DEMO
      ? later(demo.demoSearchDrugs(q), 120)
      : request(`/drugs?q=${encodeURIComponent(q)}`),

  createDrug: (body: NewDrug): Promise<Drug> =>
    DEMO ? demoCall(() => demo.demoCreateDrug(body)) : request("/drugs", { method: "POST", json: body }),

  alerts: (includeAcknowledged = false): Promise<Alert[]> =>
    DEMO
      ? later(demo.demoAlerts(includeAcknowledged))
      : request(`/alerts?include_acknowledged=${includeAcknowledged}`),

  ack: (id: string): Promise<Alert> =>
    DEMO ? demoCall(() => demo.demoAck(id)) : request(`/alerts/${id}/ack`, { method: "POST" }),
};
