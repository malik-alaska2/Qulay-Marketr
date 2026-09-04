/* ============================================================================
   Upstash Redis (REST) — hisoblagichlar uchun kichik yordamchi.

   Ulanish Vercel Marketplace orqali qilinadi (Storage → Upstash Redis), shunda
   muhit o'zgaruvchilari loyihaga o'zi qo'shiladi. Ikkala nomlanish ham qabul
   qilinadi: KV_REST_API_URL / KV_REST_API_TOKEN yoki
   UPSTASH_REDIS_REST_URL / UPSTASH_REDIS_REST_TOKEN.

   Xotira ulanmagan bo'lsa — hech narsa buzilmaydi: yozish jimgina o'tkazib
   yuboriladi, o'qishda esa nollar qaytadi.
   ========================================================================== */

const URL_ENV = ["KV_REST_API_URL", "UPSTASH_REDIS_REST_URL", "REDIS_REST_URL"];
const TOKEN_ENV = ["KV_REST_API_TOKEN", "UPSTASH_REDIS_REST_TOKEN", "REDIS_REST_TOKEN"];

const fromEnv = (names) => {
  for (const n of names) {
    const v = process.env[n];
    if (v && String(v).trim()) return String(v).trim();
  }
  return "";
};

const baseUrl = () => fromEnv(URL_ENV).replace(/\/+$/, "");
const authToken = () => fromEnv(TOKEN_ENV);
const ready = () => Boolean(baseUrl() && authToken());

/* Bir nechta buyruq — bitta so'rovda */
async function pipeline(commands) {
  const cmds = (commands || []).filter(Boolean);
  if (!ready() || !cmds.length) return null;
  try {
    const res = await fetch(baseUrl() + "/pipeline", {
      method: "POST",
      headers: { Authorization: "Bearer " + authToken(), "Content-Type": "application/json" },
      body: JSON.stringify(cmds.map((c) => c.map(String))),
    });
    if (!res.ok) return null;
    const out = await res.json();
    if (!Array.isArray(out)) return null;
    return out.map((r) => (r && typeof r === "object" && "result" in r ? r.result : null));
  } catch (_) {
    return null;
  }
}

async function command(cmd) {
  const out = await pipeline([cmd]);
  return out ? out[0] : null;
}

/* Bir xil hodisa qayta-qayta sanalmasin: kalit band bo'lsa — false */
async function once(key, seconds) {
  if (!ready()) return false;
  const out = await command(["SET", key, "1", "NX", "EX", String(seconds || 60)]);
  return out === "OK" || (out && out.result === "OK");
}

const num = (v) => {
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
};

module.exports = { ready, pipeline, command, once, num };
