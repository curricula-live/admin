import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "curricula.live — Administration",
  description: "Private owner administration workspace for curricula.live",
  robots: { index: false, follow: false },
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
