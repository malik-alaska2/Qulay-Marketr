/* ============================================================================
   Qulay Market — Telegram bot uchun webhook (Vercel serverless function).

   Vazifasi bitta: bot chatiga kirilganda (/start yoki istalgan xabar) reklama
   yuborish. Reklama matni, surati va tugmalari saytning boshqaruv panelida
   yoziladi va catalog.json ichida settings.promo bo'lib saqlanadi —
   bu faylni o'zgartirish shart emas.

   Muhit o'zgaruvchilari (Vercel → Settings → Environment Variables):
     BOT_TOKEN        — BotFather bergan token. Majburiy.
     WEBHOOK_SECRET   — ixtiyoriy. setWebhook da secret_token bilan bir xil
                        bo'lsa, begona so'rovlar rad etiladi.

   Manzil: https://qulay-marketr.vercel.app/api/bot
     GET  — holatni ko'rsatadi (token ko'rsatilmaydi).
     POST — Telegram yuboradigan update.
   ========================================================================== */

const SITE = "https://malik-alaska2.github.io/Qulay-Marketr/";
const CATALOG = SITE + "catalog.json";
const API = "https://api.telegram.org/bot";

/* catalog.json da promo bo'lmasa yoki maydonlari bo'sh bo'lsa — shular */
const PROMO_FALLBACK = {
  on: 1,
  photo: "",
  title: "Qulay Market",
  text:
    "Istanbulda kunlik va oylik uy-joy ijarasi, aeroport transferi va taksi.\n" +
    "Kerakli bo'limni tanlang — hammasi shu yerda.",
  buttons: "Katalogni ochish | app\nTransfer buyurtma | app#transfer",
};

/* --------------------------------------------------------------- yordamchi */
const str = (v, d) => String(v == null ? d : v);

function normPromo(p) {
  p = p && typeof p === "object" ? p : {};
  return {
    on: p.on === 0 || p.on === false || p.on === "0" ? 0 : 1,
    photo: str(p.photo, "").trim(),
    title: str(p.title, PROMO_FALLBACK.title).trim(),
    text: str(p.text, PROMO_FALLBACK.text),
    buttons: str(p.buttons, PROMO_FALLBACK.buttons),
  };
}

const esc = (s) =>
  String(s == null ? "" : s).replace(/[&<>]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;" }[c]));

/* "photos/a.jpg" → to'liq manzil; http bilan boshlansa — o'zgarmaydi */
function absUrl(path) {
  const v = String(path || "").trim();
  if (!v) return "";
  if (/^https?:\/\//i.test(v)) return v;
  return SITE + v.replace(/^\/+/, "");
}

/* Tugmalar: har qatorda «matn | havola».
   havola: app → mini app, app#transfer → mini appning shu bo'limi,
   https://… → oddiy havola, @nik yoki t.me/nik → Telegram profili. */
function buildKeyboard(text) {
  const rows = String(text || "")
    .split("\n")
    .map((l) => l.trim())
    .filter(Boolean)
    .map((line) => {
      const i = line.indexOf("|");
      const label = (i < 0 ? line : line.slice(0, i)).trim();
      let target = (i < 0 ? "app" : line.slice(i + 1)).trim();
      if (!label) return null;

      if (/^app(#|$)/i.test(target)) {
        return [{ text: label, web_app: { url: SITE + target.slice(3) } }];
      }
      if (/^@[\w\d_]+$/.test(target)) target = "https://t.me/" + target.slice(1);
      else if (/^t\.me\//i.test(target)) target = "https://" + target;
      else if (!/^https?:\/\//i.test(target)) return null;
      return [{ text: label, url: target }];
    })
    .filter(Boolean)
    .slice(0, 6);

  return rows.length ? { inline_keyboard: rows } : undefined;
}

function buildMessage(promo) {
  const title = promo.title ? "<b>" + esc(promo.title) + "</b>" : "";
  const body = promo.text ? esc(promo.text) : "";
  return [title, body].filter(Boolean).join("\n\n");
}

/* ------------------------------------------------------------------ tarmoq */
async function loadPromo() {
  try {
    const res = await fetch(CATALOG + "?t=" + Date.now(), { cache: "no-store" });
    if (res.ok) {
      const data = await res.json();
      if (data && data.settings) return normPromo(data.settings.promo);
    }
  } catch (_) {}
  return normPromo(null);
}

async function tg(token, method, body) {
  const res = await fetch(API + token + "/" + method, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  return res.json().catch(() => ({ ok: false }));
}

/* Rasm bilan yuboriladi; rasm yaroqsiz bo'lsa — oddiy matn bilan qayta urinadi */
async function sendPromo(token, chatId, promo) {
  const text = buildMessage(promo);
  const keyboard = buildKeyboard(promo.buttons);
  const photo = absUrl(promo.photo);

  if (photo) {
    const out = await tg(token, "sendPhoto", {
      chat_id: chatId,
      photo,
      caption: text.slice(0, 1024),
      parse_mode: "HTML",
      ...(keyboard ? { reply_markup: keyboard } : {}),
    });
    if (out && out.ok) return out;
  }
  return tg(token, "sendMessage", {
    chat_id: chatId,
    text: text.slice(0, 4096) || PROMO_FALLBACK.text,
    parse_mode: "HTML",
    disable_web_page_preview: true,
    ...(keyboard ? { reply_markup: keyboard } : {}),
  });
}

/* ---------------------------------------------------------------- handler */
module.exports = async function handler(req, res) {
  const token = process.env.BOT_TOKEN || "";

  if (req.method !== "POST") {
    return res.status(200).json({
      ok: true,
      service: "qulay-market-bot",
      tokenSet: Boolean(token),
      secretSet: Boolean(process.env.WEBHOOK_SECRET),
      site: SITE,
    });
  }

  const secret = process.env.WEBHOOK_SECRET || "";
  if (secret && req.headers["x-telegram-bot-api-secret-token"] !== secret) {
    return res.status(401).json({ ok: false });
  }
  if (!token) return res.status(200).json({ ok: true, skipped: "BOT_TOKEN yo'q" });

  let update = req.body;
  if (typeof update === "string") { try { update = JSON.parse(update); } catch { update = {}; } }
  const msg = (update && (update.message || update.edited_message)) || null;
  const chatId = msg && msg.chat && msg.chat.id;

  /* Telegram javobni tez kutadi — noma'lum update turlari shunchaki tashlanadi */
  if (!chatId || (msg.chat.type && msg.chat.type !== "private")) {
    return res.status(200).json({ ok: true });
  }

  try {
    const promo = await loadPromo();
    if (promo.on) await sendPromo(token, chatId, promo);
  } catch (_) {}

  return res.status(200).json({ ok: true });
};

/* Testlar uchun */
module.exports.normPromo = normPromo;
module.exports.buildKeyboard = buildKeyboard;
module.exports.buildMessage = buildMessage;
module.exports.absUrl = absUrl;
module.exports.PROMO_FALLBACK = PROMO_FALLBACK;
module.exports.SITE = SITE;
