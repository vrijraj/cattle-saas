import type { Metadata } from "next";
import { Google_Sans } from "next/font/google";
import { ClientRender } from "@/components/client-render";
import { siteConfig } from "@/lib/site-config";
import "./globals.css";

const googleSans = Google_Sans({
  subsets: ["latin"],
  variable: "--font-google-sans",
});

export const metadata: Metadata = {
  title: {
    default: siteConfig.name,
    template: `%s · ${siteConfig.name}`,
  },
  description: siteConfig.description,
  applicationName: siteConfig.name,
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={googleSans.variable} suppressHydrationWarning>
      <body className="antialiased" suppressHydrationWarning>
        <ClientRender>{children}</ClientRender>
      </body>
    </html>
  );
}
