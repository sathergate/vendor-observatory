import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Vendor Observatory",
  description: "Passive observation of AI coding assistant vendor signals",
  openGraph: {
    title: "Revealed Preference > Stated",
    description: "Passive observation of AI coding assistant vendor signals",
    siteName: "Vendor Observatory",
    url: "https://panopticonos.com",
    type: "website",
  },
  twitter: {
    card: "summary_large_image",
    title: "Revealed Preference > Stated",
    description: "Passive observation of AI coding assistant vendor signals",
  },
  metadataBase: new URL("https://panopticonos.com"),
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className="dark">
      <head>
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="anonymous" />
        <link
          href="https://fonts.googleapis.com/css2?family=JetBrains+Mono:wght@400;500&family=Inter:wght@400;500;600&display=swap"
          rel="stylesheet"
        />
      </head>
      <body className="bg-base text-primary min-h-screen antialiased">
        {children}
      </body>
    </html>
  );
}
