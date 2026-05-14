import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "MediaPulse Sénégal",
  description: "Monitoring des matinales TV sénégalaises",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="fr">
      <body>{children}</body>
    </html>
  );
}
