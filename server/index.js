const crypto = require("crypto");
const fs = require("fs");
const path = require("path");
const express = require("express");
const OpenAI = require("openai");
const dotenv = require("dotenv");

dotenv.config();

const app = express();
app.set("trust proxy", 1);
app.use(express.json({ limit: "1mb" }));

const PORT = Number(process.env.PORT || process.env.SERVER_PORT || 8787);
const SERVER_BASE_URL = process.env.SERVER_BASE_URL || `http://localhost:${PORT}`;
const SESSION_COOKIE_NAME = process.env.SESSION_COOKIE_NAME || "jobradar_sid";
const SESSION_TTL_MS = 1000 * 60 * 60 * 24 * 7;
const OPENAI_MODEL = process.env.OPENAI_MODEL || "gpt-4.1-mini";
const DIST_DIR = path.join(__dirname, "..", "dist");
const HAS_DIST_BUILD = fs.existsSync(path.join(DIST_DIR, "index.html"));
const COOKIE_SECURE = process.env.COOKIE_SECURE
  ? String(process.env.COOKIE_SECURE).toLowerCase() === "true"
  : process.env.NODE_ENV === "production";
const APP_BASE_URL_ENV = process.env.APP_BASE_URL || process.env.FRONTEND_BASE_URL || "";
const OPENAI_API_KEY = process.env.OPENAI_API_KEY || "";

function parseGoogleOAuthCredentialsJson(rawValue) {
  if (!rawValue) return {};
  try {
    const parsed = JSON.parse(rawValue);
    if (parsed?.web) return parsed.web;
    if (parsed?.installed) return parsed.installed;
    return parsed;
  } catch (_error) {
    return {};
  }
}

const GOOGLE_OAUTH_CREDENTIALS = parseGoogleOAuthCredentialsJson(
  process.env.GOOGLE_OAUTH_CREDENTIALS_JSON
);
const GOOGLE_CLIENT_ID =
  process.env.GOOGLE_CLIENT_ID ||
  GOOGLE_OAUTH_CREDENTIALS.client_id ||
  "";
const GOOGLE_CLIENT_SECRET =
  process.env.GOOGLE_CLIENT_SECRET ||
  GOOGLE_OAUTH_CREDENTIALS.client_secret ||
  "";
const GOOGLE_REDIRECT_URI = process.env.GOOGLE_REDIRECT_URI || "";

const MICROSOFT_CLIENT_ID =
  process.env.MICROSOFT_CLIENT_ID ||
  process.env.MS_CLIENT_ID ||
  "";
const MICROSOFT_CLIENT_SECRET =
  process.env.MICROSOFT_CLIENT_SECRET ||
  process.env.MS_CLIENT_SECRET ||
  "";
const MICROSOFT_TENANT_ID =
  process.env.MICROSOFT_TENANT_ID ||
  process.env.MS_TENANT_ID ||
  "common";
const MICROSOFT_REDIRECT_URI =
  process.env.MICROSOFT_REDIRECT_URI ||
  process.env.MS_REDIRECT_URI ||
  "";

const sessions = new Map();
let openaiClient = null;

function parseCookies(cookieHeader = "") {
  const out = {};
  const pairs = cookieHeader.split(";");
  for (const pair of pairs) {
    const idx = pair.indexOf("=");
    if (idx < 0) continue;
    const key = pair.slice(0, idx).trim();
    const value = pair.slice(idx + 1).trim();
    if (!key) continue;
    out[key] = decodeURIComponent(value);
  }
  return out;
}

function serializeCookie(name, value, options = {}) {
  const parts = [`${name}=${encodeURIComponent(value)}`];
  parts.push(`Path=${options.path || "/"}`);
  if (options.httpOnly !== false) parts.push("HttpOnly");
  parts.push(`SameSite=${options.sameSite || "Lax"}`);
  if (options.maxAge) parts.push(`Max-Age=${Math.floor(options.maxAge / 1000)}`);
  if (options.secure) parts.push("Secure");
  return parts.join("; ");
}

function newSession() {
  return {
    createdAt: Date.now(),
    lastSeenAt: Date.now(),
    oauthState: {},
    google: null,
    outlook: null,
  };
}

function getOrCreateSession(req, res) {
  const cookies = parseCookies(req.headers.cookie || "");
  let sid = cookies[SESSION_COOKIE_NAME];
  let session = sid ? sessions.get(sid) : null;

  const isExpired = session && Date.now() - session.lastSeenAt > SESSION_TTL_MS;
  if (!sid || !session || isExpired) {
    sid = crypto.randomUUID();
    session = newSession();
    sessions.set(sid, session);
    res.setHeader(
      "Set-Cookie",
      serializeCookie(SESSION_COOKIE_NAME, sid, {
        path: "/",
        httpOnly: true,
        sameSite: "Lax",
        maxAge: SESSION_TTL_MS,
        secure: COOKIE_SECURE,
      })
    );
  }

  session.lastSeenAt = Date.now();
  req.sessionId = sid;
  req.session = session;

  if (Math.random() < 0.05) {
    const cutoff = Date.now() - SESSION_TTL_MS;
    for (const [id, value] of sessions.entries()) {
      if (value.lastSeenAt < cutoff) sessions.delete(id);
    }
  }
}

app.use((req, res, next) => {
  getOrCreateSession(req, res);
  next();
});

function missingOAuthConfig(provider) {
  if (provider === "google") {
    return !GOOGLE_CLIENT_ID || !GOOGLE_CLIENT_SECRET;
  }
  return !MICROSOFT_CLIENT_ID || !MICROSOFT_CLIENT_SECRET;
}

function getRequestBaseUrl(req) {
  const forwardedProto = String(req.headers["x-forwarded-proto"] || "").split(",")[0].trim();
  const proto = forwardedProto || req.protocol || "https";
  const host = String(req.headers["x-forwarded-host"] || req.headers.host || "").split(",")[0].trim();
  if (host) return `${proto}://${host}`;
  return SERVER_BASE_URL;
}

function getServerBaseUrl(req) {
  return process.env.SERVER_BASE_URL || getRequestBaseUrl(req);
}

function getAppBaseUrl(req) {
  return APP_BASE_URL_ENV || getRequestBaseUrl(req);
}

function oauthRedirectUrl(req, status, provider, message) {
  const params = new URLSearchParams();
  params.set("oauth", `${provider}_${status}`);
  if (message) params.set("message", message);
  return `${getAppBaseUrl(req)}/?${params.toString()}`;
}

function safeErrorMessage(error, fallback) {
  if (!error) return fallback;
  if (typeof error === "string") return error;
  if (error.message) return error.message;
  return fallback;
}

app.get("/api/health", (_req, res) => {
  res.json({ ok: true, now: new Date().toISOString() });
});

app.get("/api/auth/status", (req, res) => {
  const googleConnected = Boolean(req.session.google?.tokens?.accessToken);
  const outlookConnected = Boolean(req.session.outlook?.tokens?.accessToken);

  const connected = [];
  if (googleConnected) connected.push("gmail");
  if (outlookConnected) connected.push("outlook");

  res.json({
    connected,
    googleConfigured: Boolean(GOOGLE_CLIENT_ID && GOOGLE_CLIENT_SECRET),
    outlookConfigured: Boolean(MICROSOFT_CLIENT_ID && MICROSOFT_CLIENT_SECRET),
    google: {
      connected: googleConnected,
      email: req.session.google?.profile?.email || "",
      name: req.session.google?.profile?.name || "",
    },
    outlook: {
      connected: outlookConnected,
      email:
        req.session.outlook?.profile?.mail ||
        req.session.outlook?.profile?.userPrincipalName ||
        "",
      name: req.session.outlook?.profile?.displayName || "",
    },
    openaiConfigured: Boolean(OPENAI_API_KEY),
  });
});

app.get("/api/auth/google/start", (req, res) => {
  if (missingOAuthConfig("google")) {
    return res.redirect(oauthRedirectUrl(req, "error", "google", "Missing Google OAuth credentials"));
  }

  const state = crypto.randomUUID();
  req.session.oauthState.google = state;

  const redirectUri = GOOGLE_REDIRECT_URI || `${getServerBaseUrl(req)}/api/auth/google/callback`;
  const authUrl = new URL("https://accounts.google.com/o/oauth2/v2/auth");
  authUrl.searchParams.set("client_id", GOOGLE_CLIENT_ID);
  authUrl.searchParams.set("redirect_uri", redirectUri);
  authUrl.searchParams.set("response_type", "code");
  authUrl.searchParams.set("scope", [
    "openid",
    "email",
    "profile",
    "https://www.googleapis.com/auth/gmail.readonly",
  ].join(" "));
  authUrl.searchParams.set("access_type", "offline");
  authUrl.searchParams.set("prompt", "consent");
  authUrl.searchParams.set("state", state);

  return res.redirect(authUrl.toString());
});

app.get("/api/auth/google/callback", async (req, res) => {
  const { code, state, error } = req.query;
  if (error) {
    return res.redirect(oauthRedirectUrl(req, "error", "google", String(error)));
  }

  if (!code || state !== req.session.oauthState.google) {
    return res.redirect(oauthRedirectUrl(req, "error", "google", "Invalid Google OAuth state"));
  }

  try {
    const redirectUri = GOOGLE_REDIRECT_URI || `${getServerBaseUrl(req)}/api/auth/google/callback`;
    const tokenResp = await fetch("https://oauth2.googleapis.com/token", {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        code: String(code),
        client_id: GOOGLE_CLIENT_ID,
        client_secret: GOOGLE_CLIENT_SECRET,
        redirect_uri: redirectUri,
        grant_type: "authorization_code",
      }),
    });

    const tokenJson = await tokenResp.json();
    if (!tokenResp.ok) {
      throw new Error(tokenJson.error_description || tokenJson.error || "Google token exchange failed");
    }

    const profileResp = await fetch("https://openidconnect.googleapis.com/v1/userinfo", {
      headers: { Authorization: `Bearer ${tokenJson.access_token}` },
    });
    const profileJson = await profileResp.json();

    req.session.google = {
      connectedAt: new Date().toISOString(),
      scope: tokenJson.scope,
      tokens: {
        accessToken: tokenJson.access_token,
        refreshToken: tokenJson.refresh_token || req.session.google?.tokens?.refreshToken || null,
        expiresIn: tokenJson.expires_in,
        tokenType: tokenJson.token_type,
      },
      profile: {
        sub: profileJson.sub,
        email: profileJson.email,
        name: profileJson.name,
        picture: profileJson.picture,
      },
    };

    delete req.session.oauthState.google;
    return res.redirect(oauthRedirectUrl(req, "success", "google"));
  } catch (err) {
    return res.redirect(oauthRedirectUrl(req, "error", "google", safeErrorMessage(err, "Google OAuth failed")));
  }
});

app.post("/api/auth/google/disconnect", (req, res) => {
  req.session.google = null;
  res.json({ ok: true });
});

app.get("/api/auth/outlook/start", (req, res) => {
  if (missingOAuthConfig("outlook")) {
    return res.redirect(oauthRedirectUrl(req, "error", "outlook", "Missing Microsoft OAuth credentials"));
  }

  const tenant = MICROSOFT_TENANT_ID;
  const state = crypto.randomUUID();
  req.session.oauthState.outlook = state;

  const redirectUri = MICROSOFT_REDIRECT_URI || `${getServerBaseUrl(req)}/api/auth/outlook/callback`;
  const authUrl = new URL(`https://login.microsoftonline.com/${tenant}/oauth2/v2.0/authorize`);
  authUrl.searchParams.set("client_id", MICROSOFT_CLIENT_ID);
  authUrl.searchParams.set("redirect_uri", redirectUri);
  authUrl.searchParams.set("response_type", "code");
  authUrl.searchParams.set("scope", [
    "offline_access",
    "openid",
    "profile",
    "email",
    "User.Read",
    "Mail.Read",
  ].join(" "));
  authUrl.searchParams.set("state", state);

  return res.redirect(authUrl.toString());
});

app.get("/api/auth/outlook/callback", async (req, res) => {
  const { code, state, error } = req.query;
  if (error) {
    return res.redirect(oauthRedirectUrl(req, "error", "outlook", String(error)));
  }

  if (!code || state !== req.session.oauthState.outlook) {
    return res.redirect(oauthRedirectUrl(req, "error", "outlook", "Invalid Microsoft OAuth state"));
  }

  try {
    const tenant = MICROSOFT_TENANT_ID;
    const redirectUri = MICROSOFT_REDIRECT_URI || `${getServerBaseUrl(req)}/api/auth/outlook/callback`;
    const tokenResp = await fetch(
      `https://login.microsoftonline.com/${tenant}/oauth2/v2.0/token`,
      {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
        body: new URLSearchParams({
          client_id: MICROSOFT_CLIENT_ID,
          client_secret: MICROSOFT_CLIENT_SECRET,
          code: String(code),
          grant_type: "authorization_code",
          redirect_uri: redirectUri,
          scope: "offline_access openid profile email User.Read Mail.Read",
        }),
      }
    );

    const tokenJson = await tokenResp.json();
    if (!tokenResp.ok) {
      throw new Error(tokenJson.error_description || tokenJson.error || "Microsoft token exchange failed");
    }

    const profileResp = await fetch("https://graph.microsoft.com/v1.0/me", {
      headers: { Authorization: `Bearer ${tokenJson.access_token}` },
    });
    const profileJson = await profileResp.json();

    req.session.outlook = {
      connectedAt: new Date().toISOString(),
      scope: tokenJson.scope,
      tokens: {
        accessToken: tokenJson.access_token,
        refreshToken: tokenJson.refresh_token || req.session.outlook?.tokens?.refreshToken || null,
        expiresIn: tokenJson.expires_in,
        tokenType: tokenJson.token_type,
      },
      profile: {
        id: profileJson.id,
        displayName: profileJson.displayName,
        mail: profileJson.mail,
        userPrincipalName: profileJson.userPrincipalName,
      },
    };

    delete req.session.oauthState.outlook;
    return res.redirect(oauthRedirectUrl(req, "success", "outlook"));
  } catch (err) {
    return res.redirect(oauthRedirectUrl(req, "error", "outlook", safeErrorMessage(err, "Microsoft OAuth failed")));
  }
});

app.post("/api/auth/outlook/disconnect", (req, res) => {
  req.session.outlook = null;
  res.json({ ok: true });
});

function toUnixSeconds(dateString, fallbackSeconds) {
  if (!dateString) return fallbackSeconds;
  const date = new Date(dateString);
  if (Number.isNaN(date.getTime())) return fallbackSeconds;
  return Math.floor(date.getTime() / 1000);
}

function compactEmailText(value, maxLen = 500) {
  return String(value || "")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, maxLen);
}

async function fetchGoogleJobEmails(session, dateRange) {
  const accessToken = session.google?.tokens?.accessToken;
  if (!accessToken) return [];

  const nowSeconds = Math.floor(Date.now() / 1000);
  const fromSeconds = toUnixSeconds(dateRange?.from, nowSeconds - 365 * 24 * 60 * 60);
  const toSeconds = toUnixSeconds(dateRange?.to, nowSeconds);
  const keywordQuery = [
    "application",
    "interview",
    "recruiter",
    "hiring",
    "offer",
    "rejection",
    "phone screen",
    "technical",
  ]
    .map((k) => `"${k}"`)
    .join(" OR ");

  const gmailQuery = `after:${fromSeconds} before:${toSeconds} (${keywordQuery})`;
  const listUrl = new URL("https://gmail.googleapis.com/gmail/v1/users/me/messages");
  listUrl.searchParams.set("maxResults", "20");
  listUrl.searchParams.set("q", gmailQuery);

  const listResp = await fetch(listUrl.toString(), {
    headers: { Authorization: `Bearer ${accessToken}` },
  });
  const listJson = await listResp.json();
  if (!listResp.ok) {
    throw new Error(listJson.error?.message || "Gmail fetch failed");
  }

  const messages = Array.isArray(listJson.messages) ? listJson.messages : [];
  if (!messages.length) return [];

  const details = await Promise.all(
    messages.map(async (message) => {
      const msgUrl = new URL(`https://gmail.googleapis.com/gmail/v1/users/me/messages/${message.id}`);
      msgUrl.searchParams.set("format", "metadata");
      msgUrl.searchParams.append("metadataHeaders", "From");
      msgUrl.searchParams.append("metadataHeaders", "Subject");
      msgUrl.searchParams.append("metadataHeaders", "Date");

      const resp = await fetch(msgUrl.toString(), {
        headers: { Authorization: `Bearer ${accessToken}` },
      });
      const data = await resp.json();
      if (!resp.ok) return null;

      const headers = Object.fromEntries(
        (data.payload?.headers || [])
          .filter((h) => h?.name)
          .map((h) => [String(h.name).toLowerCase(), String(h.value || "")])
      );

      return {
        provider: "gmail",
        from: headers.from || "",
        subject: headers.subject || "",
        date: headers.date || (data.internalDate ? new Date(Number(data.internalDate)).toISOString() : ""),
        body: compactEmailText(data.snippet || ""),
      };
    })
  );

  return details.filter(Boolean);
}

async function fetchOutlookJobEmails(session, dateRange) {
  const accessToken = session.outlook?.tokens?.accessToken;
  if (!accessToken) return [];

  const fromDate = dateRange?.from ? `${dateRange.from}T00:00:00Z` : "2000-01-01T00:00:00Z";
  const toDate = dateRange?.to ? `${dateRange.to}T23:59:59Z` : new Date().toISOString();

  const graphUrl = new URL("https://graph.microsoft.com/v1.0/me/messages");
  graphUrl.searchParams.set("$top", "25");
  graphUrl.searchParams.set("$orderby", "receivedDateTime desc");
  graphUrl.searchParams.set("$select", "from,subject,receivedDateTime,bodyPreview");
  graphUrl.searchParams.set(
    "$filter",
    `receivedDateTime ge ${fromDate} and receivedDateTime le ${toDate}`
  );

  const resp = await fetch(graphUrl.toString(), {
    headers: { Authorization: `Bearer ${accessToken}` },
  });
  const data = await resp.json();
  if (!resp.ok) {
    throw new Error(data.error?.message || "Outlook fetch failed");
  }

  const rows = Array.isArray(data.value) ? data.value : [];
  const terms = ["application", "interview", "recruit", "hiring", "offer", "reject", "screen", "technical"];
  return rows
    .filter((row) => {
      const hay = `${row.subject || ""} ${row.bodyPreview || ""}`.toLowerCase();
      return terms.some((term) => hay.includes(term));
    })
    .map((row) => ({
      provider: "outlook",
      from: row.from?.emailAddress?.address || row.from?.emailAddress?.name || "",
      subject: row.subject || "",
      date: row.receivedDateTime || "",
      body: compactEmailText(row.bodyPreview || ""),
    }));
}

function formatEmailsForAnalysis(entries) {
  return entries
    .filter((entry) => entry.subject || entry.body)
    .map((entry) => {
      const parsedDate = entry.date ? new Date(entry.date) : null;
      const date = parsedDate && !Number.isNaN(parsedDate.getTime())
        ? parsedDate.toISOString().slice(0, 10)
        : "";
      return `From: ${entry.from || "unknown"}\nSubject: ${entry.subject || "(no subject)"}\nDate: ${date}\n${entry.body || ""}`;
    })
    .join("\n---\n");
}

app.post("/api/emails/job-search", async (req, res) => {
  try {
    const dateRange = req.body?.dateRange || {};
    const [gmailEntries, outlookEntries] = await Promise.all([
      fetchGoogleJobEmails(req.session, dateRange),
      fetchOutlookJobEmails(req.session, dateRange),
    ]);

    const allEntries = [...gmailEntries, ...outlookEntries]
      .sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());
    const text = formatEmailsForAnalysis(allEntries);

    return res.json({
      count: allEntries.length,
      byProvider: {
        gmail: gmailEntries.length,
        outlook: outlookEntries.length,
      },
      text,
    });
  } catch (error) {
    return res.status(502).json({
      error: safeErrorMessage(error, "Could not fetch inbox emails."),
    });
  }
});

function normalizeAnalysisResult(input = {}) {
  const num = (value) => {
    const n = Number(value);
    return Number.isFinite(n) ? n : 0;
  };

  const summary = input.summary || {};
  const stageCounts = input.stageCounts || {};

  return {
    summary: {
      totalApplications: num(summary.totalApplications),
      phoneScreens: num(summary.phoneScreens),
      technicalInterviews: num(summary.technicalInterviews),
      finalRounds: num(summary.finalRounds),
      offers: num(summary.offers),
      rejections: num(summary.rejections),
      responseRate: num(summary.responseRate),
      offerRate: num(summary.offerRate),
    },
    stageCounts: {
      Applied: num(stageCounts.Applied),
      "Phone Screen": num(stageCounts["Phone Screen"]),
      Technical: num(stageCounts.Technical),
      "Final Round": num(stageCounts["Final Round"]),
      Offer: num(stageCounts.Offer),
      Rejected: num(stageCounts.Rejected),
    },
    flows: Array.isArray(input.flows) ? input.flows.slice(0, 20) : [],
    companies: Array.isArray(input.companies) ? input.companies.slice(0, 200) : [],
    insights: Array.isArray(input.insights)
      ? input.insights.slice(0, 10).map((x) => String(x))
      : [],
  };
}

app.post("/api/analyze", async (req, res) => {
  try {
    const text = String(req.body?.text || "").trim();
    if (!text) {
      return res.status(400).json({ error: "Missing required field: text" });
    }

    if (!OPENAI_API_KEY) {
      return res.status(500).json({ error: "Missing OPENAI_API_KEY" });
    }

    if (!openaiClient) {
      openaiClient = new OpenAI({ apiKey: OPENAI_API_KEY });
    }

    const completion = await openaiClient.chat.completions.create({
      model: OPENAI_MODEL,
      temperature: 0.2,
      response_format: { type: "json_object" },
      messages: [
        {
          role: "system",
          content:
            "You analyze job search emails. Return strictly valid JSON matching the requested schema. Do not include markdown fences or extra keys.",
        },
        {
          role: "user",
          content: `Analyze these job hunting emails and return exactly this structure as JSON:\n\n{\n  "summary": {"totalApplications":0,"phoneScreens":0,"technicalInterviews":0,"finalRounds":0,"offers":0,"rejections":0,"responseRate":0,"offerRate":0},\n  "stageCounts": {"Applied":0,"Phone Screen":0,"Technical":0,"Final Round":0,"Offer":0,"Rejected":0},\n  "flows": [{"from":"Applied","to":"Phone Screen","value":0},{"from":"Phone Screen","to":"Technical","value":0},{"from":"Technical","to":"Final Round","value":0},{"from":"Final Round","to":"Offer","value":0}],\n  "companies": [{"company":"","role":"","stage":"","date":""}],\n  "insights": ["", "", ""]\n}\n\nEmails:\n${text}`,
        },
      ],
    });

    const content = completion?.choices?.[0]?.message?.content;
    if (!content) {
      throw new Error("OpenAI returned empty content");
    }

    const parsed = JSON.parse(content);
    return res.json(normalizeAnalysisResult(parsed));
  } catch (error) {
    return res.status(502).json({
      error: safeErrorMessage(error, "OpenAI request failed"),
    });
  }
});

if (HAS_DIST_BUILD) {
  app.use(express.static(DIST_DIR));
  app.get(/^\/(?!api).*/, (_req, res) => {
    res.sendFile(path.join(DIST_DIR, "index.html"));
  });
}

app.listen(PORT, () => {
  console.log(`[jobradar] backend listening on ${SERVER_BASE_URL}`);
});
