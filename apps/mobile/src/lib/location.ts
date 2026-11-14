import type { EventLocation } from "../../../../packages/api-contracts/driver";
export interface LocationAdapter {
  requestPermission(): Promise<boolean>;
  current(): Promise<EventLocation>;
}
export async function captureLocation(
  adapter: LocationAdapter,
  timeoutMs = 12_000,
): Promise<{ location: EventLocation | null; reason?: string }> {
  try {
    if (!(await adapter.requestPermission()))
      return { location: null, reason: "Location permission was not granted." };
    let timer: ReturnType<typeof setTimeout> | undefined;
    try {
      const location = await Promise.race([
        adapter.current(),
        new Promise<never>((_resolve, reject) => {
          timer = setTimeout(
            () => reject(new Error("Location timed out.")),
            timeoutMs,
          );
        }),
      ]);
      return { location };
    } finally {
      clearTimeout(timer);
    }
  } catch {
    return {
      location: null,
      reason: "Your current location could not be determined.",
    };
  }
}
