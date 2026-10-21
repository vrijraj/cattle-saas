import { PageTransition } from "@/components/page-transition";

export default function QrLayout({ children }: { children: React.ReactNode }) {
  return <PageTransition>{children}</PageTransition>;
}