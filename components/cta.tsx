import Link from "next/link";
import { ArrowRight } from "lucide-react";

export default function CTA({ locale }: { locale: string }) {
  return (
    <section className="bg-gradient-to-r from-indigo-600 to-blue-600 py-16">
      <div className="mx-auto max-w-4xl px-4 text-center text-white">
        <h2 className="text-3xl font-bold md:text-4xl">
          {locale === "ar"
            ? "هل عندك سكن طلابي؟"
            : "Do you have student housing?"}
        </h2>
        <p className="mt-4 text-lg text-blue-50">
          {locale === "ar"
            ? "أضف وحدتك الآن واستقبل طلبات من طلبة موثوقة في الجيزة"
            : "List your property now and receive inquiries from verified students in Giza"}
        </p>

        <Link
          href={`/${locale}/add-property`}
          className="mt-8 inline-flex items-center gap-2 rounded-lg bg-white px-8 py-4 font-bold text-indigo-600 hover:bg-slate-100 transition"
        >
          {locale === "ar" ? "أضف سكنك الآن" : "List Your Property Now"}
          <ArrowRight size={20} />
        </Link>
      </div>
    </section>
  );
}