import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Navi — Teman belajar kariermu",
  description: "AI Career & Study Companion untuk calon developer Indonesia."
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="id">
      <body>{children}</body>
    </html>
  );
}
