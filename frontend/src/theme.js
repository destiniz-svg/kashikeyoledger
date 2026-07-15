import { useState, useEffect } from "react";

/* ---------------------------------------------------------------------------
   Design tokens — "ledger at depth", now on a light, airy 44-style canvas
--------------------------------------------------------------------------- */
export const T = {
  ink: "#0B2A2E", inkSoft: "#123A40",
  paper: "#F7F8F6", surface: "#FFFFFF", line: "#E7EAE7", line2: "#F0F2EF",
  gold: "#B8892B", goldSoft: "#F4EAD0",
  teal: "#2A6F77", tealSoft: "#E6F0F0", tealSofter: "#F0F6F6",
  claim: "#127A5A", claimSoft: "#E0F0E8",
  warn: "#9C6A15", warnSoft: "#F6EBD6",
  exempt: "#A2382A", exemptSoft: "#F6E3DF",
  text: "#0F2124", muted: "#5B6B69", faint: "#8A9896",
};
export const mono = 'ui-monospace, "SF Mono", "SFMono-Regular", Menlo, monospace';
export const sans = '"Inter", system-ui, -apple-system, "Segoe UI", Roboto, sans-serif';
export const num = { fontFamily: mono, fontVariantNumeric: "tabular-nums" };

export const fmt = (n, cur = "MVR") =>
  `${cur === "MVR" ? "Rf" : "$"} ${Number(n).toLocaleString("en-US", {
    minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
export const fmt0 = (n) => `Rf ${Number(n).toLocaleString("en-US")}`;

export const MON_SHORT = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
export const MON_LONG = ["January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December"];
export const fmtDate = (iso) => {
  if (!iso) return "—";
  const [y, m, d] = iso.split("-").map(Number);
  return `${String(d).padStart(2, "0")} ${MON_SHORT[m - 1]} ${y}`;
};
export const monthLabel = (iso) => {
  const [y, m] = iso.split("-").map(Number);
  return `${MON_LONG[m - 1]} ${y}`;
};

export function useW() {
  const [w, setW] = useState(() => typeof window !== "undefined" ? window.innerWidth : 1280);
  useEffect(() => {
    const on = () => setW(window.innerWidth);
    window.addEventListener("resize", on);
    return () => window.removeEventListener("resize", on);
  }, []);
  return w;
}
export const dec2 = (n) => Number(n).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
