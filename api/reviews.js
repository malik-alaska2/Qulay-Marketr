/* ============================================================================
   Qulay Market — sharhlar (Vercel serverless function).

   Odamlar sayt orqali sharh qoldiradi, sharh shu yerga — «qutiga» tushadi va
   saytda hali ko'rinmaydi. Do'kon egasi boshqaruv panelidagi «Sharhlar»
   bo'limida uni ko'radi va «Chiqarish» tugmasini bosadi: sharh catalog.json
   ichiga yoziladi va shundan keyin hammaga ko'rinadi. Rad etilgani o'chadi.

   POST /api/reviews
       { "target": "taxi", "rating": 5, "name": "Aziz", "text": "…",
         "vid": "…", "lang": "uz" }            — yangi sharh qutiga tushadi
       { "op": "drop", "ids": ["r1","r2"] }    — qutidan o'chirish (panel)
   GET  /api/reviews                            — qutidagi sharhlar (panel)

   target: "taxi" — transfer/taksi xizmati, "uy" — uy-joy xizmati umuman,
           "item-3" — 3-raqamli e'lon.

   Saqlash — Upstash Redis (api/_store.js), statistika bilan bir xotira.
   Xotira ulanmagan bo'lsa sayt ishlayveradi, faqat sharh yuborib bo'lmaydi.

   Ixtiyoriy himoya: Vercel'da REVIEWS_KEY muhit o'zgaruvchisi qo'yilsa,
   qutini o'qish va tozalash faqat o'sha kalit bilan bo'ladi.
   ========================================================================== */

const store = require("./_store");

const BOX = "qm:rv:box";                 /* qutidagi sharhlar — ro'yxat */
const LIM = "qm:rv:lim:";                /* bir odam — bir kunda bir sharh */
const LIMIT_SEC = 60 * 60 * 24;
const MAX_BOX = 300;                     /* qutida ko'pi bilan shuncha sharh */
const NAME_MAX = 40;
const TEXT_MAX = 700;

const clean = (v, max) => String(v == null ? "" : v)
  .replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g, "")
  .replace(/\r\n?/g, "\n")
  .replace(/\n{3,}/g, "\n\n")
  .replace(/[ \t]+/g, " ")
  .trim()
  .slice(0, max);

const target = (v) => (/^(taxi|uy|item-\d{1,9})$/.test(String(v || "").trim()) ? String(v).trim() : "");
const rating = (v) => { const n = Math.round(Number(v)); return n >= 1 && n <= 5 ? n : 0; };
const visitor = (v) => (/^[A-Za-z0-9_-]{1,64}$/.test(String(v || "").trim()) ? String(v).trim() : "");
const lang = (v) => (String(v || "").toLowerCase() === "ru" ? "ru" : "uz");
const newId = () => "r" + Date.now().toString(36) + Math.random().toString(36).slice(2, 7);

function cors(res) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET,POST,OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");
  res.setHeader("Access-Control-Max-Age", "86400");
}

function body(req) {
  let b = req.body;
  if (b == null) return {};
  if (typeof b === "string") { try { b = JSON.parse(b); } catch { return {}; } }
  if (Buffer.isBuffer(b)) { try { b = JSON.parse(b.toString("utf8")); } catch { return {}; } }
  return b && typeof b === "object" ? b : {};
}

/* Kalit qo'yilgan bo'lsa — tekshiramiz, qo'yilmagan bo'lsa hamma o'qiy oladi */
function keyOk(req, extra) {
  const need = String(process.env.REVIEWS_KEY || "").trim();
  if (!need) return true;
  let got = String((extra && extra.key) || "");
  if (!got) { try { got = String(new URL(req.url, "http://x").searchParams.get("key") || ""); } catch (_) {} }
  return got === need;
}

/* ------------------------------------------------------------------ yozish */
async function add(data) {
  if (!store.ready()) return { ok: false, error: "xotira ulanmagan" };

  const t = target(data.target);
  const r = rating(data.rating);
  const text = clean(data.text, TEXT_MAX);
  if (!t) return { ok: false, error: "bo'lim noto'g'ri" };
  if (!r) return { ok: false, error: "baho 1 dan 5 gacha" };
  if (text.length < 2) return { ok: false, error: "sharh matni bo'sh" };

  const vid = visitor(data.vid);
  if (vid) {
    const fresh = await store.once(LIM + vid + ":" + t, LIMIT_SEC);
    if (!fresh) return { ok: false, error: "takror" };
  }

  const review = {
    id: newId(),
    target: t,
    rating: r,
    name: clean(data.name, NAME_MAX),
    text,
    lang: lang(data.lang),
    date: new Date().toISOString().slice(0, 10),
  };

  const out = await store.pipeline([
    ["LPUSH", BOX, JSON.stringify(review)],
    ["LTRIM", BOX, "0", String(MAX_BOX - 1)],
  ]);
  if (!out) return { ok: false, error: "saqlanmadi" };
  return { ok: true, id: review.id };
}

/* ------------------------------------------------------------------ o'qish */
async function box() {
  if (!store.ready()) return { ok: true, store: false, pending: [] };
  const raw = (await store.command(["LRANGE", BOX, "0", String(MAX_BOX - 1)])) || [];
  const pending = [];
  raw.forEach((s) => {
    try {
      const o = JSON.parse(s);
      if (o && o.id && target(o.target)) pending.push(o);
    } catch (_) {}
  });
  return { ok: true, store: true, pending };
}

/* --------------------------------------------------------------- tozalash */
async function drop(ids) {
  if (!store.ready()) return { ok: false, error: "xotira ulanmagan" };
  const kill = new Set((Array.isArray(ids) ? ids : []).map(String));
  if (!kill.size) return { ok: true, dropped: 0 };

  const raw = (await store.command(["LRANGE", BOX, "0", String(MAX_BOX - 1)])) || [];
  const keep = [];
  let dropped = 0;
  raw.forEach((s) => {
    let o = null;
    try { o = JSON.parse(s); } catch (_) {}
    if (o && kill.has(String(o.id))) { dropped++; return; }
    keep.push(s);
  });
  if (!dropped) return { ok: true, dropped: 0 };

  const cmds = [["DEL", BOX]];
  /* ro'yxat LPUSH bilan to'ldirilgan, tartib saqlanishi uchun RPUSH */
  if (keep.length) cmds.push(["RPUSH", BOX].concat(keep));
  const out = await store.pipeline(cmds);
  if (!out) return { ok: false, error: "tozalanmadi" };
  return { ok: true, dropped };
}

/* ---------------------------------------------------------------- handler */
module.exports = async function handler(req, res) {
  cors(res);
  if (req.method === "OPTIONS") return res.status(204).end();

  if (req.method === "POST") {
    const b = body(req);
    try {
      if (String(b.op || "") === "drop") {
        if (!keyOk(req, b)) return res.status(200).json({ ok: false, error: "kalit noto'g'ri" });
        return res.status(200).json(await drop(b.ids));
      }
      return res.status(200).json(await add(b));
    } catch (_) {
      return res.status(200).json({ ok: false, error: "xatolik" });
    }
  }

  if (req.method !== "GET") return res.status(405).json({ ok: false });

  try {
    if (!keyOk(req, null)) return res.status(200).json({ ok: false, error: "kalit noto'g'ri", pending: [] });
    res.setHeader("Cache-Control", "no-store");
    return res.status(200).json(await box());
  } catch (_) {
    return res.status(200).json({ ok: false, store: false, pending: [] });
  }
};

module.exports.add = add;
module.exports.box = box;
module.exports.drop = drop;
