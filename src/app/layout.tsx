import type { Metadata, Viewport } from "next";
import Script from "next/script";
import "./globals.css";

export const metadata: Metadata = {
  metadataBase: new URL("https://www.cukaiku.my"),
  title: "CukaiKu — LHDN Tax Relief & Receipt Manager",
  description:
    "Personal Malaysia LHDN tax relief tracker, sub-limit maximizer, AI receipt scanner, and 7-year audit vault.",
  manifest: "/manifest.webmanifest",
  icons: {
    icon: [
      { url: "/favicon.ico", sizes: "any" },
      { url: "/favicon-32x32.png", sizes: "32x32", type: "image/png" },
      { url: "/icon-192.png", sizes: "192x192", type: "image/png" },
      { url: "/icon-512.png", sizes: "512x512", type: "image/png" },
    ],
    apple: [
      { url: "/apple-touch-icon.png", sizes: "180x180", type: "image/png" },
    ],
  },
  openGraph: {
    title: "CukaiKu — LHDN Tax Relief & Receipt Manager",
    description:
      "Personal Malaysia LHDN tax relief tracker, sub-limit maximizer, and 7-year receipt vault.",
    url: "https://www.cukaiku.my",
    siteName: "CukaiKu",
    images: [
      {
        url: "/logo.png",
        width: 1024,
        height: 1024,
        alt: "CukaiKu Official Logo",
      },
    ],
    locale: "en_MY",
    type: "website",
  },
  appleWebApp: {
    capable: true,
    statusBarStyle: "default",
    title: "CukaiKu",
  },
};

export const viewport: Viewport = {
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#F6F8FA" },
    { media: "(prefers-color-scheme: dark)", color: "#0B0F17" },
  ],
  width: "device-width",
  initialScale: 1,
  maximumScale: 1,
  viewportFit: "cover",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body className="antialiased">
        <Script
          src="https://accounts.google.com/gsi/client"
          strategy="afterInteractive"
        />
        {children}
      </body>
    </html>
  );
}
