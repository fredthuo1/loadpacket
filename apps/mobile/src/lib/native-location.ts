import * as Location from "expo-location";
import { captureLocation } from "./location";
export const foregroundLocation = () =>
  captureLocation({
    requestPermission: async () =>
      (await Location.requestForegroundPermissionsAsync()).status === "granted",
    current: async () => {
      const position = await Location.getCurrentPositionAsync({
        accuracy: Location.Accuracy.Balanced,
      });
      return {
        latitude: position.coords.latitude,
        longitude: position.coords.longitude,
        accuracyMeters:
          position.coords.accuracy !== null && position.coords.accuracy >= 0
            ? position.coords.accuracy
            : null,
        capturedAt: new Date(position.timestamp).toISOString(),
      };
    },
  });
