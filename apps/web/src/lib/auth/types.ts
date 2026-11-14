export type UserRole = "OWNER" | "DISPATCHER" | "BACK_OFFICE" | "DRIVER";
export const publicAccountRoutes = [
  "/welcome",
  "/login",
  "/auth/invite",
  "/auth/confirm",
  "/auth/callback",
  "/auth/register",
  "/auth/start",
  "/auth/staff",
  "/auth/forgot",
  "/auth/reset",
  "/broker/t",
];
export type CurrentUser = {
  onboardingRequired?: boolean;
  id: string;
  authUserId: string;
  organizationId: string;
  role: UserRole;
  firstName: string;
  lastName: string;
  email: string;
  driver: { id: string; name: string } | null;
};

export function landingPage(role: UserRole) {
  return role === "DRIVER"
    ? "/driver"
    : role === "BACK_OFFICE"
      ? "/back-office"
      : "/";
}

export function canVisit(role: UserRole, pathname: string) {
  if (pathname === "/settings/team") return role === "OWNER";
  if (pathname === "/finance" || pathname.startsWith("/finance/"))
    return role === "OWNER" || role === "BACK_OFFICE";
  if (pathname === "/documents") return true;
  if (role === "DRIVER")
    return pathname === "/driver" || pathname.startsWith("/driver/");
  if (pathname === "/driver" || pathname.startsWith("/driver/")) return false;
  if (pathname === "/settings/company") return role === "OWNER";
  if (pathname === "/drivers" || pathname.startsWith("/drivers/"))
    return role === "OWNER" || role === "DISPATCHER";
  if (pathname.startsWith("/back-office"))
    return role === "OWNER" || role === "BACK_OFFICE";
  if (pathname === "/" || pathname.startsWith("/loads/new"))
    return role === "OWNER" || role === "DISPATCHER";
  return pathname.startsWith("/loads/");
}
