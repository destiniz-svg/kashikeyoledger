// Friendly display helpers for the signed-in user.

/** A human first name from the sign-in email (best effort), Title-cased. */
export function displayName(session) {
  const email = session?.user?.email || "";
  const local = email.split("@")[0] || "";
  const first = local.split(/[._-]+/)[0] || local;
  if (!first) return "there";
  return first.charAt(0).toUpperCase() + first.slice(1);
}

/** Two-letter initials for an avatar. */
export function initials(session) {
  const email = session?.user?.email || "";
  const local = email.split("@")[0] || "?";
  const parts = local.split(/[._-]+/).filter(Boolean);
  if (parts.length >= 2) return (parts[0][0] + parts[1][0]).toUpperCase();
  return local.slice(0, 2).toUpperCase();
}

/** Time-of-day greeting using the viewer's local clock. */
export function greeting() {
  const h = new Date().getHours();
  if (h < 12) return "Good morning";
  if (h < 17) return "Good afternoon";
  return "Good evening";
}
