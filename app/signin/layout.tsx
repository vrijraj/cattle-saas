import { PageTransition } from "@/components/page-transition";

export default function SignInLayout({ children }: { children: React.ReactNode }) {
  return <PageTransition>{children}</PageTransition>;
}
