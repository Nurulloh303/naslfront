export type CabinetRoute = "create" | "projects" | "billing" | "history" | "profile" | "referrals" | "api" | "privacy" | "terms" | "offer" | "audit" | "listing" | "admin";

export function routeFromHash(hash: string): CabinetRoute {
  const route = hash.replace(/^#\/?/, "").split("/")[0];
  return (["projects", "billing", "history", "profile", "referrals", "api", "privacy", "terms", "offer", "audit", "listing", "admin"] as string[]).includes(route) ? route as CabinetRoute : "create";
}
