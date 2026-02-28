import type { Metadata } from "next";
import { Darker_Grotesque, DM_Mono } from "next/font/google";
import "./globals.css";

const darkerGrotesque = Darker_Grotesque({
  variable: "--font-darker-grotesque",
  subsets: ["latin"],
  weight: ["400", "500", "600", "700", "800", "900"],
});

const dmMono = DM_Mono({
  variable: "--font-dm-mono",
  subsets: ["latin"],
  weight: ["400", "500"],
});

export const metadata: Metadata = {
  title: "RouteFlex",
  description: "Automated recruiting for FedEx contractors",
  icons: {
    icon: "/favicon.ico",
    apple: "/apple-touch-icon.png",
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body
        className={`${darkerGrotesque.variable} ${dmMono.variable} antialiased bg-rf-surface-page min-h-screen`}
      >
        {children}
      </body>
    </html>
  );
}
