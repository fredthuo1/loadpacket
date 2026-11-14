import type { Metadata } from "next";
import { Welcome } from "./welcome";
export const metadata: Metadata = {
  title: "LoadPacket — From load to paid.",
  description:
    "Turn rate confirmations into loads. Keep drivers, documents and billing connected with LoadPacket.",
};
export default function WelcomePage() {
  return <Welcome />;
}

