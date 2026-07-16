import { useEffect, useState, useCallback } from "react";
import { getDashboard, getBanking, getDocuments, getCompliance } from "./api.js";

const SEEN_KEY = "kashikeyo.notif.seen.v1";

/**
 * Build the live "things that need attention" list from real API data — the
 * source for both the nav badges and the notifications panel. Each item knows
 * which screen it routes to.
 */
function buildNotifications({ dashboard, banking, documents, compliance }) {
  const items = [];
  const pending = dashboard?.pendingApprovals ?? 0;
  if (pending > 0) {
    items.push({ id: "approvals", icon: "check", tone: "warn", nav: "approval",
      title: `${pending} bill${pending === 1 ? "" : "s"} awaiting approval`,
      detail: "Review and approve or reject in the queue." });
  }
  const unrec = banking?.summary?.unreconciled ?? 0;
  if (unrec > 0) {
    items.push({ id: "banking", icon: "bank", tone: "warn", nav: "banking",
      title: `${unrec} bank line${unrec === 1 ? "" : "s"} to reconcile`,
      detail: "Match statement lines to your payments." });
  }
  const review = documents?.summary?.needsReview ?? 0;
  if (review > 0) {
    items.push({ id: "inbox", icon: "scan", tone: "teal", nav: "inbox",
      title: `${review} document${review === 1 ? "" : "s"} need review`,
      detail: "AI flagged fields to confirm before posting." });
  }
  const filing = compliance?.filing;
  if (filing && filing.daysToDue <= 14) {
    const overdue = filing.daysToDue < 0;
    items.push({ id: "filing", icon: "calendar", tone: overdue ? "risk" : "warn", nav: "filing",
      title: overdue ? `${filing.mira} filing is overdue`
        : `${filing.mira} due in ${filing.daysToDue} day${filing.daysToDue === 1 ? "" : "s"}`,
      detail: `Period ending ${filing.periodEnd}, due ${filing.dueDate}.` });
  }
  if (Math.abs(compliance?.outOfBalanceBy ?? 0) >= 0.01) {
    items.push({ id: "balance", icon: "alert", tone: "risk", nav: "reports",
      title: "Ledger is out of balance", detail: "Debits and credits don't match — review the reports." });
  }
  return items;
}

const signatureOf = (items) => items.map((i) => i.id + i.title).join("|");

/**
 * Fetches the app-wide signals once (and on demand): nav badge counts, the
 * inventory value (so the dashboard isn't hardcoded), and a live notifications
 * list with read/unread tracking persisted in localStorage.
 */
export function useAppSignals(active, session, enabled) {
  const [data, setData] = useState({ counts: {}, notifications: [], loading: true });
  const [seen, setSeen] = useState(() => {
    try { return localStorage.getItem(SEEN_KEY) || ""; } catch { return ""; }
  });

  const refresh = useCallback(async () => {
    const [dashboard, banking, documents, compliance] = await Promise.all([
      getDashboard().catch(() => null),
      getBanking().catch(() => null),
      getDocuments().catch(() => null),
      getCompliance().catch(() => null),
    ]);
    setData({
      loading: false,
      notifications: buildNotifications({ dashboard, banking, documents, compliance }),
      counts: {
        approval: dashboard?.pendingApprovals || 0,
        bills: dashboard?.billCount || 0,
        banking: banking?.summary?.unreconciled || 0,
        inbox: documents?.summary?.needsReview || 0,
      },
    });
  }, []);

  // Fetch once when the app opens and again after sign-in/out — not on every
  // navigation (that would be four requests per click).
  useEffect(() => {
    if (!enabled) return;
    let alive = true;
    refresh().catch(() => alive && setData((d) => ({ ...d, loading: false })));
    return () => { alive = false; };
  }, [enabled, session, refresh]);

  const signature = signatureOf(data.notifications);
  const unread = signature && signature !== seen ? data.notifications.length : 0;
  const markRead = useCallback(() => {
    setSeen(signature);
    try { localStorage.setItem(SEEN_KEY, signature); } catch { /* ignore */ }
  }, [signature]);

  return { ...data, unread, markRead, refresh };
}
