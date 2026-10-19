import type { Metadata, Viewport } from "next";
import { headers } from "next/headers";
import { Cairo, Inter } from "next/font/google";
import "./globals.css";
import type { ReactNode } from "react";
import { SITE_URL } from "@/lib/site";
import { SITE_COPY } from "@/messages/site";

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
  metadataBase: new URL(SITE_URL),
  title: SITE_COPY.ar.metaTitle,
  description: SITE_COPY.ar.metaDescription,
  applicationName: "Sakani",
  keywords: ["سكن طلابي", "الجيزة", "القاهرة", "سكني", "student housing", "Giza", "Sakani"],
  authors: [{ name: "Sakani Team" }],
  robots: { index: true, follow: true },
  formatDetection: { telephone: false },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  themeColor: "#fbfaf7",
};

export default async function RootLayout({
  children,
}: {
  children: ReactNode;
}) {
  const locale = (await headers()).get("x-sakani-locale") === "en" ? "en" : "ar";

  return (
    <html lang={locale} dir={locale === "ar" ? "rtl" : "ltr"} data-scroll-behavior="smooth">
      <body className={`${cairo.variable} ${inter.variable}`}>
        {children}
      </body>
    </html>
  );
}