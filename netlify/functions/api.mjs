// IIC Event Tracker API. Stores edits in Netlify Blobs and checks the password on every request.
import { createHash, timingSafeEqual } from "node:crypto";
import { getStore } from "@netlify/blobs";
import { BASE } from "./base.mjs";

const DEPTS = ["DCA", "CM", "MBA", "IIC", "NSS", "LANG"];
const STATUSES = ["Pending", "Scheduled", "Completed", "Postponed"];
const ID_RE = /^[A-Za-z0-9_-]{1,80}$/;
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

const sha = (s) => createHash("sha256").update(String(s)).digest();
const safeEq = (a, b) => timingSafeEqual(sha(a), sha(b));
const clip = (v, n) => String(v ?? "").trim().slice(0, n);

export async function handle(req, store, password) {
  const json = (o, status = 200) =>
    new Response(JSON.stringify(o), {
      status,
      headers: { "content-type": "application/json", "cache-control": "no-store" },
    });
  const url = new URL(req.url);
  const parts = url.pathname.replace(/^\/api\/?/, "").split("/").filter(Boolean);
  const route = parts[0];

  if (route === "login" && req.method === "POST") {
    const b = await req.json().catch(() => ({}));
    return safeEq(b.password || "", password) ? json({ ok: true }) : json({ error: "Wrong password" }, 401);
  }
  if (!safeEq(req.headers.get("x-iic-key") || "", password)) return json({ error: "Unauthorized" }, 401);

  if (route === "state" && req.method === "GET") {
    const readAll = async (prefix) => {
      const { blobs } = await store.list({ prefix });
      const out = {};
      await Promise.all(
        blobs.map(async (b) => {
          const v = await store.get(b.key, { type: "json" });
          if (v) out[b.key.slice(prefix.length)] = v;
        })
      );
      return out;
    };
    const [updates, customs] = await Promise.all([readAll("u/"), readAll("c/")]);
    return json({ base: BASE, updates, customs });
  }

  if (route === "event" && req.method === "PUT" && ID_RE.test(parts[1] || "")) {
    const id = parts[1];
    const known = BASE.some((e) => e.id === id) || (await store.get("c/" + id, { type: "json" }));
    if (!known) return json({ error: "Unknown event" }, 404);
    const b = await req.json().catch(() => ({}));
    const record = {
      faculty: clip(b.faculty, 200),
      date: DATE_RE.test(b.date || "") ? b.date : "",
      rem: clip(b.rem, 1000),
      updatedAt: new Date().toISOString(),
    };
    if (STATUSES.includes(b.status)) record.status = b.status;
    await store.setJSON("u/" + id, record);
    return json({ ok: true, record });
  }

  if (route === "custom" && req.method === "POST") {
    const b = await req.json().catch(() => ({}));
    const title = clip(b.title, 300);
    if (!title || !DEPTS.includes(b.dept)) return json({ error: "Event name and department are required" }, 400);
    const id = "x" + Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
    const record = {
      title,
      dept: b.dept,
      q: Number(b.q) === 2 ? 2 : 1,
      club: clip(b.club, 120),
      incharge: clip(b.incharge, 200),
      createdAt: new Date().toISOString(),
    };
    await store.setJSON("c/" + id, record);
    return json({ ok: true, id, record });
  }

  if (route === "custom" && req.method === "DELETE" && ID_RE.test(parts[1] || "")) {
    await store.delete("c/" + parts[1]);
    await store.delete("u/" + parts[1]);
    return json({ ok: true });
  }

  return json({ error: "Not found" }, 404);
}

export default async (req) => {
  const password = process.env.IIC_PASSWORD;
  if (!password)
    return new Response(JSON.stringify({ error: "IIC_PASSWORD is not set in Netlify" }), {
      status: 500,
      headers: { "content-type": "application/json" },
    });
  return handle(req, getStore({ name: "iic-tracker", consistency: "strong" }), password);
};

export const config = { path: "/api/*" };
