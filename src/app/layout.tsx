import type { Metadata } from "next";
import { Analytics } from "@vercel/analytics/next";
import "./globals.css";

export const metadata: Metadata = {
  title: "SCOTUS Dashboard",
  description:
    "Track upcoming and recent US Supreme Court oral arguments. Official case information compiled from the Supreme Court, with AI-assisted summaries to guide research and analysis.",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body>
        {children}
        <Analytics />
      </body>
    </html>
  );
}
