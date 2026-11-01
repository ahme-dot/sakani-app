import type { SiteLocale } from "@/messages/site";

/**
 * Default text for the policy pages. Admins can replace any of them from the admin panel (Legal pages);
 * the saved version is shown instead. All are drafts until a lawyer approves them and an admin ticks "approved".
 */
export const LEGAL_SLUGS = ["cancellation-policy", "refund-policy", "deposit-policy", "commission-disclosure", "host-responsibilities", "guest-responsibilities"] as const;
export type LegalSlug = (typeof LEGAL_SLUGS)[number];

export const LEGAL_PAGE_DEFAULTS: Record<SiteLocale, Record<LegalSlug, { title: string; body: string }>> = {
  ar: {
    "cancellation-policy": {
      title: "سياسة الإلغاء",
      body: "يمكن للمستأجر أو صاحب المكان طلب إلغاء الحجز من حسابه مع ذكر السبب.\n\nيراجع فريق سكني كل طلب حسب سيناريو الإلغاء: إلغاء من صاحب المكان، إلغاء من المستأجر قبل العقد أو بعده، عدم توفر المكان، عدم صحة بيانات الإعلان، خطأ من المنصة، أو اتفاق الطرفين.\n\nقواعد كل سيناريو لم تُعتمد قانونياً بعد، ولا يُطبَّق أي خصم أو احتجاز تلقائياً قبل اعتمادها.",
    },
    "refund-policy": {
      title: "سياسة رد المبالغ",
      body: "يُرد أي مبلغ مستحق بتحويل إنستاباي، ويُسجَّل برقم عملية يظهر للمستأجر في حسابه وفي إيصال الرد.\n\nيهدف فريق سكني إلى إتمام الرد خلال 24 ساعة من الموافقة على الطلب.\n\nقيمة المبلغ المستحق تُحدد حسب سياسة الإلغاء المعتمدة.",
    },
    "deposit-policy": {
      title: "سياسة التأمين",
      body: "يدفع المستأجر التأمين مع الدفعة المقدمة، ولا تُحسب عليه أي رسوم.\n\nيُحوَّل التأمين لصاحب المكان بعد موافقة الطرفين على عقد الإيجار وتأكيد الدفع، مرة واحدة فقط، ويُقر صاحب المكان باستلامه.\n\nبعد التحويل يصبح صاحب المكان مسؤولاً عن رد التأمين للمستأجر وفق العقد والقانون. يسجّل فريق سكني أي رد أو نزاع على التأمين.",
    },
    "commission-disclosure": {
      title: "الإفصاح عن الرسوم",
      body: "رسوم المستأجر: 8% من إيجار الشهر الأول، تُضاف إلى الدفعة المقدمة.\n\nرسوم صاحب المكان: 10% من إيجار الشهر الأول، تُخصم من أول تحويل له.\n\nلا تُحسب أي رسوم على التأمين أو على باقي أشهر الإيجار. كل حجز يحتفظ بالنسب السارية وقت إنشائه.",
    },
    "host-responsibilities": {
      title: "مسؤوليات صاحب المكان",
      body: "• أن يكون له حق تأجير المكان.\n• أن تكون البيانات والصور صحيحة وحديثة.\n• تسليم المكان في الموعد وبالحالة الموصوفة.\n• رد التأمين للمستأجر وفق العقد.\n• عدم طلب أي مبالغ خارج المنصة.",
    },
    "guest-responsibilities": {
      title: "مسؤوليات المستأجر",
      body: "• تقديم بيانات صحيحة.\n• الدفع عن طريق سكني فقط.\n• المحافظة على المكان واستخدامه للسكن فقط.\n• الالتزام بعقد الإيجار وقواعد العقار.\n• تأكيد استلام المكان أو الإبلاغ عن أي مشكلة من حسابه.",
    },
  },
  en: {
    "cancellation-policy": {
      title: "Cancellation policy",
      body: "The guest or the host can request a cancellation from their account, giving the reason.\n\nThe Sakani team reviews each request by scenario: host cancels, guest cancels before or after the contract, place unavailable, inaccurate listing, platform failure, or mutual agreement.\n\nThe rules for each scenario are not yet legally approved, and no deduction or retention is applied automatically before they are.",
    },
    "refund-policy": {
      title: "Refund policy",
      body: "Any amount due is refunded by InstaPay transfer and recorded with a transaction number shown to the guest in their account and on the refund receipt.\n\nThe Sakani team aims to complete refunds within 24 hours of approving a request.\n\nThe amount due is set by the approved cancellation policy.",
    },
    "deposit-policy": {
      title: "Deposit policy",
      body: "The guest pays the security deposit with the upfront payment; no fee is charged on it.\n\nThe deposit is transferred to the host after both sides accept the rental agreement and the payment is confirmed, once only, and the host acknowledges receiving it.\n\nAfter the transfer, the host is responsible for returning the deposit to the guest under the agreement and the law. The Sakani team records any return or dispute.",
    },
    "commission-disclosure": {
      title: "Fee disclosure",
      body: "Guest fee: 8% of the first month’s rent, added to the upfront payment.\n\nHost fee: 10% of the first month’s rent, taken from the first payout.\n\nNo fee is charged on the deposit or on later months. Each booking keeps the rates in force when it was made.",
    },
    "host-responsibilities": {
      title: "Host responsibilities",
      body: "• Have the right to rent out the place.\n• Keep details and photos accurate and current.\n• Hand over the place on time and as described.\n• Return the deposit to the guest under the agreement.\n• Never ask for money outside the platform.",
    },
    "guest-responsibilities": {
      title: "Guest responsibilities",
      body: "• Give accurate details.\n• Pay through Sakani only.\n• Take care of the place and use it for residence only.\n• Follow the rental agreement and the building’s rules.\n• Confirm moving in, or report any problem, from your account.",
    },
  },
};
