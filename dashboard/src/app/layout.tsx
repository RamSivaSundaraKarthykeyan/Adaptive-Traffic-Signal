import type { Metadata } from "next";
import { Inter } from "next/font/google";
import "./globals.css";

const inter = Inter({ subsets: ["latin"], variable: "--font-inter" });

export const metadata: Metadata = {
  title: "Tamil Nadu ITMS — Smart Traffic AI",
  description: "AI-powered Intelligent Traffic Management System for Tamil Nadu. Real-time vehicle detection, accident analysis, and signal optimization.",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={inter.variable}>
      <body className="bg-[#0a0a0c] text-gray-100 antialiased">{children}</body>
    </html>
  );
}
