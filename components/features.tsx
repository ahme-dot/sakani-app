import {
    Shield,
    SearchCheck,
    MessageSquare,
    Zap,
    Star,
    Lock,
  } from "lucide-react";
  
  export default function Features({ locale }: { locale: string }) {
    const features = [
      {
        icon: Shield,
        title: locale === "ar" ? "سكن موثّق" : "Verified Housing",
        description:
          locale === "ar"
            ? "كل الوحدات مفحوصة وموثقة بمعلومات دقيقة وصور حقيقية"
            : "All units are verified with accurate info and real photos",
      },
      {
        icon: SearchCheck,
        title: locale === "ar" ? "بحث سهل" : "Easy Search",
        description:
          locale === "ar"
            ? "فلترة متقدمة حسب الجامعة والسعر والموقع والمرافق"
            : "Advanced filters by university, price, location, amenities",
      },
      {
        icon: MessageSquare,
        title: locale === "ar" ? "تواصل مباشر" : "Direct Contact",
        description:
          locale === "ar"
            ? "اتصل أو راسل المالك مباشرة عبر الواتساب والهاتف"
            : "Contact owner directly via WhatsApp and phone",
      },
      {
        icon: Zap,
        title: locale === "ar" ? "سريع وفعال" : "Fast & Efficient",
        description:
          locale === "ar"
            ? "احفظ المفضلة وطلب معاينة وقارن بسهولة بين الخيارات"
            : "Save favorites, request viewings, compare easily",
      },
      {
        icon: Star,
        title: locale === "ar" ? "آراء حقيقية" : "Real Reviews",
        description:
          locale === "ar"
            ? "اقرأ تقييمات من طلبة سابقين ومالكي سكن"
            : "Read reviews from previous students and landlords",
      },
      {
        icon: Lock,
        title: locale === "ar" ? "آمن ومضمون" : "Safe & Secure",
        description:
          locale === "ar"
            ? "معلومات آمنة وعملية تحقق صارمة لكل العقارات"
            : "Secure data and strict verification for all properties",
      },
    ];
  
    return (
      <section className="bg-white py-16">
        <div className="mx-auto max-w-7xl px-4">
          <div className="mb-12 text-center">
            <h2 className="text-3xl font-bold text-slate-900">
              {locale === "ar" ? "لماذا سكني؟" : "Why Sakani?"}
            </h2>
            <p className="mt-4 text-lg text-slate-600">
              {locale === "ar"
                ? "نحن نجعل البحث عن السكن الطلابي سهلًا وآمنًا وموثوقًا"
                : "We make finding student housing easy, safe, and reliable"}
            </p>
          </div>
  
          <div className="grid gap-8 md:grid-cols-2 lg:grid-cols-3">
            {features.map((feature, idx) => {
              const Icon = feature.icon;
              return (
                <div
                  key={idx}
                  className="rounded-2xl border border-slate-200 bg-slate-50 p-8 hover:border-indigo-300 hover:shadow-lg transition"
                >
                  <div className="mb-4 inline-block rounded-lg bg-indigo-100 p-3">
                    <Icon size={24} className="text-indigo-600" />
                  </div>
                  <h3 className="mb-2 text-xl font-bold text-slate-900">
                    {feature.title}
                  </h3>
                  <p className="text-slate-600">{feature.description}</p>
                </div>
              );
            })}
          </div>
        </div>
      </section>
    );
  }