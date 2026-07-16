import React, { useState, useEffect, lazy, Suspense } from "react";
import { getDashboard } from "./api.js";
import { getSession, signOut } from "./auth.js";
import { T, sans, mono } from "./theme.js";
import { Sidebar, BottomNav, MobileHeader, Topbar } from "./nav.jsx";
import { LoginModal } from "./LoginModal.jsx";
import { Landing } from "./Landing.jsx";

// Each screen is its own code-split chunk, loaded on first navigation. This
// keeps heavy per-screen deps (recharts on Dashboard, pdf-lib on Tax filing)
// out of the initial bundle. Screens are named exports, so map to `default`.
const named = (p, name) => lazy(() => p().then((m) => ({ default: m[name] })));
const Dashboard = named(() => import("./Dashboard.jsx"), "Dashboard");
const Approval = named(() => import("./Approval.jsx"), "Approval");
const Bills = named(() => import("./Bills.jsx"), "Bills");
const Vendors = named(() => import("./Vendors.jsx"), "Vendors");
const TaxFiling = named(() => import("./TaxFiling.jsx"), "TaxFiling");
const Reports = named(() => import("./Reports.jsx"), "Reports");
const Inventory = named(() => import("./Inventory.jsx"), "Inventory");
const Banking = named(() => import("./Banking.jsx"), "Banking");
const AIInbox = named(() => import("./AIInbox.jsx"), "AIInbox");
const Transactions = named(() => import("./Transactions.jsx"), "Transactions");
const Settings = named(() => import("./Settings.jsx"), "Settings");
const Placeholder = named(() => import("./Placeholder.jsx"), "Placeholder");

function ScreenFallback() {
  return (
    <div style={{ display: "flex", alignItems: "center", justifyContent: "center", padding: "80px 16px",
      fontFamily: mono, fontSize: 12, letterSpacing: "0.06em", color: T.faint }}>
      <span style={{ width: 8, height: 8, borderRadius: 999, background: T.teal, marginRight: 8,
        animation: "kpulse 1s ease-in-out infinite" }} />
      Loading…
    </div>
  );
}

function ScreenError({ onRetry }) {
  return (
    <div style={{ padding: "72px 24px", textAlign: "center" }}>
      <div style={{ fontSize: 15, fontWeight: 650, color: T.text }}>This screen hit a snag</div>
      <div style={{ fontSize: 12.5, color: T.muted, marginTop: 6 }}>
        It may be a temporary glitch, or a newer version of the app is available.</div>
      <div style={{ display: "flex", gap: 10, justifyContent: "center", marginTop: 18 }}>
        <button onClick={onRetry} style={{ border: `1px solid ${T.line}`, borderRadius: 9,
          padding: "8px 16px", fontSize: 12.5, fontWeight: 600, color: T.text, background: T.surface,
          cursor: "pointer" }}>Try again</button>
        <button onClick={() => window.location.reload()} style={{ background: T.ink, color: "#fff",
          borderRadius: 9, padding: "8px 16px", fontSize: 12.5, fontWeight: 600, cursor: "pointer" }}>
          Reload app</button>
      </div>
    </div>
  );
}

// Contains a screen error so it never blanks the whole app (nav/shell survive),
// and transparently recovers a stale lazy chunk after a redeploy by reloading
// once. Resets when the user navigates to a different screen.
class ScreenBoundary extends React.Component {
  constructor(props) {
    super(props);
    this.state = { error: null };
  }
  static getDerivedStateFromError(error) {
    return { error };
  }
  componentDidCatch(error) {
    const msg = String((error && error.message) || error || "");
    const chunkFail = /dynamically imported module|loading chunk|importing a module script failed|failed to fetch/i.test(msg);
    if (chunkFail && !sessionStorage.getItem("k-chunk-reload")) {
      sessionStorage.setItem("k-chunk-reload", "1"); // guard against a reload loop
      window.location.reload();
    }
  }
  componentDidUpdate(prev) {
    if (prev.screen !== this.props.screen && this.state.error) this.setState({ error: null });
  }
  render() {
    if (this.state.error) return <ScreenError onRetry={() => this.setState({ error: null })} />;
    return this.props.children;
  }
}

const TITLES = {
  dashboard: "Spend Overview", approval: "Approval queue", bills: "Bills & expenses",
  inventory: "Inventory", banking: "Banking", filing: "Tax filing", vendors: "Vendors",
  reports: "Reports", txns: "All transactions", settings: "Settings", inbox: "AI Inbox",
};
export default function App() {
  const [active, setActive] = useState("dashboard");
  const [session, setSession] = useState(() => getSession());
  const [loginOpen, setLoginOpen] = useState(false);
  const [counts, setCounts] = useState({});
  // Returning signed-in users skip the landing page and go straight to the app.
  const [view, setView] = useState(() => (getSession() ? "app" : "landing"));
  const title = TITLES[active] || "Kashikeyo";
  const isCore = ["dashboard", "approval", "bills"].includes(active);
  const onSignedIn = (s) => { setSession(s); setLoginOpen(false); setView("app"); };
  const auth = {
    session,
    onSignIn: () => setLoginOpen(true),
    onSignOut: () => { signOut(); setSession(null); },
  };

  // Live nav badges: pending approvals + bill count. Refetch on login and nav
  // so the counts reflect actions taken elsewhere in the app. Only runs once
  // the app view is active (skipped on the landing page).
  useEffect(() => {
    if (view !== "app") return;
    let alive = true;
    getDashboard()
      .then((d) => { if (alive && d) setCounts({ approval: d.pendingApprovals, bills: d.billCount }); })
      .catch(() => {});
    return () => { alive = false; };
  }, [session, active, view]);

  if (view === "landing") {
    return (
      <>
        <Landing onSignIn={() => setLoginOpen(true)} onEnter={() => setView("app")} />
        {loginOpen && <LoginModal onClose={() => setLoginOpen(false)} onSignedIn={onSignedIn} />}
      </>
    );
  }

  return (
    <div style={{ fontFamily: sans, color: T.text, minHeight: "100vh", display: "flex",
      background: T.paper }}>
      <style>{`
        @media (prefers-reduced-motion: reduce){ *{transition:none!important;animation:none!important} }
        button:focus-visible{ outline:2px solid ${T.gold}; outline-offset:2px; }
        ::-webkit-scrollbar{height:8px;width:8px}
        ::-webkit-scrollbar-thumb{background:${T.line};border-radius:8px}
        input::placeholder{color:${T.faint}}
        @keyframes kpulse{0%,100%{opacity:.35}50%{opacity:1}}
      `}</style>
      <Sidebar active={active} onNav={setActive} counts={counts} />
      <main className="flex-1 min-w-0 flex flex-col">
        <MobileHeader title={title} />
        <Topbar title={title} auth={auth} />
        <div className="flex-1" style={{ paddingBottom: 64 }} key={session ? "auth" : "anon"}>
          <ScreenBoundary screen={active}>
          <Suspense fallback={<ScreenFallback />}>
            {active === "dashboard" && <Dashboard onNav={setActive} />}
            {active === "approval" && <Approval session={session} onRequireLogin={() => setLoginOpen(true)} />}
            {active === "bills" && <Bills />}
            {active === "vendors" && <Vendors />}
            {active === "filing" && <TaxFiling />}
            {active === "reports" && <Reports />}
            {active === "inventory" && <Inventory />}
            {active === "banking" && <Banking session={session} onRequireLogin={() => setLoginOpen(true)} />}
            {active === "inbox" && <AIInbox session={session} onRequireLogin={() => setLoginOpen(true)} />}
            {active === "settings" && <Settings session={session} onRequireLogin={() => setLoginOpen(true)} />}
            {active === "txns" && <Transactions />}
            {!isCore && !["vendors", "filing", "reports", "inventory", "banking", "inbox", "settings", "txns"].includes(active) && <Placeholder id={active} />}
          </Suspense>
          </ScreenBoundary>
        </div>
      </main>
      <BottomNav active={active} onNav={setActive} counts={counts} />
      {loginOpen && <LoginModal onClose={() => setLoginOpen(false)} onSignedIn={onSignedIn} />}
    </div>
  );
}

