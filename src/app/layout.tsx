import type { Metadata, Viewport } from "next";
import { headers } from "next/headers";
import { Geist } from "next/font/google";
import { ServiceWorker } from "@/components/service-worker";
import "./globals.css";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "Love My Plants",
  description: "Snap a photo, get a plant health check and simple care steps.",
  appleWebApp: { capable: true, title: "My Plants", statusBarStyle: "default" },
  icons: { apple: "/icons/180" },
};

export const viewport: Viewport = {
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#f7f5ef" },
    { media: "(prefers-color-scheme: dark)", color: "#111511" },
  ],
  viewportFit: "cover",
};

export default async function RootLayout({ children }: LayoutProps<"/">) {
  // Reading the request makes every page render per request, so each gets its CSP nonce.
  await headers();
  return (
    <html lang="en" className={`${geistSans.variable} h-full antialiased`}>
      <body className="min-h-full flex flex-col font-sans">
        {children}
        <ServiceWorker />
      </body>
    </html>
  );
}
