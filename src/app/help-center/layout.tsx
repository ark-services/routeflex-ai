import type { Metadata } from "next";
import { HelpCenterNavbar } from "@/components/help-center/Navbar";
import { HelpCenterFooter } from "@/components/help-center/Footer";

export const metadata: Metadata = {
  title: "Help Center | RouteFlex",
  description:
    "Find answers, browse documentation, and get support for using RouteFlex.",
};

export default function HelpCenterLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <div className="min-h-screen flex flex-col bg-rf-surface">
      <HelpCenterNavbar />
      <main className="flex-1">{children}</main>
      <HelpCenterFooter />
    </div>
  );
}
