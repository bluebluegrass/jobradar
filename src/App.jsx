import { useState, useEffect } from "react";

const SAMPLE_EMAILS = `From: careers@stripe.com
Subject: Your application to Stripe - Senior Engineer
Date: 2024-01-15
We've received your application for the Senior Software Engineer role. We'll review and get back to you.
---
From: recruiting@notion.so
Subject: Interview Invitation - Notion Product Engineer
Date: 2024-01-18
Hi! We'd love to schedule a 30-min phone screen for the Product Engineer position.
---
From: noreply@greenhouse.io
Subject: Application Confirmation - Figma, Staff Engineer
Date: 2024-01-20
Thank you for applying to Figma for the Staff Engineer role.
---
From: talent@linear.app
Subject: Technical Interview - Linear
Date: 2024-01-25
Congratulations on passing the phone screen! We'd like to invite you to a technical interview.
---
From: careers@vercel.com
Subject: Application received - Frontend Engineer
Date: 2024-01-28
Thanks for your interest in Vercel. Your application is under review.
---
From: recruiting@notion.so
Subject: Technical Assessment - Notion
Date: 2024-02-01
Following your phone screen, we'd like you to complete a take-home technical assessment.
---
From: hr@stripe.com
Subject: Moving forward - Stripe Interview Process
Date: 2024-02-03
Great news! We'd like to move you to the technical phone interview stage.
---
From: careers@figma.com
Subject: Update on your Figma application
Date: 2024-02-05
After careful review, we've decided to move forward with other candidates. We encourage you to apply again.
---
From: talent@linear.app
Subject: Final Round Interview - Linear
Date: 2024-02-08
You've passed the technical round! We'd like to invite you for a final round with our team.
---
From: recruiting@notion.so
Subject: Final Interview - Notion
Date: 2024-02-10
Excellent work on the assessment! We'd like to schedule your final round interviews.
---
From: careers@vercel.com
Subject: Application Status - Vercel
Date: 2024-02-12
We've decided to move forward with other candidates at this time. Thank you for your interest.
---
From: hr@stripe.com
Subject: Stripe - Offer Letter
Date: 2024-02-18
We are thrilled to extend an offer for the Senior Software Engineer position at Stripe!
---
From: talent@linear.app
Subject: We'd like to make you an offer - Linear
Date: 2024-02-22
Following your final round, we're excited to extend an offer to join Linear as a Software Engineer.
---
From: recruiting@notion.so
Subject: Unfortunately - Notion
Date: 2024-02-24
After extensive interviews, we've decided to move forward with another candidate.
---
From: jobs@shopify.com
Subject: Application Received - Shopify Backend Engineer
Date: 2024-02-26
Thank you for applying to the Backend Engineer position at Shopify.
---
From: talent@shopify.com
Subject: Phone Screen - Shopify
Date: 2024-03-01
We'd love to connect for a brief phone screen for the Backend Engineer role.`;

const COLORS = {
  "Applied":      "#f97316",
  "Phone Screen": "#f59e0b",
  "Technical":    "#eab308",
  "Final Round":  "#84cc16",
  "Offer":        "#22c55e",
  "Rejected":     "#ef4444",
};

// ─── SANKEY DIAGRAM ────────────────────────────────────────────────────────────
// Proper filled ribbon Sankey: each band is a filled curved shape (not a stroke).
// Forward bands flow left→right. Drop bands arc down to a rejection bar.
function SankeyDiagram({ stageCounts }) {
  const [tooltip, setTooltip] = useState(null);
  const [hov, setHov] = useState(null);

  const W = 860, H = 460;
  const NW = 26;          // node width
  const PX = 56;          // horizontal padding
  const PT = 50;          // top padding
  const PB = 60;          // bottom padding (for rejected bar)
  const CHART_H = H - PT - PB;

  const fwd = ["Applied","Phone Screen","Technical","Final Round","Offer"];
  const cnt = {};
  fwd.forEach(s => { cnt[s] = stageCounts[s] || 0; });
  cnt["Rejected"] = stageCounts["Rejected"] || 0;
  const MAX = cnt["Applied"] || 1;

  // X position of each forward stage column
  const spacing = (W - PX * 2 - NW) / (fwd.length - 1);
  const cx = i => PX + i * spacing;

  // Node height and Y (centered vertically in chart area)
  const nh = s => Math.max(18, (cnt[s] / MAX) * CHART_H * 0.72);
  const ny = s => PT + (CHART_H - nh(s)) / 2;

  // Build forward ribbons and drop ribbons
  const fwdRibbons = [];
  const dropRibbons = [];

  fwd.slice(0, -1).forEach((from, i) => {
    const to = fwd[i + 1];
    const fCnt = cnt[from], tCnt = cnt[to];
    if (!fCnt) return;
    const dropCnt = fCnt - tCnt;

    const fH = nh(from), tH = nh(to);
    const fY = ny(from), tY = ny(to);
    const x1 = cx(i) + NW, x2 = cx(i + 1);

    // Forward ribbon occupies top (tCnt/fCnt) of from-node, full to-node
    const fwdSlice = fH * (tCnt / fCnt);
    fwdRibbons.push({
      id: `f${i}`, from, to,
      x1, y1t: fY,             y1b: fY + fwdSlice,
      x2, y2t: tY,             y2b: tY + tH,
      toCnt: tCnt, pct: Math.round((tCnt / fCnt) * 100),
    });

    // Drop ribbon occupies bottom (dropCnt/fCnt) of from-node → rejected bar
    if (dropCnt > 0) {
      const dropSlice = fH * (dropCnt / fCnt);
      dropRibbons.push({
        id: `d${i}`, from,
        x1, y1t: fY + fwdSlice, y1b: fY + fH,
        dropCnt, pct: Math.round((dropCnt / fCnt) * 100),
      });
    }
  });

  // Filled ribbon between two vertical segments (cubic bezier)
  function ribbon(x1, y1t, y1b, x2, y2t, y2b) {
    const mx = (x1 + x2) / 2;
    return [
      `M${x1} ${y1t}`,
      `C${mx} ${y1t} ${mx} ${y2t} ${x2} ${y2t}`,
      `L${x2} ${y2b}`,
      `C${mx} ${y2b} ${mx} ${y1b} ${x1} ${y1b}`,
      `Z`
    ].join(" ");
  }

  // Drop ribbon: top edge curves smoothly down to rejection bar, bottom edge mirrors
  function dropRibbon(x1, y1t, y1b, targetY, bandH) {
    const ex = x1 - 18;  // endpoint x (slightly left, near the column)
    const ey_top = targetY;
    const ey_bot = targetY + bandH;
    // control points pull strongly downward
    const cy1 = y1t + (targetY - y1t) * 0.7;
    const cy2 = targetY - 10;
    return [
      `M${x1} ${y1t}`,
      `C${x1 + 10} ${cy1} ${ex + 10} ${cy2} ${ex} ${ey_top}`,
      `L${ex} ${ey_bot}`,
      `C${ex + 10} ${cy2 + bandH} ${x1 + 10} ${cy1 + (y1b - y1t)} ${x1} ${y1b}`,
      `Z`
    ].join(" ");
  }

  const rejBarY = H - PB + 12;
  const rejBarH = 20;

  return (
    <div style={{ position: "relative" }}>
      <svg viewBox={`0 0 ${W} ${H}`} style={{ width: "100%", height: "auto", overflow: "visible" }}>
        <defs>
          {fwdRibbons.map((r, i) => (
            <linearGradient key={r.id} id={r.id} x1="0%" y1="0%" x2="100%" y2="0%">
              <stop offset="0%"   stopColor={COLORS[r.from]} stopOpacity="0.82" />
              <stop offset="100%" stopColor={COLORS[r.to]}   stopOpacity="0.62" />
            </linearGradient>
          ))}
          {dropRibbons.map((r, i) => (
            <linearGradient key={r.id} id={r.id} x1="0%" y1="0%" x2="0%" y2="100%">
              <stop offset="0%"   stopColor={COLORS[r.from]} stopOpacity="0.55" />
              <stop offset="100%" stopColor="#f87171"         stopOpacity="0.28" />
            </linearGradient>
          ))}
        </defs>

        {/* Drop (rejection) ribbons - render behind forward */}
        {dropRibbons.map((r) => {
          const isH = hov === r.id;
          const bandH = Math.max(8, (r.dropCnt / MAX) * 20);
          // position the ribbon endpoint to spread across the rejection bar
          const colIdx = fwd.findIndex(s => s === r.from);
          const targetX = cx(colIdx) + NW / 2;
          return (
            <path key={r.id}
              d={dropRibbon(r.x1, r.y1t, r.y1b, rejBarY, bandH)}
              fill={`url(#${r.id})`}
              opacity={isH ? 0.88 : 0.52}
              style={{ cursor: "pointer", transition: "opacity 0.18s" }}
              onMouseEnter={e => { setHov(r.id); setTooltip({ x: e.clientX, y: e.clientY, label: `Dropped after ${r.from}`, val: `${r.dropCnt} people (${r.pct}%)` }); }}
              onMouseLeave={() => { setHov(null); setTooltip(null); }}
            />
          );
        })}

        {/* Forward ribbons */}
        {fwdRibbons.map((r) => {
          const isH = hov === r.id;
          return (
            <path key={r.id}
              d={ribbon(r.x1, r.y1t, r.y1b, r.x2, r.y2t, r.y2b)}
              fill={`url(#${r.id})`}
              opacity={isH ? 1.0 : 0.72}
              style={{ cursor: "pointer", transition: "opacity 0.18s" }}
              onMouseEnter={e => { setHov(r.id); setTooltip({ x: e.clientX, y: e.clientY, label: `${r.from} → ${r.to}`, val: `${r.toCnt} continued (${r.pct}%)` }); }}
              onMouseLeave={() => { setHov(null); setTooltip(null); }}
            />
          );
        })}

        {/* Stage nodes */}
        {fwd.map((stage, i) => {
          const h = nh(stage), y = ny(stage), x = cx(i);
          return (
            <g key={stage}>
              {/* Soft glow */}
              <rect x={x - 2} y={y - 2} width={NW + 4} height={h + 4} rx={7}
                fill={COLORS[stage]} opacity={0.18} style={{ filter: "blur(6px)" }} />
              {/* Bar */}
              <rect x={x} y={y} width={NW} height={h} rx={5} fill={COLORS[stage]} opacity={0.94} />
              {/* Count above node */}
              <text x={x + NW / 2} y={y - 13} textAnchor="middle"
                fill="white" fontSize="16" fontWeight="800" fontFamily="'Syne',sans-serif">
                {cnt[stage]}
              </text>
              {/* Label below node */}
              <text x={x + NW / 2} y={y + h + 17} textAnchor="middle"
                fill="#94a3b8" fontSize="10" fontFamily="'DM Mono',monospace" letterSpacing="0.05em">
                {stage}
              </text>
            </g>
          );
        })}

        {/* Rejection bar at bottom */}
        <rect x={PX} y={rejBarY} width={W - PX * 2} height={rejBarH} rx={5}
          fill="#f87171" opacity={0.13} />
        <rect x={PX} y={rejBarY} width={W - PX * 2} height={1} rx={1}
          fill="#f87171" opacity={0.3} />
        <text x={W / 2} y={rejBarY + 14} textAnchor="middle"
          fill="#f87171" fontSize="11" fontFamily="'DM Mono',monospace" opacity={0.75}>
          ✕  Rejected / No Response — {cnt["Rejected"]}
        </text>

        {/* % labels on forward ribbons */}
        {fwdRibbons.map((r) => {
          const mx = (r.x1 + r.x2) / 2;
          const my = ((r.y1t + r.y1b) / 2 + (r.y2t + r.y2b) / 2) / 2;
          return (
            <g key={`pct-${r.id}`}>
              <rect x={mx - 17} y={my - 10} width={34} height={16} rx={8}
                fill="rgba(0,0,0,0.55)" />
              <text x={mx} y={my + 2} textAnchor="middle"
                fill="white" fontSize="9" fontWeight="600" fontFamily="'DM Mono',monospace">
                {r.pct}%
              </text>
            </g>
          );
        })}
      </svg>

      {tooltip && (
        <div style={{
          position: "fixed", left: tooltip.x + 14, top: tooltip.y - 16,
          background: "#0f172a", border: "1px solid rgba(99,102,241,0.4)",
          borderRadius: 10, padding: "8px 14px", pointerEvents: "none", zIndex: 9999,
          boxShadow: "0 8px 32px rgba(0,0,0,0.7)",
        }}>
          <div style={{ color: "#64748b", fontSize: 10, fontFamily: "'DM Mono',monospace", marginBottom: 3 }}>{tooltip.label}</div>
          <div style={{ color: "white", fontSize: 14, fontFamily: "'Syne',sans-serif", fontWeight: 700 }}>{tooltip.val}</div>
        </div>
      )}
    </div>
  );
}

// ─── STAT CARD ────────────────────────────────────────────────────────────────
function StatCard({ label, value, sub, accent, delay }) {
  const [vis, setVis] = useState(false);
  useEffect(() => { const t = setTimeout(() => setVis(true), delay || 0); return () => clearTimeout(t); }, [delay]);
  return (
    <div style={{ background: "rgba(15,23,42,0.7)", border: `1px solid ${accent}33`, borderRadius: 12, padding: "20px 22px", backdropFilter: "blur(10px)", transition: "all 0.5s cubic-bezier(0.16,1,0.3,1)", opacity: vis ? 1 : 0, transform: vis ? "translateY(0)" : "translateY(20px)", position: "relative", overflow: "hidden" }}>
      <div style={{ position: "absolute", top: 0, left: 0, right: 0, height: 2, background: `linear-gradient(90deg,transparent,${accent},transparent)` }} />
      <div style={{ color: "#64748b", fontSize: 10, letterSpacing: "0.12em", textTransform: "uppercase", fontFamily: "'DM Mono',monospace", marginBottom: 8 }}>{label}</div>
      <div style={{ color: "white", fontSize: 30, fontWeight: 800, fontFamily: "'Syne',sans-serif", lineHeight: 1 }}>{value}</div>
      {sub && <div style={{ color: accent, fontSize: 11, marginTop: 6, fontFamily: "'DM Mono',monospace" }}>{sub}</div>}
    </div>
  );
}

function CompanyRow({ company, delay }) {
  const [vis, setVis] = useState(false);
  useEffect(() => { const t = setTimeout(() => setVis(true), delay || 0); return () => clearTimeout(t); }, [delay]);
  const c = COLORS[company.stage] || "#64748b";
  return (
    <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 130px 90px", gap: 16, padding: "13px 20px", borderBottom: "1px solid rgba(255,255,255,0.04)", alignItems: "center", transition: "all 0.4s cubic-bezier(0.16,1,0.3,1)", opacity: vis ? 1 : 0, transform: vis ? "translateX(0)" : "translateX(-16px)" }}
      onMouseEnter={e => e.currentTarget.style.background = "rgba(249,115,22,0.07)"}
      onMouseLeave={e => e.currentTarget.style.background = "transparent"}>
      <span style={{ color: "white", fontWeight: 600, fontFamily: "'Syne',sans-serif", fontSize: 14 }}>{company.company}</span>
      <span style={{ color: "#64748b", fontSize: 12, fontFamily: "'DM Mono',monospace" }}>{company.role}</span>
      <span style={{ display: "inline-flex", alignItems: "center", background: `${c}22`, color: c, padding: "3px 10px", borderRadius: 20, fontSize: 10, border: `1px solid ${c}44`, fontFamily: "'DM Mono',monospace", width: "fit-content" }}>{company.stage}</span>
      <span style={{ color: "#475569", fontSize: 11, fontFamily: "'DM Mono',monospace" }}>{company.date}</span>
    </div>
  );
}

// ─── MAIN APP ─────────────────────────────────────────────────────────────────
export default function JobRadar() {
  const [screen, setScreen] = useState("home");
  const [emailText, setEmailText] = useState("");
  const [result, setResult] = useState(null);
  const [loadMsg, setLoadMsg] = useState("Reading emails...");
  const [loadPct, setLoadPct] = useState(0);
  const [connected, setConnected] = useState([]);
  const [profiles, setProfiles] = useState({ gmail: "", outlook: "" });
  const [connectError, setConnectError] = useState("");
  const [connectNotice, setConnectNotice] = useState("");
  const [connectBusy, setConnectBusy] = useState(false);
  const [dateRange, setDateRange] = useState({ from: "2024-01-01", to: "2024-12-31" });
  const [tab, setTab] = useState("overview");

  const loadMsgs = ["Reading emails...","Filtering job content...","Identifying companies...","Mapping stages...","Computing metrics...","Generating insights..."];

  async function refreshAuthStatus() {
    try {
      const res = await fetch("/api/auth/status");
      if (!res.ok) throw new Error("Unable to read auth status.");
      const data = await res.json();
      setConnected(Array.isArray(data.connected) ? data.connected : []);
      setProfiles({
        gmail: data.google?.email || "",
        outlook: data.outlook?.email || "",
      });
    } catch {
      setConnected([]);
    }
  }

  async function onProviderClick(provider) {
    const isConnected = connected.includes(provider);
    setConnectError("");
    setConnectNotice("");

    if (!isConnected) {
      const startPath = provider === "gmail" ? "/api/auth/google/start" : "/api/auth/outlook/start";
      window.location.href = startPath;
      return;
    }

    try {
      setConnectBusy(true);
      const disconnectPath = provider === "gmail" ? "/api/auth/google/disconnect" : "/api/auth/outlook/disconnect";
      const res = await fetch(disconnectPath, { method: "POST" });
      if (!res.ok) throw new Error("Disconnect failed.");
      await refreshAuthStatus();
      setConnectNotice(provider === "gmail" ? "Google disconnected." : "Outlook disconnected.");
    } catch (e) {
      setConnectError(e.message || "Could not disconnect account.");
    } finally {
      setConnectBusy(false);
    }
  }

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const oauth = params.get("oauth");
    const message = params.get("message");
    if (oauth) {
      const provider = oauth.startsWith("google_") ? "Google" : oauth.startsWith("outlook_") ? "Outlook" : "OAuth";
      const ok = oauth.endsWith("_success");
      if (ok) {
        setConnectNotice(`${provider} connected.`);
      } else {
        setConnectError(message || `${provider} connection failed.`);
      }
      setScreen("connect");
      window.history.replaceState({}, "", window.location.pathname);
    }
    refreshAuthStatus();
  }, []);

  useEffect(() => {
    if (screen === "connect") refreshAuthStatus();
  }, [screen]);

  async function analyze(text) {
    setScreen("loading"); setLoadPct(0);
    const iv = setInterval(() => setLoadPct(p => { const n = p + Math.random() * 17; setLoadMsg(loadMsgs[Math.min(Math.floor((n/100)*loadMsgs.length), loadMsgs.length-1)]); return Math.min(n, 91); }), 650);
    try {
      const res = await fetch("/api/analyze", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          text,
          dateRange,
          connectedSources: connected,
        }),
      });
      const d = await res.json();
      if (!res.ok) throw new Error(d.error || "Analysis request failed.");
      const parsed = d;
      clearInterval(iv); setLoadPct(100); setLoadMsg("Done!");
      setTimeout(() => { setResult(parsed); setScreen("dashboard"); }, 500);
    } catch(e) {
      clearInterval(iv); setLoadMsg(`Error — ${e.message || "try again."}`);
      setTimeout(() => setScreen("input"), 2000);
    }
  }

  async function analyzeConnectedInbox() {
    setConnectError("");
    setConnectNotice("");
    setConnectBusy(true);
    try {
      const res = await fetch("/api/emails/job-search", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ dateRange }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Could not fetch inbox emails.");
      if (!data.text || !data.text.trim()) {
        throw new Error("No job-related emails found in this date range.");
      }
      setEmailText(data.text);
      await analyze(data.text);
    } catch (e) {
      setConnectError(e.message || "Could not fetch emails.");
    } finally {
      setConnectBusy(false);
    }
  }

  const BASE_STYLE = `
    @import url('https://fonts.googleapis.com/css2?family=Syne:wght@400;600;700;800&family=DM+Mono:wght@300;400;500&display=swap');
    *{box-sizing:border-box;margin:0;padding:0;}
    ::-webkit-scrollbar{width:4px;} ::-webkit-scrollbar-thumb{background:#f97316;border-radius:2px;}
    @keyframes pulse{0%,100%{opacity:1}50%{opacity:0.35}}
    @keyframes fadeUp{from{opacity:0;transform:translateY(10px)}to{opacity:1;transform:translateY(0)}}
  `;

  // ── HOME ──────────────────────────────────────────────────────────────────────
  if (screen === "home") return (
    <div style={{ minHeight:"100vh", background:"#0d0700", color:"white", position:"relative", overflow:"hidden" }}>
      <style>{BASE_STYLE}</style>
      <div style={{ position:"absolute", inset:0, backgroundImage:"linear-gradient(rgba(249,115,22,0.06) 1px,transparent 1px),linear-gradient(90deg,rgba(249,115,22,0.06) 1px,transparent 1px)", backgroundSize:"60px 60px" }} />
      <div style={{ position:"absolute", top:"18%", left:"50%", transform:"translateX(-50%)", width:700, height:350, background:"radial-gradient(ellipse,rgba(251,146,60,0.16) 0%,transparent 70%)", pointerEvents:"none" }} />
      <div style={{ position:"relative", zIndex:1, maxWidth:900, margin:"0 auto", padding:"0 40px", display:"flex", flexDirection:"column", alignItems:"center", justifyContent:"center", minHeight:"100vh", textAlign:"center" }}>
        <div style={{ marginBottom:20, display:"flex", alignItems:"center", gap:10 }}>
          <div style={{ width:7, height:7, borderRadius:"50%", background:"#f97316", boxShadow:"0 0 10px #f97316", animation:"pulse 2s infinite" }} />
          <span style={{ color:"#78350f", fontSize:10, letterSpacing:"0.22em", textTransform:"uppercase", fontFamily:"'DM Mono',monospace" }}>Job Search Intelligence</span>
        </div>
        <h1 style={{ fontFamily:"'Syne',sans-serif", fontSize:"clamp(52px,8vw,86px)", fontWeight:800, lineHeight:1, marginBottom:22, letterSpacing:"-0.03em" }}>
          Job<span style={{ background:"linear-gradient(135deg,#f97316,#eab308)", WebkitBackgroundClip:"text", WebkitTextFillColor:"transparent" }}>Radar</span>
        </h1>
        <p style={{ color:"#a16207", fontSize:17, maxWidth:480, lineHeight:1.75, marginBottom:44, fontFamily:"'DM Mono',monospace", fontWeight:300 }}>
          Turn your inbox into a job search dashboard. AI maps your entire funnel and shows you exactly where you stand.
        </p>
        <div style={{ display:"flex", gap:14, flexWrap:"wrap", justifyContent:"center", marginBottom:72 }}>
          <button onClick={() => setScreen("connect")}
            style={{ background:"linear-gradient(135deg,#f97316,#f59e0b)", border:"none", color:"white", padding:"14px 32px", borderRadius:8, fontSize:14, fontFamily:"'DM Mono',monospace", cursor:"pointer", letterSpacing:"0.08em" }}>
            Connect Inbox →
          </button>
          <button onClick={() => { setEmailText(SAMPLE_EMAILS); setScreen("input"); }}
            style={{ background:"transparent", border:"1px solid rgba(249,115,22,0.4)", color:"#fb923c", padding:"12px 28px", borderRadius:8, fontSize:13, fontFamily:"'DM Mono',monospace", cursor:"pointer", letterSpacing:"0.06em" }}>
            Try Sample Data
          </button>
        </div>
        <div style={{ display:"grid", gridTemplateColumns:"repeat(3,1fr)", gap:20, width:"100%", maxWidth:680 }}>
          {[{icon:"📧",t:"Read-only access",d:"Never stores or modifies emails"},{icon:"🤖",t:"AI-powered parsing",d:"OpenAI extracts every application"},{icon:"📊",t:"Sankey funnel",d:"Visual flow from application to offer"}].map((f,i)=>(
            <div key={i} style={{ background:"rgba(255,255,255,0.03)", border:"1px solid rgba(255,255,255,0.06)", borderRadius:12, padding:"18px 16px", textAlign:"left" }}>
              <div style={{ fontSize:22, marginBottom:8 }}>{f.icon}</div>
              <div style={{ color:"white", fontWeight:600, fontSize:12, marginBottom:4, fontFamily:"'Syne',sans-serif" }}>{f.t}</div>
              <div style={{ color:"#475569", fontSize:11, lineHeight:1.5, fontFamily:"'DM Mono',monospace" }}>{f.d}</div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );

  // ── CONNECT ────────────────────────────────────────────────────────────────────
  if (screen === "connect") return (
    <div style={{ minHeight:"100vh", background:"#0d0700", color:"white", display:"flex", alignItems:"center", justifyContent:"center", position:"relative" }}>
      <style>{BASE_STYLE}</style>
      <div style={{ position:"absolute", inset:0, backgroundImage:"linear-gradient(rgba(249,115,22,0.05) 1px,transparent 1px),linear-gradient(90deg,rgba(249,115,22,0.05) 1px,transparent 1px)", backgroundSize:"60px 60px" }} />
      <div style={{ position:"relative", zIndex:1, width:"100%", maxWidth:500, padding:"0 24px" }}>
        <button onClick={()=>setScreen("home")} style={{ background:"none", border:"none", color:"#475569", cursor:"pointer", fontSize:13, marginBottom:28, fontFamily:"'DM Mono',monospace" }}>← Back</button>
        <div style={{ background:"rgba(28,14,0,0.88)", border:"1px solid rgba(249,115,22,0.25)", borderRadius:16, padding:36, backdropFilter:"blur(20px)" }}>
          <h2 style={{ fontFamily:"'Syne',sans-serif", fontSize:26, fontWeight:800, marginBottom:6 }}>Connect your inbox</h2>
          <p style={{ color:"#64748b", fontSize:11, marginBottom:28, lineHeight:1.6, fontFamily:"'DM Mono',monospace" }}>Read-only access. Emails are never stored.</p>
          {connectError && (
            <div style={{ marginBottom: 14, background: "rgba(239,68,68,0.12)", border: "1px solid rgba(239,68,68,0.45)", borderRadius: 8, color: "#fca5a5", fontSize: 11, padding: "10px 12px", fontFamily: "'DM Mono',monospace" }}>
              {connectError}
            </div>
          )}
          {connectNotice && (
            <div style={{ marginBottom: 14, background: "rgba(34,197,94,0.10)", border: "1px solid rgba(34,197,94,0.35)", borderRadius: 8, color: "#86efac", fontSize: 11, padding: "10px 12px", fontFamily: "'DM Mono',monospace" }}>
              {connectNotice}
            </div>
          )}
          <div style={{ marginBottom:24 }}>
            <label style={{ color:"#64748b", fontSize:10, letterSpacing:"0.1em", textTransform:"uppercase", display:"block", marginBottom:8, fontFamily:"'DM Mono',monospace" }}>Date Range</label>
            <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:10 }}>
              {["from","to"].map(k=>(
                <input key={k} type="date" value={dateRange[k]} onChange={e=>setDateRange(p=>({...p,[k]:e.target.value}))}
                  style={{ background:"rgba(255,255,255,0.05)", border:"1px solid rgba(255,255,255,0.1)", borderRadius:8, color:"white", padding:"10px 12px", fontSize:12, fontFamily:"'DM Mono',monospace", outline:"none" }} />
              ))}
            </div>
          </div>
          {[{name:"gmail",label:"Connect Gmail",color:"#ea4335",icon:"G"},{name:"outlook",label:"Connect Outlook",color:"#0078d4",icon:"O"}].map(src=>{
            const conn = connected.includes(src.name);
            const userEmail = profiles[src.name] || "";
            return (
              <button key={src.name} disabled={connectBusy} onClick={()=>onProviderClick(src.name)}
                style={{ width:"100%", display:"flex", alignItems:"center", gap:12, background:conn?`${src.color}18`:"rgba(255,255,255,0.04)", border:`1px solid ${conn?src.color+"55":"rgba(255,255,255,0.08)"}`, borderRadius:10, padding:"13px 16px", cursor:connectBusy?"not-allowed":"pointer", marginBottom:10, transition:"all 0.2s", opacity: connectBusy ? 0.75 : 1 }}>
                <div style={{ width:28, height:28, borderRadius:6, background:src.color, display:"flex", alignItems:"center", justifyContent:"center", color:"white", fontWeight:700, fontSize:14, fontFamily:"serif" }}>{src.icon}</div>
                <span style={{ color:"white", fontSize:13, fontFamily:"'Syne',sans-serif", fontWeight:600, flex:1, textAlign:"left" }}>{src.label}</span>
                <span style={{ color:conn?"#22d3ee":"#475569", fontSize:10, fontFamily:"'DM Mono',monospace" }}>{conn ? (userEmail ? `✓ ${userEmail}` : "✓ Connected") : "Connect"}</span>
              </button>
            );
          })}
          <div style={{ margin:"20px 0", display:"flex", alignItems:"center", gap:10 }}>
            <div style={{ flex:1, height:1, background:"rgba(255,255,255,0.06)" }} />
            <span style={{ color:"#475569", fontSize:10, fontFamily:"'DM Mono',monospace" }}>or</span>
            <div style={{ flex:1, height:1, background:"rgba(255,255,255,0.06)" }} />
          </div>
          <button onClick={()=>{setEmailText(SAMPLE_EMAILS);setScreen("input");}}
            style={{ width:"100%", background:"transparent", border:"1px solid rgba(249,115,22,0.3)", borderRadius:10, padding:"11px 16px", color:"#fb923c", cursor:"pointer", fontSize:12, fontFamily:"'DM Mono',monospace" }}>
            Paste email text manually →
          </button>
          {connected.length>0&&(
            <button disabled={connectBusy} onClick={analyzeConnectedInbox}
              style={{ width:"100%", marginTop:14, background:"linear-gradient(135deg,#f97316,#f59e0b)", border:"none", borderRadius:10, padding:"13px 16px", color:"white", cursor:connectBusy?"not-allowed":"pointer", fontSize:13, fontFamily:"'DM Mono',monospace", letterSpacing:"0.06em", opacity: connectBusy ? 0.75 : 1 }}>
              {connectBusy ? "Working..." : "Analyze Connected Inbox →"}
            </button>
          )}
        </div>
      </div>
    </div>
  );

  // ── INPUT ──────────────────────────────────────────────────────────────────────
  if (screen === "input") return (
    <div style={{ minHeight:"100vh", background:"#0d0700", color:"white", display:"flex", alignItems:"center", justifyContent:"center", padding:"40px 24px" }}>
      <style>{BASE_STYLE}</style>
      <div style={{ width:"100%", maxWidth:680 }}>
        <button onClick={()=>setScreen("connect")} style={{ background:"none", border:"none", color:"#475569", cursor:"pointer", fontSize:13, marginBottom:20, fontFamily:"'DM Mono',monospace" }}>← Back</button>
        <h2 style={{ fontFamily:"'Syne',sans-serif", fontSize:26, fontWeight:800, marginBottom:6 }}>Paste your emails</h2>
        <p style={{ color:"#64748b", fontSize:11, marginBottom:18, fontFamily:"'DM Mono',monospace" }}>Include sender, subject, date and body for best results.</p>
        <textarea value={emailText} onChange={e=>setEmailText(e.target.value)} placeholder="Paste email threads here..."
          style={{ width:"100%", height:300, background:"rgba(28,14,0,0.85)", border:"1px solid rgba(249,115,22,0.2)", borderRadius:12, color:"white", padding:"16px 18px", fontSize:12, fontFamily:"'DM Mono',monospace", lineHeight:1.7, resize:"vertical", outline:"none", marginBottom:14 }} />
        <div style={{ display:"flex", gap:10 }}>
          <button onClick={()=>setEmailText(SAMPLE_EMAILS)}
            style={{ background:"transparent", border:"1px solid rgba(255,255,255,0.1)", borderRadius:8, padding:"11px 18px", color:"#78350f", cursor:"pointer", fontSize:12, fontFamily:"'DM Mono',monospace" }}>
            Load sample
          </button>
          <button onClick={()=>emailText.trim()&&analyze(emailText)} disabled={!emailText.trim()}
            style={{ flex:1, background:emailText.trim()?"linear-gradient(135deg,#f97316,#f59e0b)":"rgba(249,115,22,0.15)", border:"none", borderRadius:8, padding:"12px 20px", color:emailText.trim()?"white":"#78350f", cursor:emailText.trim()?"pointer":"not-allowed", fontSize:13, fontFamily:"'DM Mono',monospace", letterSpacing:"0.06em" }}>
            Analyze with AI →
          </button>
        </div>
      </div>
    </div>
  );

  // ── LOADING ────────────────────────────────────────────────────────────────────
  if (screen === "loading") return (
    <div style={{ minHeight:"100vh", background:"#0d0700", color:"white", display:"flex", flexDirection:"column", alignItems:"center", justifyContent:"center", gap:22 }}>
      <style>{BASE_STYLE}</style>
      <div style={{ fontFamily:"'Syne',sans-serif", fontSize:34, fontWeight:800, background:"linear-gradient(135deg,#f97316,#eab308)", WebkitBackgroundClip:"text", WebkitTextFillColor:"transparent" }}>JobRadar</div>
      <div style={{ width:280, height:2, background:"rgba(255,255,255,0.06)", borderRadius:2, overflow:"hidden" }}>
        <div style={{ height:"100%", width:`${loadPct}%`, background:"linear-gradient(90deg,#f97316,#eab308)", transition:"width 0.4s ease", borderRadius:2 }} />
      </div>
      <div style={{ color:"#92400e", fontSize:12, fontFamily:"'DM Mono',monospace" }}>{loadMsg}</div>
    </div>
  );

  // ── DASHBOARD ──────────────────────────────────────────────────────────────────
  if (screen === "dashboard" && result) {
    const s = result.summary || {};
    const companies = result.companies || [];
    const insights = result.insights || [];
    const sc = result.stageCounts || {};

    return (
      <div style={{ minHeight:"100vh", background:"#0d0700", color:"white" }}>
        <style>{BASE_STYLE + `
          .tab{background:none;border:none;cursor:pointer;padding:10px 20px;font-family:'DM Mono',monospace;font-size:11px;letter-spacing:0.09em;transition:all 0.2s;border-bottom:2px solid transparent;text-transform:capitalize;}
          .tab.on{color:#f97316;border-bottom-color:#f97316;}
          .tab:not(.on){color:#78350f;}
          .tab:not(.on):hover{color:#fb923c;}
        `}</style>

        {/* Header */}
        <div style={{ borderBottom:"1px solid rgba(249,115,22,0.12)", padding:"0 36px", display:"flex", alignItems:"center", justifyContent:"space-between", height:58 }}>
          <div style={{ fontFamily:"'Syne',sans-serif", fontSize:20, fontWeight:800, background:"linear-gradient(135deg,#f97316,#eab308)", WebkitBackgroundClip:"text", WebkitTextFillColor:"transparent" }}>JobRadar</div>
          <div style={{ display:"flex" }}>
            {["overview","companies","insights"].map(t=>(
              <button key={t} className={`tab ${tab===t?"on":""}`} onClick={()=>setTab(t)}>{t}</button>
            ))}
          </div>
          <button onClick={()=>{setScreen("input");setResult(null);}}
            style={{ background:"rgba(249,115,22,0.12)", border:"1px solid rgba(249,115,22,0.28)", borderRadius:6, padding:"6px 14px", color:"#fb923c", cursor:"pointer", fontSize:11, fontFamily:"'DM Mono',monospace" }}>
            ↑ New Analysis
          </button>
        </div>

        <div style={{ maxWidth:1080, margin:"0 auto", padding:"36px 36px" }}>

          {tab === "overview" && (
            <>
              {/* Stats */}
              <div style={{ display:"grid", gridTemplateColumns:"repeat(auto-fit,minmax(148px,1fr))", gap:14, marginBottom:36 }}>
                <StatCard label="Applied"       value={s.totalApplications}    sub="total applications"                     accent="#f97316" delay={0}   />
                <StatCard label="Phone Screens" value={s.phoneScreens}         sub={`${Math.round((s.phoneScreens/(s.totalApplications||1))*100)}% reply rate`} accent="#f59e0b" delay={70}  />
                <StatCard label="Technical"     value={s.technicalInterviews}  sub="technical rounds"                       accent="#eab308" delay={140} />
                <StatCard label="Final Round"   value={s.finalRounds}          sub="made it to finals"                      accent="#84cc16" delay={210} />
                <StatCard label="Offers"        value={s.offers}               sub={`${(s.offerRate||0).toFixed(1)}% offer rate`} accent="#22c55e" delay={280} />
                <StatCard label="Rejections"    value={s.rejections}           sub="closed doors"                           accent="#ef4444" delay={350} />
              </div>

              {/* Sankey */}
              <div style={{ background:"rgba(28,14,0,0.65)", border:"1px solid rgba(249,115,22,0.15)", borderRadius:16, padding:"28px 24px 20px", marginBottom:28, backdropFilter:"blur(12px)" }}>
                <div style={{ marginBottom:20 }}>
                  <h3 style={{ fontFamily:"'Syne',sans-serif", fontSize:17, fontWeight:700, marginBottom:3 }}>Conversion Funnel</h3>
                  <p style={{ color:"#78350f", fontSize:11, fontFamily:"'DM Mono',monospace" }}>Hover ribbons to see conversion details · Colored bands show who progressed, fading bands show drop-off</p>
                </div>
                <SankeyDiagram stageCounts={sc} />
              </div>

              {/* Stage conversion bars */}
              <div style={{ display:"grid", gridTemplateColumns:"repeat(4,1fr)", gap:12 }}>
                {[
                  {label:"App → Screen",  rate:s.phoneScreens/(s.totalApplications||1)},
                  {label:"Screen → Tech", rate:s.technicalInterviews/(s.phoneScreens||1)},
                  {label:"Tech → Final",  rate:s.finalRounds/(s.technicalInterviews||1)},
                  {label:"Final → Offer", rate:s.offers/(s.finalRounds||1)},
                ].map((r,i)=>(
                  <div key={i} style={{ background:"rgba(249,115,22,0.07)", border:"1px solid rgba(249,115,22,0.14)", borderRadius:10, padding:"15px 16px" }}>
                    <div style={{ color:"#92400e", fontSize:10, marginBottom:8, fontFamily:"'DM Mono',monospace", letterSpacing:"0.04em" }}>{r.label}</div>
                    <div style={{ fontFamily:"'Syne',sans-serif", fontSize:22, fontWeight:800, color:r.rate>0.3?"#22c55e":r.rate>0.1?"#f59e0b":"#ef4444" }}>
                      {isNaN(r.rate)||!isFinite(r.rate)?"—":`${Math.round(r.rate*100)}%`}
                    </div>
                    <div style={{ marginTop:8, height:2, background:"rgba(255,255,255,0.06)", borderRadius:1 }}>
                      <div style={{ height:"100%", width:`${Math.min(100,(r.rate||0)*100)}%`, background:"linear-gradient(90deg,#f97316,#eab308)", borderRadius:1, transition:"width 1.2s ease" }} />
                    </div>
                  </div>
                ))}
              </div>
            </>
          )}

          {tab === "companies" && (
            <div style={{ background:"rgba(28,14,0,0.65)", border:"1px solid rgba(249,115,22,0.14)", borderRadius:16, overflow:"hidden" }}>
              <div style={{ padding:"18px 20px 14px", borderBottom:"1px solid rgba(249,115,22,0.08)", display:"grid", gridTemplateColumns:"1fr 1fr 130px 90px", gap:16 }}>
                {["Company","Role","Stage","Date"].map(h=>(
                  <span key={h} style={{ color:"#78350f", fontSize:10, letterSpacing:"0.12em", textTransform:"uppercase", fontFamily:"'DM Mono',monospace" }}>{h}</span>
                ))}
              </div>
              {companies.sort((a,b)=>{const o={"Offer":0,"Final Round":1,"Technical":2,"Phone Screen":3,"Applied":4,"Rejected":5};return(o[a.stage]??6)-(o[b.stage]??6);}).map((c,i)=>(
                <CompanyRow key={i} company={c} delay={i*35} />
              ))}
              {companies.length===0&&<div style={{ padding:40, textAlign:"center", color:"#78350f", fontFamily:"'DM Mono',monospace", fontSize:12 }}>No company data extracted.</div>}
            </div>
          )}

          {tab === "insights" && (
            <div style={{ display:"flex", flexDirection:"column", gap:14 }}>
              <div style={{ background:"rgba(34,197,94,0.07)", border:"1px solid rgba(34,197,94,0.2)", borderRadius:14, padding:24, marginBottom:6 }}>
                <h3 style={{ fontFamily:"'Syne',sans-serif", fontSize:17, fontWeight:700, color:"#22c55e", marginBottom:4 }}>AI Analysis</h3>
                <p style={{ color:"#78350f", fontSize:11, fontFamily:"'DM Mono',monospace" }}>Observations from your job search data</p>
              </div>
              {insights.map((ins,i)=>(
                <div key={i} style={{ background:"rgba(28,14,0,0.7)", border:"1px solid rgba(249,115,22,0.1)", borderRadius:12, padding:"18px 22px", display:"flex", gap:14, alignItems:"flex-start", animation:`fadeUp 0.4s ease ${i*0.1}s both` }}>
                  <div style={{ width:26, height:26, borderRadius:6, background:"rgba(249,115,22,0.18)", display:"flex", alignItems:"center", justifyContent:"center", color:"#f97316", fontSize:12, flexShrink:0, fontFamily:"'DM Mono',monospace" }}>{i+1}</div>
                  <p style={{ color:"#a16207", fontSize:13, lineHeight:1.75, fontFamily:"'DM Mono',monospace" }}>{ins}</p>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    );
  }

  return null;
}
