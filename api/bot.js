/* ============================================================================
   Qulay Market — Telegram bot uchun webhook (Vercel serverless function).

   Bot ikki tilda ishlaydi: o'zbekcha va ruscha.
     /start  → «Tilni tanlang / Выберите язык» + ikkita tugma
     tanlangandan keyin → reklama (surat + matn + tugmalar) shu tilda
     «🌐 Til / Язык» tugmasi orqali istalgan payt almashtiriladi
     /lang   → tilni qaytadan tanlash

   Reklama matni, surati va tugmalari saytning boshqaruv panelida yoziladi va
   catalog.json ichida settings.promo bo'lib saqlanadi. Ruscha varianti —
   settings.promo.ru. Bo'sh qoldirilgan ruscha maydon o'rniga o'zbekchasi
   ishlatiladi.

   Muhit o'zgaruvchilari (Vercel → Settings → Environment Variables):
     BOT_TOKEN        — BotFather bergan token. Majburiy.
     WEBHOOK_SECRET   — ixtiyoriy. setWebhook dagi secret_token bilan bir xil
                        bo'lsa, begona so'rovlar rad etiladi.

   Manzil: https://qulay-market-bot.vercel.app/api/bot
     GET  — holatni ko'rsatadi (token ko'rsatilmaydi).
     GET ?setup=1 — webhook, tavsiflar va buyruqlar ikki tilda o'rnatiladi.
     POST — Telegram yuboradigan update.
   ========================================================================== */

const SITE = "https://malik-alaska2.github.io/Qulay-Marketr/";
const CATALOG = SITE + "catalog.json";
const API = "https://api.telegram.org/bot";

const LANGS = ["uz", "ru"];
const isLang = (v) => LANGS.includes(String(v || ""));

/* Foydalanuvchining Telegram tili → bizdagi til (faqat taxmin uchun) */
const guessLang = (code) => (/^(ru|be|uk|kk|ky|tg|tk)/i.test(String(code || "")) ? "ru" : "uz");

/* Botning o'z matnlari — reklama emas, interfeys */
const UI = {
  ask: "🇺🇿 Tilni tanlang\n🇷🇺 Выберите язык",
  btnUz: "🇺🇿 O‘zbekcha",
  btnRu: "🇷🇺 Русский",
  switch: { uz: "🌐 Til / Язык", ru: "🌐 Язык / Til" },
  chosen: { uz: "O‘zbek tili", ru: "Русский язык" },
};

/* catalog.json da promo bo'lmasa yoki maydonlari bo'sh bo'lsa — shular */
const PROMO_FALLBACK = {
  on: 1,
  photo: "photos/bot-banner.jpg",
  title: "Qulay Market",
  text:
    "Istanbulda kunlik va oylik uy-joy ijarasi, aeroportdan kutib olish va taksi.\n" +
    "Hammasi bitta ilovada — quyidagi tugmani bosing.",
  buttons: "Qulay Market'ni ochish | app",
  /* Botni ochganda, «Start» bosilmasdan turib chatning o'rtasida ko'rinadigan matn */
  about:
    "Istanbulda kunlik va oylik uy-joy ijarasi, aeroportdan kutib olish va taksi.\n\n" +
    "Uy-joy e'lonlari surat va narxlari bilan, transfer esa «qayerdan — qayerga» ko'rinishida — hammasi bitta ilovada.\n\n" +
    "Boshlash uchun pastdagi tugmani bosing.",
  /* Bot profilida va havola ko'rinishida chiqadigan qisqa matn */
  short: "Istanbulda uy-joy ijarasi va aeroport transferi — bitta ilovada.",
  ru: {
    title: "Qulay Market",
    text:
      "Посуточная и помесячная аренда жилья в Стамбуле, встреча в аэропорту и такси.\n" +
      "Всё в одном приложении — нажмите кнопку ниже.",
    buttons: "Открыть Qulay Market | app",
    about:
      "Посуточная и помесячная аренда жилья в Стамбуле, встреча в аэропорту и такси.\n\n" +
      "Объявления с фото и ценами, трансфер — в виде «откуда — куда». Всё в одном приложении.\n\n" +
      "Нажмите кнопку внизу, чтобы начать.",
    short: "Аренда жилья, трансфер и такси в Стамбуле — в одном приложении.",
  },
};

/* --------------------------------------------------------------- yordamchi */
const str = (v, d) => String(v == null ? d : v);

function normPromo(p) {
  p = p && typeof p === "object" ? p : {};
  const ru = p.ru && typeof p.ru === "object" ? p.ru : {};
  const F = PROMO_FALLBACK;
  return {
    on: p.on === 0 || p.on === false || p.on === "0" ? 0 : 1,
    photo: str(p.photo, F.photo).trim(),
    title: str(p.title, F.title).trim(),
    text: str(p.text, F.text),
    buttons: str(p.buttons, F.buttons),
    about: str(p.about, F.about),
    short: str(p.short, F.short),
    ru: {
      title: str(ru.title, F.ru.title).trim(),
      text: str(ru.text, F.ru.text),
      buttons: str(ru.buttons, F.ru.buttons),
      about: str(ru.about, F.ru.about),
      short: str(ru.short, F.ru.short),
    },
  };
}

/* Tanlangan tildagi reklama. Ruscha maydon bo'sh bo'lsa — o'zbekchasi olinadi. */
function promoFor(promo, lang) {
  const pick = (key) => {
    if (lang === "ru") {
      const v = String((promo.ru && promo.ru[key]) || "").trim();
      if (v) return promo.ru[key];
    }
    return promo[key];
  };
  return {
    on: promo.on,
    photo: promo.photo,
    title: pick("title"),
    text: pick("text"),
    buttons: pick("buttons"),
    about: pick("about"),
    short: pick("short"),
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
   https://… → oddiy havola, @nik yoki t.me/nik → Telegram profili.
   Mini app havolasiga tanlangan til (lang) ham qo'shiladi. */
function buildKeyboard(text, lang) {
  const code = isLang(lang) ? lang : "uz";
  const rows = String(text || "")
    .split("\n")
    .map((l) => l.trim())
    .filter(Boolean)
    .map((line) => {
      const i = line.indexOf("|");
      const label = (i < 0 ? line : line.slice(0, i)).trim();
      let target = (i < 0 ? "app" : line.slice(i + 1)).trim();
      if (!label) return null;

      if (/^app([#?]|$)/i.test(target)) {
        let tail = target.slice(3);
        /* Telegram web_app manzilining # qismini o'zining ma'lumotlari bilan
           almashtiradi, shuning uchun bo'lim so'rov parametri bilan uzatiladi */
        if (tail.startsWith("#")) tail = "?p=" + tail.slice(1);
        /* Telegram mini-appni keshlab qo'yadi va eski nusxani ko'rsatishi mumkin.
           Har soatda o'zgaradigan «v» parametri yangi versiyani majburan yuklatadi. */
        const stamp = Math.floor(Date.now() / 3600000).toString(36);
        const sep = tail.includes("?") ? "&" : "?";
        const url = SITE + tail + sep + "lang=" + code + "&v=" + stamp;
        return [{ text: label, web_app: { url } }];
      }
      if (/^@[\w\d_]+$/.test(target)) target = "https://t.me/" + target.slice(1);
      else if (/^t\.me\//i.test(target)) target = "https://" + target;
      else if (!/^https?:\/\//i.test(target)) return null;
      return [{ text: label, url: target }];
    })
    .filter(Boolean)
    .slice(0, 5);

  /* Oxirgi qator — tilni almashtirish */
  rows.push([{ text: UI.switch[code], callback_data: "lang:ask" }]);
  return { inline_keyboard: rows };
}

function buildMessage(promo) {
  const title = promo.title ? "<b>" + esc(promo.title) + "</b>" : "";
  const body = promo.text ? esc(promo.text) : "";
  return [title, body].filter(Boolean).join("\n\n");
}

const langKeyboard = () => ({
  inline_keyboard: [[
    { text: UI.btnUz, callback_data: "lang:uz" },
    { text: UI.btnRu, callback_data: "lang:ru" },
  ]],
});

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

const askLang = (token, chatId) =>
  tg(token, "sendMessage", { chat_id: chatId, text: UI.ask, reply_markup: langKeyboard() });

/* Rasm bilan yuboriladi; rasm yaroqsiz bo'lsa — oddiy matn bilan qayta urinadi */
async function sendPromo(token, chatId, promo, lang) {
  const one = promoFor(promo, lang);
  const text = buildMessage(one);
  const keyboard = buildKeyboard(one.buttons, lang);
  const photo = absUrl(one.photo);

  if (photo) {
    const out = await tg(token, "sendPhoto", {
      chat_id: chatId,
      photo,
      caption: text.slice(0, 1024),
      parse_mode: "HTML",
      reply_markup: keyboard,
    });
    if (out && out.ok) return out;
  }
  return tg(token, "sendMessage", {
    chat_id: chatId,
    text: text.slice(0, 4096) || PROMO_FALLBACK.text,
    parse_mode: "HTML",
    disable_web_page_preview: true,
    reply_markup: keyboard,
  });
}

/* Shu funksiyaning o'z manzili — so'rov kelgan domendan olinadi */
function hookUrl(req) {
  const h = (req.headers && (req.headers["x-forwarded-host"] || req.headers.host)) || "";
  return h ? "https://" + h + "/api/bot" : "";
}

/* ---------------------------------------------------------- ikki tilli setup */
async function setupAll(token, hook, secret, promo) {
  const uz = promoFor(promo, "uz");
  const ru = promoFor(promo, "ru");
  const cmdUz = [
    { command: "start", description: "Boshlash" },
    { command: "lang", description: "Tilni o‘zgartirish / Сменить язык" },
  ];
  const cmdRu = [
    { command: "start", description: "Начать" },
    { command: "lang", description: "Сменить язык / Tilni o‘zgartirish" },
  ];
  const [hookOut, dUz, dRu, sUz, sRu, cUz, cRu] = await Promise.all([
    tg(token, "setWebhook", {
      url: hook,
      allowed_updates: ["message", "callback_query"],
      drop_pending_updates: true,
      ...(secret ? { secret_token: secret } : {}),
    }),
    tg(token, "setMyDescription", { description: uz.about.slice(0, 512) }),
    tg(token, "setMyDescription", { description: ru.about.slice(0, 512), language_code: "ru" }),
    tg(token, "setMyShortDescription", { short_description: uz.short.slice(0, 120) }),
    tg(token, "setMyShortDescription", { short_description: ru.short.slice(0, 120), language_code: "ru" }),
    tg(token, "setMyCommands", { commands: cmdUz }),
    tg(token, "setMyCommands", { commands: cmdRu, language_code: "ru" }),
  ]);
  return {
    setWebhook: hookOut,
    description: { uz: Boolean(dUz && dUz.ok), ru: Boolean(dRu && dRu.ok) },
    shortDescription: { uz: Boolean(sUz && sUz.ok), ru: Boolean(sRu && sRu.ok) },
    commands: { uz: Boolean(cUz && cUz.ok), ru: Boolean(cRu && cRu.ok) },
  };
}

/* ---------------------------------------------------------------- handler */
module.exports = async function handler(req, res) {
  const token = process.env.BOT_TOKEN || "";
  const secret = process.env.WEBHOOK_SECRET || "";

  /* GET — holat; ?setup=1 bo'lsa webhook o'zini o'zi ro'yxatdan o'tkazadi.
     Manzil har doim shu funksiyaning o'zi, shuning uchun uni begona joyga
     burib yuborib bo'lmaydi. Token brauzerga hech qachon chiqmaydi. */
  if (req.method !== "POST") {
    const hook = hookUrl(req);
    const base = {
      ok: true,
      service: "qulay-market-bot",
      tokenSet: Boolean(token),
      secretSet: Boolean(secret),
      webhook: hook,
      site: SITE,
      languages: LANGS,
      build: "2026-09-03-bilingual",
    };
    if (!token) return res.status(200).json({ ...base, hint: "Vercel'da token ko'rsatilmagan" });

    const wantSetup = /[?&]setup=/.test(String(req.url || ""));
    try {
      if (wantSetup) {
        const promo = await loadPromo();
        const out = await setupAll(token, hook, secret, promo);
        return res.status(200).json({ ...base, ...out });
      }
      const [info, me] = await Promise.all([
        tg(token, "getWebhookInfo", {}),
        tg(token, "getMe", {}),
      ]);
      return res.status(200).json({
        ...base,
        bot: me && me.result ? "@" + me.result.username : null,
        current: info && info.result
          ? {
              url: info.result.url || "",
              pending: info.result.pending_update_count || 0,
              lastError: info.result.last_error_message || null,
            }
          : null,
      });
    } catch (_) {
      return res.status(200).json({ ...base, error: "Telegram javob bermadi" });
    }
  }

  if (secret && req.headers["x-telegram-bot-api-secret-token"] !== secret) {
    return res.status(401).json({ ok: false });
  }
  if (!token) return res.status(200).json({ ok: true, skipped: "BOT_TOKEN yo'q" });

  let update = req.body;
  if (typeof update === "string") { try { update = JSON.parse(update); } catch { update = {}; } }
  update = update && typeof update === "object" ? update : {};

  /* ---- tugma bosildi: til tanlandi yoki tilni qaytadan so'rash ---- */
  const cq = update.callback_query;
  if (cq) {
    const chatId = cq.message && cq.message.chat && cq.message.chat.id;
    const data = String(cq.data || "");
    const lang = data.slice(5);
    try {
      if (data === "lang:ask") {
        await tg(token, "answerCallbackQuery", { callback_query_id: cq.id });
        if (chatId) await askLang(token, chatId);
      } else if (isLang(lang)) {
        await tg(token, "answerCallbackQuery", { callback_query_id: cq.id, text: UI.chosen[lang] });
        if (chatId) {
          /* Til so'ragan xabar endi keraksiz — o'chiriladi */
          if (cq.message && cq.message.message_id) {
            await tg(token, "deleteMessage", { chat_id: chatId, message_id: cq.message.message_id });
          }
          const promo = await loadPromo();
          if (promo.on) await sendPromo(token, chatId, promo, lang);
        }
      } else {
        await tg(token, "answerCallbackQuery", { callback_query_id: cq.id });
      }
    } catch (_) {}
    return res.status(200).json({ ok: true });
  }

  /* ---- oddiy xabar ---- */
  const msg = update.message || update.edited_message || null;
  const chatId = msg && msg.chat && msg.chat.id;

  /* Telegram javobni tez kutadi — noma'lum update turlari shunchaki tashlanadi */
  if (!chatId || (msg.chat.type && msg.chat.type !== "private")) {
    return res.status(200).json({ ok: true });
  }

  const text = String(msg.text || "").trim();
  const cmd = (text.match(/^\/([a-zA-Zа-яА-Я_]+)/) || [])[1] || "";
  const wantsAsk = /^(start|lang|til|language|yazyk)$/i.test(cmd) || !text;

  try {
    if (wantsAsk) {
      await askLang(token, chatId);
    } else {
      /* Buyruq emas — Telegram tiliga qarab taxmin qilamiz,
         tugma orqali istalgan payt almashtirsa bo'ladi */
      const promo = await loadPromo();
      if (promo.on) await sendPromo(token, chatId, promo, guessLang(msg.from && msg.from.language_code));
    }
  } catch (_) {}

  return res.status(200).json({ ok: true });
};

/* Testlar uchun */
module.exports.normPromo = normPromo;
module.exports.promoFor = promoFor;
module.exports.buildKeyboard = buildKeyboard;
module.exports.buildMessage = buildMessage;
module.exports.absUrl = absUrl;
module.exports.guessLang = guessLang;
module.exports.PROMO_FALLBACK = PROMO_FALLBACK;
module.exports.SITE = SITE;
