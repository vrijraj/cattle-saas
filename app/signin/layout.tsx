import { ScreenTransition } from "@/components/page-transition";

export default function SignInLayout({ children }: { children: React.ReactNode }) {
  return <ScreenTransition>{children}</ScreenTransition>;
}
