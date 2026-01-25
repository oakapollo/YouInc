import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "YouInc",
  description: "You are the stock.",
  manifest: "/manifest.webmanifest",
  themeColor: "#070a12",
  appleWebApp: {
    capable: true,
    statusBarStyle: "black-translucent",

    title: "YouInc",
     },
  icons: {
    icon: "/icon.svg",
    apple: "/icon.svg",
  },
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}