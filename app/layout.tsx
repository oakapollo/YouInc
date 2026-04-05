import "./globals.css";
import type { Metadata, Viewport } from "next";
import { AuthProvider } from "./providers";

export const metadata: Metadata = {
  title: "YouInc",
  description: "You are the stock.",
  manifest: "/manifest.webmanifest",
  applicationName: "YouInc",
  appleWebApp: {
    capable: true,
    statusBarStyle: "black-translucent",
    title: "YouInc",
  },
  icons: {
    apple: "/apple-touch-icon.png",
    icon: [
      { url: "/icon-192.png", sizes: "192x192", type: "image/png" },
      { url: "/icon-512.png", sizes: "512x512", type: "image/png" },
    ],
  },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
  themeColor: "#070a12",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body>
        <AuthProvider>{children}</AuthProvider>
      </body>
    </html>
  );
}