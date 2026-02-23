import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "The Supreme Court",
  description:
    "Plain-English summaries of US Supreme Court oral arguments, with explanations of legal terms and precedent cases.",
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
