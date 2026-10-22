import type { SiteLocale } from "@/messages/site";

/**
 * DRAFT legal pages. Written to describe what the site actually does; not legal advice.
 * The site operator should have them reviewed (Egypt Personal Data Protection Law No. 151 of 2020) before relying on them.
 */
export const LEGAL_UPDATED = "2026-10-22";

type LegalSection = { heading: string; body: string[] };
type LegalPage = { title: string; intro: string; sections: LegalSection[] };

export const LEGAL_COPY: Record<SiteLocale, { privacy: LegalPage; terms: LegalPage; updatedLabel: string; contactCta: string }> = {
  ar: {
    updatedLabel: "آخر تحديث",
    contactCta: "تواصل معنا",
    privacy: {
      title: "سياسة الخصوصية",
      intro: "توضح هذه السياسة البيانات التي يجمعها موقع سكني، ولماذا، وكيف نحميها، وما حقوقك عليها.",
      sections: [
        {
          heading: "البيانات التي نجمعها",
          body: [
            "المُلّاك: الاسم والبريد الإلكتروني وكلمة المرور (تُحفظ مشفرة ولا يمكن لأحد قراءتها)، وتفاصيل الإعلان، ورقم واتساب، وصور السكن.",
            "الضيوف (بدون حساب): نحفظ جلسة مجهولة في متصفحك لتتمكن من متابعة إعلاناتك، دون بريد أو اسم.",
            "الزوار: ما تكتبه بنفسك في نموذج التواصل أو البلاغات، مثل رسالتك ووسيلة التواصل إن أضفتها.",
            "المدفوعات (للمُلّاك): عند سداد رسوم النجاح نحفظ المبلغ ووسيلة الدفع (إنستاباي أو فودافون كاش) ورقم العملية ورقم الهاتف المستخدم في التحويل، لنتأكد من وصول المبلغ. لا نطلب ولا نحفظ أي بيانات بطاقات بنكية.",
            "سجلات تقنية أساسية يحتفظ بها مزودو الاستضافة لأغراض الأمان والتشغيل. لا نستخدم إعلانات أو أدوات تتبع إعلانية.",
          ],
        },
        {
          heading: "لماذا نستخدمها",
          body: [
            "لتشغيل الموقع: نشر الإعلانات بعد مراجعتها، وتمكين المُلّاك من إدارة إعلاناتهم، والرد على رسائلك وبلاغاتك.",
            "للأمان: منع الاحتيال والإعلانات المزيفة والرسائل المزعجة.",
          ],
        },
        {
          heading: "ما الذي يظهر للعامة",
          body: [
            "عند نشر إعلانك تظهر تفاصيله للجميع، بما في ذلك الصور ورقم واتساب الذي أضفته ليتواصل معك الطلاب. لا يظهر بريدك الإلكتروني أو اسم حسابك.",
          ],
        },
        {
          heading: "مع من نشارك البيانات",
          body: [
            "لا نبيع بياناتك. نستخدم مزودي خدمة لتشغيل الموقع: Supabase (قاعدة البيانات وتسجيل الدخول وتخزين الصور) وVercel (استضافة الموقع). قد تُعالج البيانات على خوادمهم خارج مصر.",
            "قد نكشف البيانات إذا طلبتها جهة قانونية مختصة.",
          ],
        },
        {
          heading: "مدة الاحتفاظ",
          body: [
            "نحتفظ ببيانات الحساب والإعلانات حتى تحذفها أو تطلب حذفها. نحتفظ بالرسائل والبلاغات حتى 12 شهراً بعد إغلاقها.",
          ],
        },
        {
          heading: "حقوقك",
          body: [
            "يمكنك طلب الاطلاع على بياناتك أو تصحيحها أو حذفها في أي وقت عبر نموذج التواصل. يمكنك حذف إعلاناتك بنفسك من «إعلاناتك».",
          ],
        },
        {
          heading: "الأمان",
          body: [
            "نستخدم اتصالاً مشفراً (HTTPS)، وقواعد صلاحيات في قاعدة البيانات تمنع أي شخص من رؤية بيانات غيره. لا يوجد نظام آمن بالكامل، لذلك اختر كلمة مرور قوية ولا تشاركها.",
          ],
        },
        {
          heading: "تغييرات على هذه السياسة",
          body: ["قد نحدّث هذه السياسة، وسنغيّر تاريخ «آخر تحديث» أعلاه عند ذلك."],
        },
      ],
    },
    terms: {
      title: "شروط الاستخدام",
      intro: "باستخدامك موقع سكني فأنت توافق على هذه الشروط.",
      sections: [
        {
          heading: "ما هو سكني",
          body: [
            "سكني منصة تعرض إعلانات سكن الطلاب في الجيزة وتتيح التواصل المباشر مع المُلّاك. التصفح والتواصل مجانيان للطلاب، ونشر الإعلانات مجاني للمُلّاك. لسنا طرفاً في أي اتفاق إيجار، ولا نستلم إيجاراً أو تأميناً من الطلاب.",
          ],
        },
        {
          heading: "مسؤولية المُلّاك",
          body: [
            "تقر بأن لديك الحق في عرض السكن للإيجار، وأن كل التفاصيل والصور صحيحة وحديثة وتخص السكن نفسه.",
            "يُمنع نشر إعلانات مزيفة أو مضللة، أو طلب دفع قبل المعاينة، أو أي محتوى مسيء أو مخالف للقانون.",
            "نراجع الإعلانات قبل نشرها، ويحق لنا رفض أي إعلان أو إيقافه أو حذفه دون إشعار مسبق.",
          ],
        },
        {
          heading: "نصائح للطلاب",
          body: [
            "عاين السكن بنفسك وقابل المالك قبل دفع أي مبلغ، واطلب عقداً أو إيصالاً مكتوباً. علامة «موثّق» تعني أن فريقنا عاين السكن، لكنها ليست ضماناً للاتفاق بينك وبين المالك.",
          ],
        },
        {
          heading: "حدود المسؤولية",
          body: [
            "نبذل جهدنا لمراجعة الإعلانات، لكننا لا نضمن دقة كل المعلومات أو توفر السكن. سكني غير مسؤول عن أي خلاف أو خسارة تنتج عن اتفاق بين الطالب والمالك.",
          ],
        },
        {
          heading: "رسوم النجاح للمُلّاك",
          body: [
            "عندما يؤجر المالك سكنه لطالب وجده عبر سكني، يلتزم بدفع رسوم نجاح لمرة واحدة. تظهر قيمة الرسوم للمالك قبل تأكيدها، وهي نسبة من إيجار شهر واحد بحد أدنى.",
            "تُدفع الرسوم بتحويل عبر إنستاباي أو فودافون كاش إلى الحساب الموضح في صفحة الدفع، وتُعتبر مدفوعة بعد تأكيد فريق سكني لوصول التحويل.",
            "يحق لنا إيقاف نشر إعلانات جديدة للمالك إذا تأخر سداد رسوم مستحقة أكثر من 14 يوماً. لا يدفع الطلاب أي رسوم لسكني.",
          ],
        },
        {
          heading: "الحسابات",
          body: ["أنت مسؤول عن الحفاظ على سرية كلمة مرورك وعن أي نشاط يتم من خلال حسابك."],
        },
        {
          heading: "القانون المطبق",
          body: ["تخضع هذه الشروط لقوانين جمهورية مصر العربية."],
        },
      ],
    },
  },
  en: {
    updatedLabel: "Last updated",
    contactCta: "Contact us",
    privacy: {
      title: "Privacy Policy",
      intro: "This policy explains what data Sakani collects, why, how we protect it, and your rights over it.",
      sections: [
        {
          heading: "Data we collect",
          body: [
            "Owners: name, email address and password (stored hashed — nobody can read it), listing details, WhatsApp number, and property photos.",
            "Guests (no account): an anonymous session in your browser so you can follow your listings, without an email or name.",
            "Visitors: whatever you type into the contact form or a listing report, such as your message and any contact details you add.",
            "Payments (owners): when you pay a success fee we keep the amount, the method (InstaPay or Vodafone Cash), the transaction reference and the phone number used for the transfer, so we can confirm it arrived. We never ask for or store bank card details.",
            "Basic technical logs kept by our hosting providers for security and operations. We don’t use advertising or ad-tracking tools.",
          ],
        },
        {
          heading: "Why we use it",
          body: [
            "To run the site: publishing listings after review, letting owners manage their listings, and answering your messages and reports.",
            "For safety: preventing fraud, fake listings and spam.",
          ],
        },
        {
          heading: "What is public",
          body: [
            "When your listing is published, its details are visible to everyone, including the photos and the WhatsApp number you added so students can reach you. Your email address and account name are not shown.",
          ],
        },
        {
          heading: "Who we share data with",
          body: [
            "We don’t sell your data. We use service providers to run the site: Supabase (database, sign-in and photo storage) and Vercel (website hosting). Data may be processed on their servers outside Egypt.",
            "We may disclose data if required by a competent legal authority.",
          ],
        },
        {
          heading: "How long we keep it",
          body: [
            "We keep account and listing data until you delete it or ask us to. We keep messages and reports for up to 12 months after they are closed.",
          ],
        },
        {
          heading: "Your rights",
          body: [
            "You can ask to see, correct or delete your data at any time using the contact form. You can delete your own listings from “Your listings”.",
          ],
        },
        {
          heading: "Security",
          body: [
            "We use encrypted connections (HTTPS) and database permission rules that stop anyone from seeing other people’s data. No system is perfectly secure, so choose a strong password and don’t share it.",
          ],
        },
        {
          heading: "Changes to this policy",
          body: ["We may update this policy and will change the “Last updated” date above when we do."],
        },
      ],
    },
    terms: {
      title: "Terms of Use",
      intro: "By using Sakani you agree to these terms.",
      sections: [
        {
          heading: "What Sakani is",
          body: [
            "Sakani shows student housing listings in Giza and lets students contact owners directly. Browsing and contacting owners is free for students, and listing a home is free for owners. We are not a party to any rental agreement and we never receive rent or deposits from students.",
          ],
        },
        {
          heading: "Owners’ responsibilities",
          body: [
            "You confirm you have the right to rent out the property, and that all details and photos are accurate, current and of that property.",
            "Fake or misleading listings, asking for payment before a visit, and offensive or unlawful content are not allowed.",
            "We review listings before publishing and may reject, unpublish or delete any listing without prior notice.",
          ],
        },
        {
          heading: "Advice for students",
          body: [
            "Visit the home and meet the owner before paying anything, and ask for a written contract or receipt. “Verified” means our team visited the home; it is not a guarantee of your agreement with the owner.",
          ],
        },
        {
          heading: "Limitation of liability",
          body: [
            "We do our best to review listings, but we can’t guarantee every detail is accurate or that a home is still available. Sakani is not responsible for disputes or losses arising from an agreement between a student and an owner.",
          ],
        },
        {
          heading: "Success fee for owners",
          body: [
            "When an owner rents their home to a student who found it on Sakani, the owner pays a one-time success fee. The owner sees the amount before confirming; it is a percentage of one month’s rent, with a minimum.",
            "The fee is paid by InstaPay or Vodafone Cash transfer to the account shown on the payment page, and counts as paid once the Sakani team confirms the transfer arrived.",
            "We may stop an owner from publishing new listings while a fee is more than 14 days overdue. Students never pay Sakani anything.",
          ],
        },
        {
          heading: "Accounts",
          body: ["You are responsible for keeping your password secret and for activity on your account."],
        },
        {
          heading: "Governing law",
          body: ["These terms are governed by the laws of the Arab Republic of Egypt."],
        },
      ],
    },
  },
};
