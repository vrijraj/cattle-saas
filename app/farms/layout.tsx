import { PageTransition } from "@/components/page-transition";

export default function FarmsLayout({ children }: { children: React.ReactNode }) {
  return <PageTransition>{children}</PageTransition>;
}
