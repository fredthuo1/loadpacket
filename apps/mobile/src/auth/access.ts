import type { ApplicationUser } from "../../../../packages/api-contracts/driver";
export function driverAccess(
  user: ApplicationUser | null,
): "driver" | "role" | "onboarding" {
  if (!user || user.onboardingRequired) return "onboarding";
  if (user.role !== "DRIVER") return "role";
  return user.driver ? "driver" : "onboarding";
}
