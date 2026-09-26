import Link from "next/link";
import { Mail, Phone, MapPin } from "lucide-react";

export default function Footer({ locale }: { locale: string }) {
  return (
    <footer className="border-t border-slate-200 bg-slate-900 text-slate-300">
      <div className="mx-auto max-w-7xl px-4 py-12">
        <div className="grid gap-8 md:grid-cols-4">
          <div>
            <h3 className="mb-4 text-lg font-bold text-white">
              {locale === "ar" ? "سكني" : "Sakani"}
            </h3>
            <p className="text-sm leading-relaxed">
              {locale === "ar"
                ? "منصة حديثة لإيجاد سكن طلابي موثّق وآمن في الجيزة بالقرب من الجامعات."
                : "A modern platform for finding verified and safe student housing in Giza near universities."}
            </p>
          </div>

          <div>
            <h4 className="mb-4 font-bold text-white">
              {locale === "ar" ? "روابط سريعة" : "Quick Links"}
            </h4>
            <ul className="space-y-2 text-sm">
              <li>
                <Link
                  href={`/${locale}`}
                  className="hover:text-indigo-400 transition"
                >
                  {locale === "ar" ? "الرئيسية" : "Home"}
                </Link>
              </li>
              <li>
                <Link
                  href={`/${locale}/listings`}
                  className="hover:text-indigo-400 transition"
                >
                  {locale === "ar" ? "السكن" : "Listings"}
                </Link>
              </li>
              <li>
                <Link
                  href={`/${locale}/add-property`}
                  className="hover:text-indigo-400 transition"
                >
                  {locale === "ar" ? "أضف سكنك" : "Add Property"}
                </Link>
              </li>
            </ul>
          </div>

          <div>
            <h4 className="mb-4 font-bold text-white">
              {locale === "ar" ? "تواصل معنا" : "Contact"}
            </h4>
            <ul className="space-y-2 text-sm">
              <li className="flex items-start gap-2">
                <Phone size={16} className="mt-1 flex-shrink-0" />
                <a href="tel:+201234567890">+20 123 456 7890</a>
              </li>
              <li className="flex items-start gap-2">
                <Mail size={16} className="mt-1 flex-shrink-0" />
                <a href="mailto:info@sakani.com">info@sakani.com</a>
              </li>
              <li className="flex items-start gap-2">
                <MapPin size={16} className="mt-1 flex-shrink-0" />
                <span>{locale === "ar" ? "الجيزة، مصر" : "Giza, Egypt"}</span>
              </li>
            </ul>
          </div>

          <div>
            <h4 className="mb-4 font-bold text-white">
              {locale === "ar" ? "تابعنا" : "Follow Us"}
            </h4>
            <div className="flex gap-4 text-lg">
              <a href="#" className="hover:text-indigo-400 transition">
                f
              </a>
              <a href="#" className="hover:text-indigo-400 transition">
                X
              </a>
              <a href="#" className="hover:text-indigo-400 transition">
                📷
              </a>
            </div>
          </div>
        </div>

        <div className="mt-8 border-t border-slate-700 pt-8 text-center text-sm">
          <p>
            {locale === "ar"
              ? "© 2024 سكني - جميع الحقوق محفوظة"
              : "© 2024 Sakani - All rights reserved"}
          </p>
        </div>
      </div>
    </footer>
  );
}