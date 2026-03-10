import Link from "next/link";
import { RouteFlexLogo } from "@/components/ui/routeflex-logo";

const footerLinks = {
  Product: [
    { label: "Features", href: "/features" },
    { label: "Pricing", href: "/pricing" },
  ],
  Company: [
    { label: "Log in", href: "/login" },
    { label: "Sign Up", href: "/signup" },
  ],
  Legal: [
    { label: "Privacy Policy", href: "#" },
    { label: "Terms of Service", href: "#" },
  ],
};

export function MarketingFooter() {
  return (
    <footer className="bg-[#0F1623]">
      <div className="max-w-7xl mx-auto px-6 lg:px-10 py-16">
        <div className="grid grid-cols-2 md:grid-cols-4 gap-10">
          {/* Brand column */}
          <div className="col-span-2 md:col-span-1">
            <RouteFlexLogo size="nav" />
            <p className="mt-4 text-sm text-[#9BAABB] leading-relaxed">
              The recruiting platform built for FedEx Ground contractors.
            </p>
          </div>

          {/* Link columns */}
          {Object.entries(footerLinks).map(([heading, links]) => (
            <div key={heading}>
              <h4 className="text-xs font-bold uppercase tracking-[0.2em] text-[#4A5568] mb-4">
                {heading}
              </h4>
              <ul className="space-y-2.5">
                {links.map((link) => (
                  <li key={link.label}>
                    <Link
                      href={link.href}
                      className="text-sm text-[#9BAABB] hover:text-white transition-colors"
                    >
                      {link.label}
                    </Link>
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>

        {/* Bottom bar */}
        <div className="border-t border-[#2A3347] pt-8 mt-12">
          <p className="text-sm text-[#4A5568]">
            &copy; {new Date().getFullYear()} RouteFlex. All rights reserved.
          </p>
        </div>
      </div>
    </footer>
  );
}
