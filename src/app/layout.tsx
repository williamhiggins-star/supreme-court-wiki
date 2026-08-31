import type { Metadata } from "next";
import { Analytics } from "@vercel/analytics/next";
import "./globals.css";

const TITLE = "SCOTUS Dashboard";
const DESCRIPTION =
  "Track upcoming and recent US Supreme Court oral arguments. Official case information compiled from the Supreme Court, with AI-assisted summaries to guide research and analysis.";

export const metadata: Metadata = {
  // Link scrapers (iMessage, WhatsApp, Slack, etc.) can't resolve relative
  // image paths -- this makes every metadata.images URL absolute.
  metadataBase: new URL("https://scotusdashboard.com"),
  title: TITLE,
  description: DESCRIPTION,
  openGraph: {
    title: TITLE,
    description: DESCRIPTION,
    url: "https://scotusdashboard.com",
    siteName: TITLE,
    type: "website",
    // Source image is 1080x1350 (portrait), not the usual 1200x630 OG
    // landscape -- explicit width/height here (rather than the 1200x630
    // default) so scrapers render it at its real aspect ratio instead of
    // guessing and distorting it. JPEG, not WebP -- iMessage's link-
    // preview scraper doesn't reliably support WebP.
    images: [{ url: "/og-image.jpg", width: 1080, height: 1350 }],
  },
  twitter: {
    card: "summary_large_image",
    title: TITLE,
    description: DESCRIPTION,
    images: ["/og-image.jpg"],
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <head>
        <link
          href="https://fonts.googleapis.com/css2?family=Playfair+Display:ital,wght@0,400;0,500;0,600;0,700;1,400;1,500;1,600;1,700&family=Lora:ital,wght@0,400;1,400&display=swap"
          rel="stylesheet"
        />
      </head>
      <body>
        {children}
        <Analytics />
      </body>
    </html>
  );
}
