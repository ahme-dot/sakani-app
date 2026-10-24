"use client";

import { useEffect, useState } from "react";
import {
  ArrowDownRight,
  ArrowLeft,
  ArrowRight,
  ArrowUpRight,
  BedDouble,
  Building2,
  Check,
  ChevronDown,
  CircleHelp,
  Globe2,
  Heart,
  LayoutDashboard,
  MapPin,
  Menu,
  Search,
  ShieldCheck,
  SlidersHorizontal,
  Sparkles,
  UserRound,
} from "lucide-react";
import styles from "./design-studio.module.css";

type Locale = "en" | "ar";
type ConceptId = "cairo-editorial" | "campus-pulse" | "sakani-reserve";
type ScreenId = "home" | "listing" | "host" | "help" | "account" | "admin";
type Device = "desktop" | "mobile";

type Concept = {
  id: ConceptId;
  title: string;
  arabicTitle: string;
  tagline: string;
  arabicTagline: string;
  character: string;
  palette: string[];
  mood: string;
};

const concepts: Concept[] = [
  {
    id: "cairo-editorial",
    title: "Cairo Editorial",
    arabicTitle: "تحرير القاهرة",
    tagline: "A warmer, more human way to find your next address.",
    arabicTagline: "طريقة أكثر دفئاً وإنسانية لاكتشاف عنوانك القادم.",
    character: "Editorial warmth",
    palette: ["#26372e", "#d17a56", "#eee7d9"],
    mood: "Story-led · warm · confident",
  },
  {
    id: "campus-pulse",
    title: "Campus Pulse",
    arabicTitle: "نبض الجامعة",
    tagline: "A clear, energetic marketplace built around student life.",
    arabicTagline: "سوق حيوي وواضح يدور حول حياة الطالب.",
    character: "Modern energy",
    palette: ["#102f2b", "#b7ed66", "#f5f6ef"],
    mood: "Bright · social · practical",
  },
  {
    id: "sakani-reserve",
    title: "Sakani Reserve",
    arabicTitle: "سكني ريزيرف",
    tagline: "A calm, elevated experience for a more confident choice.",
    arabicTagline: "تجربة هادئة وراقية لاختيار أكثر ثقة.",
    character: "Quiet refinement",
    palette: ["#184c3c", "#b9d7c2", "#f8f7f1"],
    mood: "Premium · calm · considered",
  },
];

const screens: { id: ScreenId; en: string; ar: string }[] = [
  { id: "home", en: "Discover", ar: "اكتشف" },
  { id: "listing", en: "Home details", ar: "تفاصيل السكن" },
  { id: "host", en: "For hosts", ar: "للمُلّاك" },
  { id: "help", en: "Help & support", ar: "المساعدة" },
  { id: "account", en: "Account", ar: "الحساب" },
  { id: "admin", en: "Admin", ar: "الإدارة" },
];

const copy = {
  en: {
    eyebrow: "SAKANI · DESIGN STUDIO",
    title: "Three directions.\nOne better home-finding experience.",
    intro: "Explore three complete visual concepts for Egypt's student-housing marketplace. Switch screens, compare styles, and review everything in Arabic or English before choosing a direction.",
    concept: "Choose a direction",
    screens: "Explore the experience",
    desktop: "Desktop",
    mobile: "Mobile",
    pdf: "Download concept PDF",
    print: "Print / save PDF",
    copyLink: "Copy preview link",
    copied: "Preview link copied",
    copyError: "Could not copy link. Copy it from the address bar.",
    localOnly: "Private preview · sample content only · production website unchanged",
    location: "New Cairo · near AUC",
    university: "The American University in Cairo",
    price: "EGP 8,500",
    month: "/ month",
    available: "Ready for move-in",
    verified: "Reviewed by Sakani",
    beds: "2 bedrooms · furnished",
    heroTitle: "Find a place\nthat feels like yours.",
    heroBody: "Student homes near the places that matter. Clear details, direct contact, and room to settle in.",
    search: "Where do you want to live?",
    searchCta: "Explore homes",
    allHomes: "Homes near your campus",
    results: "Thoughtful places for student life",
    featured: "A good place changes everything",
    ownerTitle: "A better home starts with a better search.",
    ownerBody: "List your place for free. Reach students looking for a home near campus.",
    startListing: "List your home",
    stepOne: "Share your home",
    stepTwo: "We review the details",
    stepThree: "Connect with students",
    helpTitle: "Here for every step.",
    helpBody: "Straightforward answers for finding, listing, and choosing a student home.",
    faqOne: "How do I contact a property owner?",
    faqTwo: "Are listings reviewed before they go live?",
    faqThree: "Is it free to browse homes?",
    signIn: "Welcome back",
    signInBody: "Sign in to manage your saved homes and account.",
    email: "Email address",
    password: "Password",
    continue: "Continue",
    secure: "Your account stays private and secure.",
    adminTitle: "Good morning, team.",
    adminBody: "A clear view of the homes and people in Sakani.",
    pending: "Pending review",
    published: "Published homes",
    messages: "New inquiries",
    dashboard: "Overview",
    listings: "Listings",
    students: "Students",
    thisWeek: "THIS WEEK",
    homeLabel: "Student home",
    learnMore: "Explore the home",
    save: "Save",
    studioLink: "Design preview",
    conceptPdf: "Three concepts · full project preview",
    north: "North-facing · 3rd floor",
    faqLink: "Visit the help center",
  },
  ar: {
    eyebrow: "سكني · استوديو التصميم",
    title: "ثلاثة اتجاهات.\nوتجربة أفضل لاختيار السكن.",
    intro: "استكشف ثلاثة تصاميم متكاملة لسوق سكن الطلاب في مصر. بدّل بين الصفحات، وقارن الأساليب بالعربية أو الإنجليزية قبل اختيار الاتجاه المناسب.",
    concept: "اختر اتجاهاً",
    screens: "استكشف التجربة",
    desktop: "كمبيوتر",
    mobile: "جوال",
    pdf: "تحميل ملف التصاميم PDF",
    print: "طباعة / حفظ PDF",
    copyLink: "نسخ رابط المعاينة",
    copied: "تم نسخ رابط المعاينة",
    copyError: "تعذر نسخ الرابط. انسخه من شريط العنوان.",
    localOnly: "معاينة خاصة · محتوى تجريبي فقط · الموقع الحالي لم يتغير",
    location: "القاهرة الجديدة · قرب الجامعة الأمريكية",
    university: "الجامعة الأمريكية بالقاهرة",
    price: "٨٬٥٠٠ ج.م",
    month: "/ شهرياً",
    available: "جاهز للسكن",
    verified: "راجعه فريق سكني",
    beds: "غرفتان · مفروش",
    heroTitle: "اكتشف مكاناً\nيشبهك.",
    heroBody: "سكن طلابي قريب من الأماكن التي تهمك. تفاصيل واضحة وتواصل مباشر ومساحة لتستقر.",
    search: "أين تريد أن تسكن؟",
    searchCta: "اكتشف السكن",
    allHomes: "سكن قريب من جامعتك",
    results: "أماكن مناسبة لحياة الطالب",
    featured: "المكان المناسب يغيّر كل شيء",
    ownerTitle: "البحث الأفضل يبدأ بسكن أفضل.",
    ownerBody: "أضف سكنك مجاناً وعرّفه للطلاب الباحثين عن مكان قريب من الجامعة.",
    startListing: "أضف سكنك",
    stepOne: "عرّفنا بسكنك",
    stepTwo: "نراجع التفاصيل",
    stepThree: "تواصل مع الطلاب",
    helpTitle: "معك في كل خطوة.",
    helpBody: "إجابات واضحة للبحث عن سكن الطلاب أو إضافته واختياره.",
    faqOne: "كيف أتواصل مع مالك السكن؟",
    faqTwo: "هل تتم مراجعة الإعلانات قبل نشرها؟",
    faqThree: "هل تصفح السكن مجاني؟",
    signIn: "أهلاً بعودتك",
    signInBody: "سجّل الدخول لإدارة السكن المحفوظ وحسابك.",
    email: "البريد الإلكتروني",
    password: "كلمة المرور",
    continue: "متابعة",
    secure: "حسابك محفوظ وآمن.",
    adminTitle: "صباح الخير، فريق سكني.",
    adminBody: "نظرة واضحة على السكن والطلاب في سكني.",
    pending: "بانتظار المراجعة",
    published: "سكن منشور",
    messages: "استفسارات جديدة",
    dashboard: "نظرة عامة",
    listings: "الإعلانات",
    students: "الطلاب",
    thisWeek: "هذا الأسبوع",
    homeLabel: "سكن طلابي",
    learnMore: "استكشف السكن",
    save: "حفظ",
    studioLink: "معاينة التصاميم",
    conceptPdf: "ثلاثة تصاميم · معاينة للمشروع كاملاً",
    north: "واجهة شمالية · الطابق الثالث",
    faqLink: "زيارة مركز المساعدة",
  },
} as const;

const photo = "https://images.unsplash.com/photo-1600607687939-ce8a6c25118c?auto=format&fit=crop&w=1500&q=85";

function directionFromQuery(value: string | null): ConceptId {
  return concepts.find((concept) => concept.id === value)?.id ?? "cairo-editorial";
}

function screenFromQuery(value: string | null): ScreenId {
  return screens.find((screen) => screen.id === value)?.id ?? "home";
}

export function DesignStudio({
  initialConcept,
  initialScreen,
  initialLocale,
  initialDevice,
}: {
  initialConcept?: string;
  initialScreen?: string;
  initialLocale?: string;
  initialDevice?: string;
}) {
  const [conceptId, setConceptId] = useState<ConceptId>(() => directionFromQuery(initialConcept ?? null));
  const [screenId, setScreenId] = useState<ScreenId>(() => screenFromQuery(initialScreen ?? null));
  const [locale, setLocale] = useState<Locale>(initialLocale === "ar" ? "ar" : "en");
  const [device, setDevice] = useState<Device>(initialDevice === "mobile" ? "mobile" : "desktop");
  const [linkMessage, setLinkMessage] = useState("");
  const t = copy[locale];
  const concept = concepts.find((item) => item.id === conceptId) ?? concepts[0];

  useEffect(() => {
    const params = new URLSearchParams({
      concept: conceptId,
      screen: screenId,
      locale,
      device,
    });
    window.history.replaceState(null, "", `${window.location.pathname}?${params.toString()}`);
  }, [conceptId, screenId, locale, device]);

  async function copyPreviewLink() {
    try {
      await navigator.clipboard.writeText(window.location.href);
      setLinkMessage(t.copied);
    } catch {
      setLinkMessage(t.copyError);
    }
    window.setTimeout(() => setLinkMessage(""), 3000);
  }

  return (
    <main className={styles.studio} lang={locale} dir={locale === "ar" ? "rtl" : "ltr"} data-locale={locale}>
      <header className={styles.studioHeader}>
        <a className={styles.wordmark} href="/design-studio" aria-label="Sakani design studio">
          <span className={styles.brandIcon}><Building2 size={19} /></span>
          <span>Sakani<span className={styles.brandDot}>.</span></span>
          <span className={styles.studioTag}>{t.studioLink}</span>
        </a>
        <div className={styles.headerTools}>
          <button className={styles.toolButton} type="button" onClick={() => setLocale(locale === "en" ? "ar" : "en")}>
            <Globe2 size={16} /> {locale === "en" ? "العربية" : "English"}
          </button>
          <a className={styles.pdfButton} href="/sakani-design-concepts.pdf" download aria-label={t.pdf} title={t.pdf}>
            <ArrowDownRight size={16} /> {t.pdf}
          </a>
        </div>
      </header>

      <section className={styles.intro}>
        <div className={styles.introCopy}>
          <div className={styles.eyebrow}><Sparkles size={14} /> {t.eyebrow}</div>
          <h1>{t.title.split("\n").map((line) => <span key={line}>{line}</span>)}</h1>
          <p>{t.intro}</p>
          <div className={styles.introActions}>
            <a href="/sakani-design-concepts.pdf" download className={styles.primaryAction}>
              <ArrowDownRight size={17} /> {t.pdf}
            </a>
            <button className={styles.secondaryAction} type="button" onClick={copyPreviewLink}>
              {linkMessage === t.copied ? <Check size={16} /> : <ArrowUpRight size={16} />}
              {linkMessage || t.copyLink}
            </button>
          </div>
          <span className={styles.localNotice}><ShieldCheck size={14} /> {t.localOnly}</span>
        </div>
        <div className={styles.introArt} aria-hidden="true">
          <div className={`${styles.artCard} ${styles.artCardBack}`}>
            <div className={styles.artPhoto} />
          </div>
          <div className={`${styles.artCard} ${styles.artCardFront}`}>
            <span className={styles.artTop}><Building2 size={16} /> SAKANI / 03</span>
            <strong>Find a place<br />to begin.</strong>
            <span className={styles.artBottom}><MapPin size={13} /> CAIRO · EGYPT</span>
          </div>
          <span className={styles.artOrb} />
        </div>
      </section>

      <section className={styles.conceptsSection} aria-labelledby="concepts-title">
        <div className={styles.sectionHeading}>
          <div><span>{t.concept}</span><h2 id="concepts-title">{locale === "en" ? "Pick a point of view" : "اختر أسلوباً"}</h2></div>
          <span className={styles.currentConcept}><i style={{ background: concept.palette[1] }} />{locale === "en" ? concept.character : concept.arabicTitle}</span>
        </div>
        <div className={styles.conceptCards}>
          {concepts.map((item, index) => (
            <button
              key={item.id}
              className={`${styles.conceptCard} ${conceptId === item.id ? styles.conceptSelected : ""}`}
              type="button"
              aria-pressed={conceptId === item.id}
              onClick={() => setConceptId(item.id)}
              data-theme={item.id}
            >
              <span className={styles.conceptCardTop}>
                <span className={styles.conceptNumber}>0{index + 1}</span>
                <span className={styles.swatches}>{item.palette.map((color) => <i key={color} style={{ background: color }} />)}</span>
              </span>
              <span className={styles.conceptName}>{locale === "en" ? item.title : item.arabicTitle}</span>
              <span className={styles.conceptTagline}>{locale === "en" ? item.tagline : item.arabicTagline}</span>
              <span className={styles.conceptMood}>{item.mood}</span>
            </button>
          ))}
        </div>
      </section>

      <section className={styles.experienceSection} aria-labelledby="experience-title">
        <div className={styles.sectionHeading}>
          <div><span>{t.screens}</span><h2 id="experience-title">{locale === "en" ? "See the whole experience" : "شاهد التجربة كاملة"}</h2></div>
          <div className={styles.deviceSwitch} role="group" aria-label="Preview size">
            <button type="button" className={device === "desktop" ? styles.deviceActive : ""} onClick={() => setDevice("desktop")} aria-pressed={device === "desktop"}>{t.desktop}</button>
            <button type="button" className={device === "mobile" ? styles.deviceActive : ""} onClick={() => setDevice("mobile")} aria-pressed={device === "mobile"}>{t.mobile}</button>
          </div>
        </div>

        <div className={styles.previewTabs} role="tablist" aria-label={t.screens}>
          {screens.map((screen) => (
            <button
              key={screen.id}
              type="button"
              role="tab"
              aria-selected={screenId === screen.id}
              className={screenId === screen.id ? styles.tabActive : ""}
              onClick={() => setScreenId(screen.id)}
            >
              {screen.id === "home" && <Search size={15} />}
              {screen.id === "listing" && <BedDouble size={15} />}
              {screen.id === "host" && <Building2 size={15} />}
              {screen.id === "help" && <CircleHelp size={15} />}
              {screen.id === "account" && <UserRound size={15} />}
              {screen.id === "admin" && <LayoutDashboard size={15} />}
              {screen[locale]}
            </button>
          ))}
        </div>

        <div className={styles.previewStage} data-device={device}>
          <Mockup concept={concept} screenId={screenId} locale={locale} />
        </div>
        <div className={styles.previewFooter}>
          <span className={styles.previewLegend}><i style={{ background: concept.palette[1] }} />{locale === "en" ? concept.title : concept.arabicTitle}<span>·</span>{screens.find((screen) => screen.id === screenId)?.[locale]}</span>
          <span className={styles.previewHint}>{locale === "en" ? "Every screen is designed for both right-to-left and left-to-right reading." : "كل صفحة مصممة للقراءة من اليمين لليسار ومن اليسار لليمين."}</span>
        </div>
      </section>

      <footer className={styles.studioFooter}>
        <span><Building2 size={15} /> Sakani · Student homes, made clearer.</span>
        <a href="/design-studio/print">{t.conceptPdf} <ArrowLeft size={14} /></a>
      </footer>
    </main>
  );
}

function Mockup({ concept, screenId, locale, mini = false }: { concept: Concept; screenId: ScreenId; locale: Locale; mini?: boolean }) {
  const t = copy[locale];
  return (
    <article className={`${styles.mockup} ${mini ? styles.miniMockup : ""}`} data-theme={concept.id} lang={locale} dir={locale === "ar" ? "rtl" : "ltr"}>
      <div className={styles.mockBrowser}>
        <span /><span /><span />
        <div className={styles.addressBar}><ShieldCheck size={10} /> sakani.eg/{locale}/{screenId === "home" ? "" : screenId}</div>
        <Menu size={14} className={styles.mockMenu} />
      </div>
      {screenId === "admin" ? (
        <AdminSurface t={t} locale={locale} />
      ) : screenId === "account" ? (
        <AccountSurface t={t} locale={locale} />
      ) : (
        <>
          <div className={styles.mockNav}>
            <span className={styles.mockLogo}><Building2 size={17} /> Sakani<span>.</span></span>
            <div className={styles.mockNavLinks}><span>{locale === "en" ? "Find a home" : "اكتشف السكن"}</span><span>{locale === "en" ? "For owners" : "للمُلّاك"}</span></div>
            <div className={styles.mockNavEnd}><span className={styles.mockLanguage}>{locale === "en" ? "عربي" : "EN"}</span><span className={styles.mockAvatar}><UserRound size={13} /></span></div>
          </div>
          {screenId === "home" && <HomeSurface t={t} locale={locale} />}
          {screenId === "listing" && <ListingSurface t={t} locale={locale} />}
          {screenId === "host" && <HostSurface t={t} locale={locale} />}
          {screenId === "help" && <HelpSurface t={t} locale={locale} />}
        </>
      )}
      <div className={styles.mockFooter}><span>SAKANI</span><span>{locale === "en" ? "A place to belong." : "مكان تنتمي إليه."}</span><span>© 2026</span></div>
    </article>
  );
}

function HomeSurface({ t, locale }: { t: typeof copy.en | typeof copy.ar; locale: Locale }) {
  return (
    <div className={styles.homeSurface}>
      <div className={styles.heroVisual} style={{ backgroundImage: `url("${photo}")` }}>
        <div className={styles.heroOverlay} />
        <span className={styles.heroEyebrow}><Sparkles size={12} /> {t.homeLabel} · EGYPT</span>
        <h1>{t.heroTitle.split("\n").map((line) => <span key={line}>{line}</span>)}</h1>
        <p>{t.heroBody}</p>
        <div className={styles.searchBar}>
          <span><MapPin size={15} />{t.search}</span>
          <span className={styles.searchSelect}>{t.university}<ChevronDown size={13} /></span>
          <button type="button"><Search size={15} />{t.searchCta}</button>
        </div>
        <span className={styles.heroCoordinates}>30°01&apos; N&nbsp;&nbsp; 31°30&apos; E</span>
      </div>
      <div className={styles.belowHero}>
        <div className={styles.surfaceHeading}><div><span>{t.allHomes}</span><h2>{t.results}</h2></div><button type="button"><SlidersHorizontal size={14} />{locale === "en" ? "Filters" : "الفلاتر"}</button></div>
        <PropertyCards t={t} />
      </div>
    </div>
  );
}

function PropertyCards({ t }: { t: typeof copy.en | typeof copy.ar }) {
  return (
    <div className={styles.propertyCards}>
      {[0, 1, 2].map((index) => (
        <div className={styles.propertyCard} key={index}>
          <div className={`${styles.propertyPhoto} ${styles[`propertyPhoto${index + 1}`]}`} style={{ backgroundImage: `url("${photo}")` }}>
            <span><ShieldCheck size={11} />{t.verified}</span><Heart size={15} />
          </div>
          <span className={styles.propertyLocation}><MapPin size={11} />{t.location}</span>
          <strong>{index === 0 ? t.university : index === 1 ? t.allHomes : t.homeLabel}</strong>
          <span className={styles.propertyPrice}>{t.price}<small>{t.month}</small></span>
        </div>
      ))}
    </div>
  );
}

function ListingSurface({ t, locale }: { t: typeof copy.en | typeof copy.ar; locale: Locale }) {
  return (
    <div className={styles.listingSurface}>
      <div className={styles.listingIntro}>
        <span className={styles.breadcrumb}>{locale === "en" ? "Homes" : "السكن"} / {t.location}</span>
        <div className={styles.listingTitle}><div><span className={styles.verifiedPill}><ShieldCheck size={12} />{t.verified}</span><h1>{t.university}</h1><p><MapPin size={13} />{t.location} <span>·</span> {t.north}</p></div><button type="button"><Heart size={14} />{t.save}</button></div>
      </div>
      <div className={styles.galleryGrid}>
        <div className={styles.galleryLarge} style={{ backgroundImage: `url("${photo}")` }} />
        <div className={styles.gallerySmall} style={{ backgroundImage: `url("${photo}")` }} />
        <div className={`${styles.gallerySmall} ${styles.galleryDetail}`} style={{ backgroundImage: `url("${photo}")` }} />
        <span className={styles.galleryCount}>{locale === "en" ? "1 of 8 photos" : "١ من ٨ صور"}</span>
      </div>
      <div className={styles.listingBody}>
        <div className={styles.listingDescription}><span>{t.beds}</span><h2>{locale === "en" ? "A bright, furnished home near campus" : "سكن مفروش ومضيء بالقرب من الجامعة"}</h2><p>{t.heroBody} {t.north}.</p><div className={styles.listingFeature}><BedDouble size={15} />{t.beds}<ShieldCheck size={15} />{t.verified}</div></div>
        <aside className={styles.priceCard}><span>{t.available}</span><strong>{t.price}<small>{t.month}</small></strong><button type="button">{locale === "en" ? "Ask about this home" : "استفسر عن السكن"} <ArrowRight size={14} /></button><small>{locale === "en" ? "Direct contact · no booking fee" : "تواصل مباشر · بلا رسوم حجز"}</small></aside>
      </div>
    </div>
  );
}

function HostSurface({ t, locale }: { t: typeof copy.en | typeof copy.ar; locale: Locale }) {
  return (
    <div className={styles.hostSurface}>
      <div className={styles.hostCopy}>
        <span className={styles.surfaceEyebrow}>{locale === "en" ? "A BETTER WAY TO BE FOUND" : "طريقة أفضل ليجدك الطلاب"}</span>
        <h1>{t.ownerTitle}</h1><p>{t.ownerBody}</p>
        <button type="button" className={styles.hostAction}>{t.startListing}<ArrowRight size={15} /></button>
        <span className={styles.hostTrust}><Check size={13} />{locale === "en" ? "Free to list · Reviewed by our team" : "إضافة مجانية · نراجع الإعلان"}</span>
      </div>
      <div className={styles.hostImage} style={{ backgroundImage: `url("${photo}")` }}>
        <div className={styles.hostBadge}><Building2 size={14} /><span><strong>{locale === "en" ? "A home near campus" : "سكن قرب الجامعة"}</strong><small>{t.location}</small></span></div>
      </div>
      <div className={styles.hostSteps}>
        {[t.stepOne, t.stepTwo, t.stepThree].map((step, index) => <div key={step}><span>0{index + 1}</span><strong>{step}</strong><small>{locale === "en" ? ["Simple details, real photos.", "Clear, thoughtful checks.", "Direct conversations."][index] : ["تفاصيل واضحة وصور حقيقية.", "مراجعة دقيقة وواضحة.", "تواصل مباشر وبسيط."][index]}</small></div>)}
      </div>
    </div>
  );
}

function HelpSurface({ t, locale }: { t: typeof copy.en | typeof copy.ar; locale: Locale }) {
  return (
    <div className={styles.helpSurface}>
      <div className={styles.helpHero}><span className={styles.surfaceEyebrow}>{locale === "en" ? "SAKANI SUPPORT" : "دعم سكني"}</span><h1>{t.helpTitle}</h1><p>{t.helpBody}</p><span className={styles.helpOrb} /></div>
      <div className={styles.faqPreview}>
        <div><span className={styles.surfaceEyebrow}>{locale === "en" ? "GOOD TO KNOW" : "معلومات تهمك"}</span><h2>{locale === "en" ? "A few helpful answers" : "إجابات تساعدك"}</h2><a>{t.faqLink}<ArrowRight size={13} /></a></div>
        <div className={styles.faqRows}>{[t.faqOne, t.faqTwo, t.faqThree].map((question, index) => <div key={question}><span>0{index + 1}</span><strong>{question}</strong><ChevronDown size={14} /></div>)}</div>
      </div>
    </div>
  );
}

function AccountSurface({ t, locale }: { t: typeof copy.en | typeof copy.ar; locale: Locale }) {
  return (
    <div className={styles.accountSurface}>
      <aside className={styles.accountBrand}>
        <span className={styles.accountLogo}><Building2 size={18} /> Sakani<span>.</span></span>
        <div><span className={styles.surfaceEyebrow}>YOUR SAKANI SPACE</span><h1>{t.heroTitle.replace("\n", " ")}</h1><p>{t.heroBody}</p></div>
        <span className={styles.accountNote}><ShieldCheck size={14} />{t.secure}</span>
      </aside>
      <div className={styles.accountForm}>
        <span className={styles.formMark}><UserRound size={17} /></span>
        <span className={styles.surfaceEyebrow}>{locale === "en" ? "YOUR ACCOUNT" : "حسابك"}</span>
        <h2>{t.signIn}</h2><p>{t.signInBody}</p>
        <label>{t.email}<span>ahmed@example.com</span></label>
        <label>{t.password}<span>•••••••••••• <span className={styles.passwordEye}>◉</span></span></label>
        <button type="button">{t.continue}<ArrowRight size={14} /></button>
        <small>{t.secure}</small>
      </div>
    </div>
  );
}

function AdminSurface({ t, locale }: { t: typeof copy.en | typeof copy.ar; locale: Locale }) {
  return (
    <div className={styles.adminSurface}>
      <aside className={styles.adminSidebar}>
        <span className={styles.adminLogo}><Building2 size={15} />Sakani<span>.</span></span>
        <span className={styles.adminNavActive}><LayoutDashboard size={12} />{t.dashboard}</span>
        <span><Building2 size={12} />{t.listings}</span>
        <span><UserRound size={12} />{t.students}</span>
        <span><CircleHelp size={12} />{locale === "en" ? "Reports" : "التقارير"}</span>
      </aside>
      <div className={styles.adminContent}>
        <div className={styles.adminTop}><span>{t.thisWeek}</span><span><Globe2 size={12} />{locale === "en" ? "English" : "العربية"} <ChevronDown size={11} /></span></div>
        <h1>{t.adminTitle}</h1><p>{t.adminBody}</p>
        <div className={styles.adminStats}>{[t.pending, t.published, t.messages].map((item, index) => <div key={item}><span>{item}</span><strong>{[12, 148, 26][index]}</strong><small>↗ {["+4", "+12", "+8"][index]} {locale === "en" ? "this week" : "هذا الأسبوع"}</small></div>)}</div>
        <div className={styles.adminTable}><div><strong>{locale === "en" ? "Recently updated homes" : "سكن تم تحديثه مؤخراً"}</strong><button type="button">{locale === "en" ? "View all" : "عرض الكل"}<ArrowRight size={11} /></button></div>{[0, 1, 2].map((item) => <div className={styles.adminRow} key={item}><i style={{ backgroundImage: `url("${photo}")` }} /><span><strong>{t.university}</strong><small>{t.location}</small></span><span className={`${styles.statusDot} ${item === 0 ? styles.statusPending : ""}`} />{item === 0 ? t.pending : t.published}</div>)}</div>
      </div>
    </div>
  );
}

export function DesignPrintBook() {
  return (
    <main className={styles.printBook} lang="en" dir="ltr">
      <section className={styles.printCover}>
        <span className={styles.eyebrow}><Sparkles size={14} /> SAKANI · DESIGN CONCEPTS</span>
        <h1>Three directions.<br />One better home-finding experience.</h1>
        <p>Professional visual concepts for Sakani, Egypt&apos;s student-housing marketplace. Six core product surfaces, designed for Arabic / RTL and English / LTR.</p>
        <p lang="ar" dir="rtl" className={styles.printArabicIntro}>ثلاثة اتجاهات متكاملة لتجربة سكن طلابي أوضح في مصر.</p>
        <div className={styles.printCoverMarks}>{concepts.map((concept) => <span key={concept.id} style={{ background: concept.palette[1] }} />)}</div>
        <div className={styles.printCoverFoot}><span>SAKANI · DESIGN STUDIO</span><span>01 / 07</span></div>
      </section>
      {concepts.flatMap((concept, index) =>
        (["en", "ar"] as const).map((locale, languageIndex) => (
          <section className={styles.printConceptPage} key={`${concept.id}-${locale}`} data-theme={concept.id} lang={locale} dir={locale === "ar" ? "rtl" : "ltr"}>
            <header className={styles.printConceptHeader}>
              <div><span className={styles.printNumber}>0{index + 1} / {locale === "en" ? "CONCEPT · ENGLISH / LTR" : "CONCEPT · العربية / RTL"}</span><h2>{locale === "en" ? concept.title : concept.arabicTitle}</h2><p>{locale === "en" ? concept.tagline : concept.arabicTagline}</p></div>
              <span className={styles.printMood}>{locale === "en" ? concept.mood : concept.character}</span>
            </header>
            <div className={styles.printScreenGrid}>
              {screens.map((screen) => (
                <div className={styles.printScreen} key={screen.id}>
                  <div className={styles.printScreenTitle}><span>{screen[locale]}</span><span>{locale === "en" ? screen.ar : screen.en}</span></div>
                  <Mockup concept={concept} screenId={screen.id} locale={locale} mini />
                </div>
              ))}
            </div>
            <footer className={styles.printPageFoot}><span>SAKANI · CAIRO, EGYPT · {locale === "en" ? "ENGLISH / LTR" : "العربية / RTL"}</span><span>0{index * 2 + languageIndex + 2} / 07</span></footer>
          </section>
        )),
      )}
    </main>
  );
}

export function DesignPrintControls() {
  return (
    <nav className={styles.printActions} aria-label="PDF actions">
      <a href="/design-studio">← Back to design studio</a>
      <span>Sakani · Three complete design directions</span>
      <button type="button" onClick={() => window.print()}><ArrowDownRight size={15} /> Save / print as PDF</button>
    </nav>
  );
}
