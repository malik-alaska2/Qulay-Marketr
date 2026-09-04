/* ============================================================================
   Qulay Market — oddiy statistika (Vercel serverless function).

   POST /api/stats   — hodisa yoziladi. Tanasi (JSON yoki matn):
       { "ev": "view", "id": "3", "vid": "…", "lang": "uz" }   e'lon ochildi
       { "ev": "open", "vid": "…", "lang": "uz" }              ilova ochildi
   GET  /api/stats   — jamlangan raqamlar: ilova, bot va har bir e'lon bo'yicha.

   Saqlash — Upstash Redis (api/_store.js). Xotira ulanmagan bo'lsa hammasi
   nol qaytadi va sayt xuddi avvalgidek ishlayveradi.

   Nima sanaladi:
     hits   — nechi marta ochilgan (bir odam 10 daqiqada bir marta sanaladi)
     people — nechta har xil odam ochgan (HyperLogLog, shaxsiy ma'lumot emas)
   ========================================================================== */

const store = require("./_store");

const P = "qm:";                 /* barcha kalitlar shu bilan boshlanadi */
const SEEN_SEC = 600;            /* bir odam — 10 daqiqada bitta ochilish */
const DAY_KEEP = 60 * 60 * 24 * 120;  /* kunlik raqamlar 120 kun saqlanadi */
const DAYS_OUT = 14;             /* javobda oxirgi 14 kun */
const MAX_ITEMS = 300;

const ok = (v, re) => (re.test(String(v || "")) ? String(v) : "");
const itemId = (v) => ok(String(v).trim(), /^[A-Za-z0-9_-]{1,32}$/);
const visitor = (v) => ok(String(v).trim(), /^[A-Za-z0-9_-]{1,64}$/);
const lang = (v) => (String(v || "").toLowerCase() === "ru" ? "ru" : "uz");
const dayKey = (shift) => new Date(Date.now() - (shift || 0) * 86400000).toISOString().slice(0, 10);

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

/* ------------------------------------------------------------------ yozish */
async function track(ev, id, vid, code) {
  if (!store.ready()) return { ok: true, skipped: "xotira ulanmagan" };

  const target = ev === "view" ? "i" + id : "app";
  /* vid bo'lmasa ham sanaymiz, faqat «odamlar» ga qo'shilmaydi */
  if (vid) {
    const fresh = await store.once(P + "t:" + vid + ":" + target, SEEN_SEC);
    if (!fresh) return { ok: true, skipped: "yaqinda sanalgan" };
  }

  const today = P + "day:" + dayKey(0);
  const cmds = [
    ["INCR", today],
    ["EXPIRE", today, String(DAY_KEEP)],
    ["INCR", P + "app:hits"],
    ["INCR", P + "lang:" + code],
  ];
  if (vid) cmds.push(["PFADD", P + "app:people", vid]);
  if (ev === "view") {
    cmds.push(["SADD", P + "items", id]);
    cmds.push(["INCR", P + "item:" + id + ":hits"]);
    if (vid) cmds.push(["PFADD", P + "item:" + id + ":people", vid]);
  }
  await store.pipeline(cmds);
  return { ok: true };
}

/* ------------------------------------------------------------------ o'qish */
async function summary() {
  const empty = {
    ok: true, store: false, updated: new Date().toISOString(),
    app: { hits: 0, people: 0 }, bot: { starts: 0, people: 0, uz: 0, ru: 0 },
    lang: { uz: 0, ru: 0 }, days: {}, items: {},
  };
  if (!store.ready()) return empty;

  const ids = ((await store.command(["SMEMBERS", P + "items"])) || [])
    .map(itemId).filter(Boolean).slice(0, MAX_ITEMS);

  const days = [];
  for (let i = DAYS_OUT - 1; i >= 0; i--) days.push(dayKey(i));

  const head = [
    ["GET", P + "app:hits"],
    ["PFCOUNT", P + "app:people"],
    ["GET", P + "bot:starts"],
    ["PFCOUNT", P + "bot:people"],
    ["GET", P + "bot:lang:uz"],
    ["GET", P + "bot:lang:ru"],
    ["GET", P + "lang:uz"],
    ["GET", P + "lang:ru"],
  ];
  const cmds = head
    .concat(days.map((d) => ["GET", P + "day:" + d]))
    .concat(ids.flatMap((id) => [["GET", P + "item:" + id + ":hits"], ["PFCOUNT", P + "item:" + id + ":people"]]));

  const out = await store.pipeline(cmds);
  if (!out) return empty;

  const n = store.num;
  const res = {
    ok: true, store: true, updated: new Date().toISOString(),
    app: { hits: n(out[0]), people: n(out[1]) },
    bot: { starts: n(out[2]), people: n(out[3]), uz: n(out[4]), ru: n(out[5]) },
    lang: { uz: n(out[6]), ru: n(out[7]) },
    days: {}, items: {},
  };
  days.forEach((d, i) => { res.days[d] = n(out[head.length + i]); });
  ids.forEach((id, i) => {
    const at = head.length + days.length + i * 2;
    res.items[id] = { hits: n(out[at]), people: n(out[at + 1]) };
  });
  return res;
}

/* ---------------------------------------------------------------- handler */
module.exports = async function handler(req, res) {
  cors(res);
  if (req.method === "OPTIONS") return res.status(204).end();

  if (req.method === "POST") {
    const b = body(req);
    const ev = String(b.ev || "").toLowerCase() === "view" ? "view" : "open";
    const id = itemId(b.id);
    if (ev === "view" && !id) return res.status(200).json({ ok: false, error: "id noto'g'ri" });
    try {
      const out = await track(ev, id, visitor(b.vid), lang(b.lang));
      return res.status(200).json(out);
    } catch (_) {
      return res.status(200).json({ ok: false });
    }
  }

  if (req.method !== "GET") return res.status(405).json({ ok: false });

  try {
    const data = await summary();
    res.setHeader("Cache-Control", "public, max-age=15, s-maxage=30, stale-while-revalidate=120");
    return res.status(200).json(data);
  } catch (_) {
    return res.status(200).json({ ok: false, store: false, app: { hits: 0, people: 0 }, items: {} });
  }
};

module.exports.track = track;
module.exports.summary = summary;
