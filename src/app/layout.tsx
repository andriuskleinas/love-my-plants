import type { Metadata, Viewport } from "next";
import { headers } from "next/headers";
import { Space_Grotesk } from "next/font/google";
import { ServiceWorker } from "@/components/service-worker";
import "./globals.css";

// Space Grotesk: the closest free match to Anthropic's Styrene (which needs a paid licence).
const spaceGrotesk = Space_Grotesk({
  variable: "--font-space-grotesk",
  subsets: ["latin"],
});

const description =
  "Snap a photo of your house plant and get a health check, three simple steps for today, and reminders when it's thirsty.";

export const metadata: Metadata = {
  metadataBase: new URL(process.env.APP_URL ?? "https://love-my-plants.vercel.app"),
  title: "Love My Plants",
  description,
  openGraph: { title: "Love My Plants", description, siteName: "Love My Plants", type: "website" },
  twitter: { card: "summary_large_image" },
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
    <html lang="en" className={`${spaceGrotesk.variable} h-full antialiased`}>
      <body className="min-h-full flex flex-col font-sans">
        {children}
        <ServiceWorker />
      </body>
    </html>
  );
}
