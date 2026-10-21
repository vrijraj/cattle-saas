import type { Metadata } from "next";
import { Google_Sans } from "next/font/google";
import "./globals.css";

const googleSans = Google_Sans({
  subsets: ["latin"],
  variable: "--font-google-sans",
});

export const metadata: Metadata = {
  title: {
    default: "Farm portal",
    template: "%s · Farm portal",
  },
  description: "Cattle, milk, breeding, and health records for a dairy farm.",
  applicationName: "Farm portal",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={googleSans.variable}>
      <body className="antialiased">{children}</body>
    </html>
  );
}
