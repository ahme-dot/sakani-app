import type { Metadata } from "next";
import { Cairo, Inter } from "next/font/google";
import "./globals.css";
import { ReactNode } from "react";

const cairo = Cairo({
  subsets: ["arabic"],
  weight: ["400", "700"],
  variable: "--font-cairo",
});

const inter = Inter({
  subsets: ["latin"],
  weight: ["400", "600", "700"],
  variable: "--font-inter",
});

export const metadata: Metadata = {
  title: "سكني | Sakani - Student Housing Giza",
  description:
    "Find verified student housing near your university in Giza",
  keywords:
    "student housing, سكن طلابي, جيزة, الجيزة, سكني, sakani",
  authors: [{ name: "Sakani Team" }],
  viewport: "width=device-width, initial-scale=1",
  robots: "index, follow",
};

export default function RootLayout({
  children,
}: {
  children: ReactNode;
}) {
  return (
    <html lang="ar" dir="rtl" suppressHydrationWarning>
      <head>
        <meta charSet="utf-8" />
        <meta name="theme-color" content="#4f46e5" />
        <link rel="icon" href="/favicon.ico" />
      </head>
      <body
        className={`${cairo.variable} ${inter.variable} bg-slate-50 text-slate-900`}
      >
        {children}
      </body>
    </html>
  );
}