"use client";

import { useState } from "react";
import Link from "next/link";
import { Menu, X } from "lucide-react";

export default function Navbar({ locale }: { locale: string }) {
  const [isOpen, setIsOpen] = useState(false);

  const links = [
    {
      href: `/${locale}`,
      label: locale === "ar" ? "الرئيسية" : "Home",
    },
    {
      href: `/${locale}/listings`,
      label: locale === "ar" ? "السكن" : "Listings",
    },
    {
      href: `/${locale}/add-property`,
      label: locale === "ar" ? "أضف سكنك" : "Add Property",
    },
    {
      href: `/${locale}/contact`,
      label: locale === "ar" ? "تواصل" : "Contact",
    },
  ];

  const otherLocale = locale === "ar" ? "en" : "ar";

  return (
    <nav className="sticky top-0 z-50 border-b border-slate-200 bg-white shadow-sm">
      <div className="mx-auto max-w-7xl px-4">
        <div className="flex items-center justify-between py-4">
          {/* Logo */}
          <Link href={`/${locale}`} className="flex items-center gap-2">
            <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-gradient-to-r from-indigo-600 to-blue-500">
              <span className="text-lg font-bold text-white">S</span>
            </div>
            <div>
              <div className="text-xl font-bold text-slate-900">
                {locale === "ar" ? "سكني" : "Sakani"}
              </div>
              <div className="text-xs text-slate-500">
                {locale === "ar" ? "سكن طلابي" : "Student Housing"}
              </div>
            </div>
          </Link>

          {/* Desktop Links */}
          <div className="hidden items-center gap-8 md:flex">
            {links.map((link) => (
              <Link
                key={link.href}
                href={link.href}
                className="text-slate-700 hover:text-indigo-600 transition font-medium text-sm"
              >
                {link.label}
              </Link>
            ))}
          </div>

          {/* Language Switcher & Mobile Menu */}
          <div className="flex items-center gap-4">
            <Link
              href={`/${otherLocale}`}
              className="px-3 py-2 text-sm font-semibold text-slate-700 hover:text-indigo-600 transition"
            >
              {otherLocale.toUpperCase()}
            </Link>

            {/* Mobile Menu Button */}
            <button
              onClick={() => setIsOpen(!isOpen)}
              className="md:hidden text-slate-700 hover:text-indigo-600"
            >
              {isOpen ? <X size={24} /> : <Menu size={24} />}
            </button>
          </div>
        </div>

        {/* Mobile Menu */}
        {isOpen && (
          <div className="border-t border-slate-200 pb-4 md:hidden">
            {links.map((link) => (
              <Link
                key={link.href}
                href={link.href}
                className="block px-0 py-2 text-slate-700 hover:text-indigo-600 transition font-medium"
                onClick={() => setIsOpen(false)}
              >
                {link.label}
              </Link>
            ))}
          </div>
        )}
      </div>
    </nav>
  );
}