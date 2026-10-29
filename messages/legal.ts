import type { SiteLocale } from "@/messages/site";

/**
 * DRAFT legal pages. Written to describe what the site actually does; not legal advice.
 * The site operator should have them reviewed (Egypt Personal Data Protection Law No. 151 of 2020) before relying on them.
 */
export const LEGAL_UPDATED = "2026-10-29";

type LegalSection = { heading: string; body: string[] };
type LegalPage = { title: string; intro: string; sections: LegalSection[] };

export const LEGAL_COPY: Record<SiteLocale, { privacy: LegalPage; terms: LegalPage; updatedLabel: string; contactCta: string }> = {
  ar: {
    updatedLabel: "آخر تحديث",
    contactCta: "كلّمنا",
    privacy: {
      title: "سياسة الخصوصية",
      intro: "توضح هذه السياسة البيانات التي يجمعها موقع سكني، ولماذا، وكيف نحميها، وما حقوقك عليها.",
      sections: [
        {
          heading: "البيانات التي نجمعها",
          body: [
            "الحسابات: عند إنشاء حساب (مستأجر أو صاحب مكان) نحفظ الاسم والبريد الإلكتروني ورقم الموبايل ونوع الحساب، وكلمة المرور التي تُحفظ مشفرة ولا يمكن لأحد قراءتها.",
            "أصحاب الأماكن: تفاصيل الإعلان وصور المكان ورقم واتساب. رقم واتساب يراه فريق سكني فقط ولا يظهر لأي زائر.",
            "الإضافة بدون حساب: نحفظ جلسة مجهولة في متصفحك لتتمكن من متابعة إعلاناتك، دون بريد أو اسم.",
            "الحجوزات: عند الحجز نحفظ اسمك ورقمك وتاريخ الدخول والمدة وعدد الأفراد وملاحظتك، ليتواصل معك فريق سكني ومع صاحب المكان. لا يظهر رقمك للعامة ولا رقم صاحب المكان لك.",
            "الأماكن المحفوظة: تُحفظ في متصفحك، وفي حسابك إن كنت مسجّل الدخول لتظهر على أجهزتك الأخرى.",
            "الزوار: ما تكتبه بنفسك في نموذج التواصل أو البلاغات، مثل رسالتك ووسيلة التواصل إن أضفتها.",
            "المدفوعات: عند الدفع نحفظ المبلغ ورقم عملية إنستاباي ورقم الهاتف المستخدم في التحويل، لنتأكد من وصول المبلغ. لأصحاب الأماكن نحفظ عنوان إنستاباي الذي يضيفونه لنحوّل لهم مستحقاتهم. لا نطلب ولا نحفظ أي بيانات بطاقات بنكية.",
            "المحادثات: نحفظ رسائلك مع فريق سكني لنرد عليك ونتابع حجزك أو أي مشكلة.",
            "البروفايل: الصورة والنبذة والمحافظة والعمل أو الدراسة واللغات تظهر في صفحتك العامة إذا أضفتها. رقمك وبريدك وعنوان إنستاباي لا تظهر لأحد.",
            "سجلات تقنية أساسية يحتفظ بها مزودو الاستضافة لأغراض الأمان والتشغيل. لا نستخدم إعلانات أو أدوات تتبع إعلانية.",
          ],
        },
        {
          heading: "لماذا نستخدمها",
          body: [
            "لتشغيل الموقع: نشر الإعلانات بعد مراجعتها، وترتيب الحجوزات والمعاينات بين المستأجر وصاحب المكان، وتحصيل الرسوم، والرد على رسائلك وبلاغاتك.",
            "للأمان: منع الاحتيال والإعلانات المزيفة والرسائل المزعجة.",
          ],
        },
        {
          heading: "ما الذي يظهر للعامة",
          body: [
            "عند نشر إعلانك تظهر تفاصيله وصوره للجميع. لا يظهر رقمك أو بريدك أو اسم حسابك؛ يتواصل الزوار مع فريق سكني فقط.",
          ],
        },
        {
          heading: "مع من نشارك البيانات",
          body: [
            "لا نبيع بياناتك. عند تأكيد حجز يشارك فريق سكني مع كل طرف ما يلزم لإتمام المعاينة والتأجير فقط.",
            "نستخدم مزودي خدمة لتشغيل الموقع: Supabase (قاعدة البيانات وتسجيل الدخول وتخزين الصور) وVercel (استضافة الموقع). قد تُعالج البيانات على خوادمهم خارج مصر.",
            "قد نكشف البيانات إذا طلبتها جهة قانونية مختصة.",
          ],
        },
        {
          heading: "مدة الاحتفاظ",
          body: [
            "نحتفظ ببيانات الحساب والإعلانات والحجوزات حتى تحذفها أو تطلب حذفها. نحتفظ بالرسائل والبلاغات حتى 12 شهراً بعد إغلاقها، وبسجلات المدفوعات المدة التي يتطلبها القانون.",
          ],
        },
        {
          heading: "حقوقك",
          body: [
            "يمكنك تعديل اسمك ورقمك من صفحة حسابك، وطلب الاطلاع على بياناتك أو تصحيحها أو حذفها في أي وقت عبر نموذج التواصل. يمكنك حذف إعلاناتك بنفسك.",
          ],
        },
        {
          heading: "الأمان",
          body: [
            "نستخدم اتصالاً مشفراً (HTTPS)، وقواعد صلاحيات في قاعدة البيانات تمنع أي شخص من رؤية بيانات غيره. عند تسجيل الخروج نحذف من جهازك الأماكن المحفوظة والمسودات الخاصة بحسابك. لا يوجد نظام آمن بالكامل، لذلك اختر كلمة مرور قوية ولا تشاركها.",
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
            "سكني منصة تربط المستأجرين بأصحاب الأماكن المعروضة للإيجار في مصر، ويعمل فريق سكني وسيطاً بينهما: يتحقق من صاحب المكان، ويرتّب المعاينة، ويؤكد الحجز. لا تظهر أرقام أصحاب الأماكن للزوار.",
            "عند الحجز يدفع المستأجر لسكني مقدماً إيجار الشهر الأول ورسوم الخدمة. يحتفظ سكني بالمبلغ حتى يؤكد المستأجر استلام المكان، ثم يحوّل لصاحب المكان الإيجار بعد خصم رسومه. لسنا طرفاً في عقد الإيجار نفسه، والتأمين وباقي الشهور يُتفق عليها بين الطرفين بمساعدة فريق سكني.",
          ],
        },
        {
          heading: "الحسابات",
          body: [
            "يمكنك إنشاء حساب مستأجر أو حساب صاحب مكان، والتحويل بينهما من صفحة حسابك. يلزم حساب مستأجر لإرسال طلب حجز.",
            "أنت مسؤول عن صحة بياناتك، والحفاظ على سرية كلمة مرورك، وعن أي نشاط يتم من خلال حسابك.",
          ],
        },
        {
          heading: "الحجوزات",
          body: [
            "بعد طلب الحجز يجب الدفع بإنستاباي خلال 24 ساعة، وإلا يُلغى الطلب تلقائياً. يمكنك إلغاء طلبك قبل الدفع من حسابك.",
            "يُعتبر الحجز مؤكداً عندما يؤكد فريق سكني وصول المبلغ ويوافق صاحب المكان. عندها يُخفى الإعلان.",
            "يتم التواصل بين المستأجر وصاحب المكان عن طريق فريق سكني فقط.",
          ],
        },
        {
          heading: "مسؤولية أصحاب الأماكن",
          body: [
            "تقر بأن لديك الحق في عرض المكان للإيجار، وأن كل التفاصيل والصور صحيحة وحديثة وتخص المكان نفسه، وأن المكان مخصص للرجال أو للنساء كما هو محدد في الإعلان.",
            "يُمنع نشر إعلانات مزيفة أو مضللة، أو طلب دفع قبل المعاينة، أو أي محتوى مسيء أو مخالف للقانون.",
            "نراجع الإعلانات قبل نشرها، ويحق لنا رفض أي إعلان أو إيقافه أو حذفه دون إشعار مسبق.",
          ],
        },
        {
          heading: "استرداد المبلغ",
          body: [
            "يُرد المبلغ المدفوع كاملاً (الإيجار ورسوم الخدمة) بإنستاباي خلال 24 ساعة في الحالات الآتية: رفض صاحب المكان الحجز، أو عدم رده خلال 24 ساعة من الدفع، أو إبلاغ المستأجر عن مشكلة قبل الاستلام أو خلال 48 ساعة من ميعاد الدخول ولم يكن قد أكد الاستلام.",
            "بعد أن يؤكد المستأجر استلام المكان، يتم التحويل لصاحب المكان ولا يُسترد المبلغ عن طريق سكني. لا تدفع لأي شخص خارج سكني؛ أي مبلغ يُدفع خارج الموقع ليس مسؤولية سكني.",
          ],
        },
        {
          heading: "رسوم الخدمة",
          body: [
            "يدفع المستأجر رسوم خدمة 8% من إيجار شهر واحد مع الدفعة المقدمة، ويدفع صاحب المكان 10% من إيجار شهر واحد تُخصم من أول تحويل له. تظهر القيم على الموقع قبل الحجز.",
            "تتم كل المدفوعات بتحويل إنستاباي إلى الحساب الموضح في صفحة الدفع، وتُعتبر مدفوعة بعد تأكيد فريق سكني لوصول التحويل. يتم تحويل مستحقات صاحب المكان إلى عنوان إنستاباي المسجل في حسابه.",
            "يحق لنا إيقاف نشر إعلانات جديدة لصاحب المكان إذا تأخر سداد رسوم مستحقة أكثر من 14 يوماً.",
          ],
        },
        {
          heading: "حدود المسؤولية",
          body: [
            "نبذل جهدنا لمراجعة الإعلانات والتحقق من أصحاب الأماكن، لكننا لا نضمن دقة كل المعلومات أو توفر المكان. سكني غير مسؤول عن أي خلاف أو خسارة تنتج عن اتفاق بين المستأجر وصاحب المكان.",
          ],
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
            "Accounts: when you create an account (guest or host) we keep your name, email address, mobile number and account type, and your password, stored hashed so nobody can read it.",
            "Hosts: listing details, photos of the place, and a WhatsApp number. Only the Sakani team sees that number; it is never shown to visitors.",
            "Listing without an account: an anonymous session in your browser so you can follow your listings, without an email or name.",
            "Bookings: when you book we keep your name, phone number, move-in date, length of stay, number of people and note, so the Sakani team can contact you and the host. Your number is never public, and the host’s number is not shown to you.",
            "Saved places: kept in your browser, and in your account when you’re logged in so they appear on your other devices.",
            "Visitors: whatever you type into the contact form or a listing report, such as your message and any contact details you add.",
            "Payments: when you pay we keep the amount, the InstaPay transaction reference and the phone number used for the transfer, so we can confirm it arrived. For hosts we keep the InstaPay address they add, to send their payouts. We never ask for or store bank card details.",
            "Chats: we keep your messages with the Sakani team so we can reply and follow up on your booking or any problem.",
            "Profile: your photo, bio, governorate, work or study and languages appear on your public page if you add them. Your number, email and InstaPay are never shown.",
            "Basic technical logs kept by our hosting providers for security and operations. We don’t use advertising or ad-tracking tools.",
          ],
        },
        {
          heading: "Why we use it",
          body: [
            "To run the site: publishing listings after review, arranging bookings and visits between guests and hosts, collecting fees, and answering your messages and reports.",
            "For safety: preventing fraud, fake listings and spam.",
          ],
        },
        {
          heading: "What is public",
          body: [
            "When your listing is published, its details and photos are visible to everyone. Your number, email address and account name are not shown; visitors contact the Sakani team only.",
          ],
        },
        {
          heading: "Who we share data with",
          body: [
            "We don’t sell your data. When a booking is confirmed, the Sakani team shares with each side only what is needed to complete the visit and the rental.",
            "We use service providers to run the site: Supabase (database, sign-in and photo storage) and Vercel (website hosting). Data may be processed on their servers outside Egypt.",
            "We may disclose data if required by a competent legal authority.",
          ],
        },
        {
          heading: "How long we keep it",
          body: [
            "We keep account, listing and booking data until you delete it or ask us to. We keep messages and reports for up to 12 months after they are closed, and payment records for as long as the law requires.",
          ],
        },
        {
          heading: "Your rights",
          body: [
            "You can edit your name and number on your account page, and ask to see, correct or delete your data at any time using the contact form. You can delete your own listings yourself.",
          ],
        },
        {
          heading: "Security",
          body: [
            "We use encrypted connections (HTTPS) and database permission rules that stop anyone from seeing other people’s data. When you log out, the saved places and drafts for your account are removed from your device. No system is perfectly secure, so choose a strong password and don’t share it.",
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
            "Sakani connects guests with hosts who have places to rent across Egypt. The Sakani team works as the middleman: it checks the host, arranges the visit and confirms the booking. Hosts’ numbers are not shown to visitors.",
            "When booking, the guest pays Sakani the first month’s rent and the service fee upfront. Sakani holds the money until the guest confirms they have moved in, then pays the host the rent minus the host fee. We are not a party to the rental contract itself; the deposit and later months are agreed between both sides with the Sakani team’s help.",
          ],
        },
        {
          heading: "Accounts",
          body: [
            "You can create a guest account or a host account, and switch between them on your account page. A guest account is needed to send a booking request.",
            "You are responsible for the accuracy of your details, for keeping your password secret, and for activity on your account.",
          ],
        },
        {
          heading: "Bookings",
          body: [
            "After a booking request, payment by InstaPay is due within 24 hours or the request is cancelled automatically. You can cancel your request from your account before paying.",
            "A booking is confirmed when the Sakani team confirms the payment arrived and the host accepts. The listing is then hidden.",
            "Guests and hosts communicate only through the Sakani team.",
          ],
        },
        {
          heading: "Hosts’ responsibilities",
          body: [
            "You confirm you have the right to rent out the place, that all details and photos are accurate, current and of that place, and that it is for men or for women as stated in the listing.",
            "Fake or misleading listings, asking for payment before a visit, and offensive or unlawful content are not allowed.",
            "We review listings before publishing and may reject, unpublish or delete any listing without prior notice.",
          ],
        },
        {
          heading: "Refunds",
          body: [
            "The full amount paid (rent and service fee) is refunded by InstaPay within 24 hours if: the host declines the booking, the host doesn’t answer within 24 hours of payment, or the guest reports a problem before moving in or within 48 hours of the move-in date and hasn’t confirmed moving in.",
            "Once the guest confirms moving in, the host is paid and the amount can no longer be refunded through Sakani. Never pay anyone outside Sakani; money paid outside the site is not Sakani’s responsibility.",
          ],
        },
        {
          heading: "Service fees",
          body: [
            "Guests pay a service fee of 8% of one month’s rent with the upfront payment; hosts pay 10% of one month’s rent, taken from their first payout. The amounts are shown on the site before booking.",
            "All payments are made by InstaPay transfer to the account shown on the payment page, and count as paid once the Sakani team confirms the transfer arrived. Host payouts are sent to the InstaPay address in their account.",
            "We may stop a host from publishing new listings while a fee is more than 14 days overdue.",
          ],
        },
        {
          heading: "Limitation of liability",
          body: [
            "We do our best to review listings and check hosts, but we can’t guarantee every detail is accurate or that a place is still available. Sakani is not responsible for disputes or losses arising from an agreement between a guest and a host.",
          ],
        },
        {
          heading: "Governing law",
          body: ["These terms are governed by the laws of the Arab Republic of Egypt."],
        },
      ],
    },
  },
};
