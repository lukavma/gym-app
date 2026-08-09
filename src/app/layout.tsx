import type { Metadata, Viewport } from "next";
import { ServiceWorkerUpdater } from "@/ui/ServiceWorkerUpdater";
import "./globals.css";

export const metadata: Metadata = {
  title: "Gym App",
  description: "Personal strength training tracker.",
  manifest: "/manifest.webmanifest",
  appleWebApp: {
    capable: true,
    statusBarStyle: "default",
    title: "Gym App",
  },
  icons: {
    icon: [
      { url: "/icons/icon-192.png", sizes: "192x192", type: "image/png" },
      { url: "/icons/icon-512.png", sizes: "512x512", type: "image/png" },
    ],
    apple: [{ url: "/icons/apple-touch-icon.png", sizes: "180x180", type: "image/png" }],
  },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
  themeColor: "#0f172a",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body className="min-h-dvh bg-slate-950 text-slate-50 antialiased">
        {children}
        <ServiceWorkerUpdater />
      </body>
    </html>
  );
}
