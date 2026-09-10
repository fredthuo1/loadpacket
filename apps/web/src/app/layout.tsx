import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "LoadPacket",
  description: "From paperwork to payment.",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}