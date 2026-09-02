/**
 * Moved to components/ui/stat-card.tsx — it was never admin-specific, and the
 * account dashboard was the third surface to want it. Re-exported rather than
 * duplicated so the admin pages keep their import path.
 */
export { StatCard } from "@/components/ui/stat-card";
