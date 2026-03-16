import type { Metadata } from "next";
import { MarketingNavbar } from "@/components/marketing/navbar";
import { MarketingFooter } from "@/components/marketing/footer";
import { WaitlistModal } from "@/components/marketing/WaitlistModal";

export const metadata: Metadata = {
  title: "RouteFlex - Your AI Recruiting Team for FedEx Contractors",
  description:
    "Build a team of AI agents that manages your entire hiring pipeline — from application to first day on route. Built for FedEx Ground contractors.",
};

export default function MarketingLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <div className="min-h-screen flex flex-col">
      <MarketingNavbar />
      <main className="flex-1">{children}</main>
      <MarketingFooter />
      <WaitlistModal />
    </div>
  );
}
