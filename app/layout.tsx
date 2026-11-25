import type { Metadata, Viewport } from "next";
import { Google_Sans } from "next/font/google";
import { PwaRegister } from "@/components/pwa-register";
import { siteConfig } from "@/lib/site-config";
import "./globals.css";

const googleSans = Google_Sans({
  subsets: ["latin"],
  variable: "--font-google-sans",
});

export const viewport: Viewport = {
  themeColor: "#0f5c34",
};

export const metadata: Metadata = {
  title: {
    default: siteConfig.name,
    template: `%s · ${siteConfig.name}`,
  },
  description: siteConfig.description,
  applicationName: siteConfig.name,
  manifest: "/manifest.webmanifest",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={googleSans.variable} suppressHydrationWarning>
      <body className="antialiased" suppressHydrationWarning>
        <PwaRegister />
        {children}
      </body>
    </html>
  );
}
