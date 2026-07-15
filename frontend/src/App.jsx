import React, { useState, useEffect } from "react";
import { getDashboard } from "./api.js";
import { getSession, signOut } from "./auth.js";
import { T, sans } from "./theme.js";
import { Sidebar, BottomNav, MobileHeader, Topbar } from "./nav.jsx";
import { Dashboard } from "./Dashboard.jsx";
import { Approval } from "./Approval.jsx";
import { Bills } from "./Bills.jsx";
import { Vendors } from "./Vendors.jsx";
import { TaxFiling } from "./TaxFiling.jsx";
import { Reports } from "./Reports.jsx";
import { Inventory } from "./Inventory.jsx";
import { Banking } from "./Banking.jsx";
import { Transactions } from "./Transactions.jsx";
import { Settings } from "./Settings.jsx";
import { Placeholder } from "./Placeholder.jsx";
import { LoginModal } from "./LoginModal.jsx";

const TITLES = {
  dashboard: "Spend Overview", approval: "Approval queue", bills: "Bills & expenses",
  inventory: "Inventory", banking: "Banking", filing: "Tax filing", vendors: "Vendors",
  reports: "Reports", txns: "All transactions", settings: "Settings",
};
export default function App() {
  const [active, setActive] = useState("dashboard");
  const [session, setSession] = useState(() => getSession());
  const [loginOpen, setLoginOpen] = useState(false);
  const [counts, setCounts] = useState({});
  const title = TITLES[active] || "Kashikeyo";
  const isCore = ["dashboard", "approval", "bills"].includes(active);
  const auth = {
    session,
    onSignIn: () => setLoginOpen(true),
    onSignOut: () => { signOut(); setSession(null); },
  };
  // Live nav badges: pending approvals + bill count. Refetch on login and nav
  // so the counts reflect actions taken elsewhere in the app.
  useEffect(() => {
    let alive = true;
    getDashboard()
      .then((d) => { if (alive && d) setCounts({ approval: d.pendingApprovals, bills: d.billCount }); })
      .catch(() => {});
    return () => { alive = false; };
  }, [session, active]);

  return (
    <div style={{ fontFamily: sans, color: T.text, minHeight: "100vh", display: "flex",
      background: T.paper }}>
      <style>{`
        @media (prefers-reduced-motion: reduce){ *{transition:none!important;animation:none!important} }
        button:focus-visible{ outline:2px solid ${T.gold}; outline-offset:2px; }
        ::-webkit-scrollbar{height:8px;width:8px}
        ::-webkit-scrollbar-thumb{background:${T.line};border-radius:8px}
        input::placeholder{color:${T.faint}}
      `}</style>
      <Sidebar active={active} onNav={setActive} counts={counts} />
      <main className="flex-1 min-w-0 flex flex-col">
        <MobileHeader title={title} />
        <Topbar title={title} auth={auth} />
        <div className="flex-1" style={{ paddingBottom: 64 }} key={session ? "auth" : "anon"}>
          {active === "dashboard" && <Dashboard onNav={setActive} />}
          {active === "approval" && <Approval session={session} onRequireLogin={() => setLoginOpen(true)} />}
          {active === "bills" && <Bills />}
          {active === "vendors" && <Vendors />}
          {active === "filing" && <TaxFiling />}
          {active === "reports" && <Reports />}
          {active === "inventory" && <Inventory />}
          {active === "banking" && <Banking session={session} onRequireLogin={() => setLoginOpen(true)} />}
          {active === "settings" && <Settings session={session} onRequireLogin={() => setLoginOpen(true)} />}
          {active === "txns" && <Transactions />}
          {!isCore && !["vendors", "filing", "reports", "inventory", "banking", "settings", "txns"].includes(active) && <Placeholder id={active} />}
        </div>
      </main>
      <BottomNav active={active} onNav={setActive} counts={counts} />
      {loginOpen && <LoginModal onClose={() => setLoginOpen(false)}
        onSignedIn={(s) => { setSession(s); setLoginOpen(false); }} />}
    </div>
  );
}

