import type { SiteLocale } from "@/messages/site";

/**
 * DRAFT document templates (platform agreements, rental agreement, receipts). Written to describe what the site does;
 * not legal advice. They must be reviewed by an Egyptian lawyer before relying on them. Changing a template's
 * meaning means raising DOCUMENT_VERSION in lib/documents.ts, so earlier acceptances stay tied to the earlier text.
 */
type Section = { heading: string; body: string[] };

type DocumentsCopy = {
  draftNotice: string;
  notSignatureNotice: string;
  print: string;
  documentsTitle: string;
  documentsIntro: string;
  notAvailableYet: string;
  open: string;
  back: string;
  reference: string;
  issuedOn: string;
  version: string;
  parties: string;
  guest: string;
  host: string;
  platform: string;
  property: string;
  moveIn: string;
  stay: string;
  months: (count: number) => string;
  people: string;
  amounts: string;
  firstMonthRent: string;
  guestFee: string;
  hostFee: string;
  deposit: string;
  totalPaid: string;
  hostNetRent: string;
  platformTotal: string;
  paymentMethod: string;
  instapay: string;
  transactionRef: string;
  paymentStatus: string;
  paymentDate: string;
  acceptances: string;
  acceptedBy: (party: string, date: string) => string;
  notAcceptedYet: (party: string) => string;
  acceptButton: string;
  acceptedNote: string;
  contractSigned: (date: string) => string;
  contractWaiting: string;
  acceptError: string;
  loadError: string;
  signInNeeded: string;
  titles: Record<"guest_platform" | "host_platform" | "booking_confirmation" | "payment_receipt" | "rental_agreement" | "deposit_receipt" | "cancellation_request" | "refund_receipt", string>;
  guestPlatform: Section[];
  hostPlatform: Section[];
  rentalAgreement: Section[];
  bookingConfirmationText: string;
  paymentReceiptText: string;
  depositReceiptText: string;
  depositAcknowledged: (date: string) => string;
  depositNotAcknowledged: string;
  cancellationText: string;
  cancellationReason: string;
  cancellationDate: string;
  refundReceiptText: string;
  refundRef: string;
  refundDate: string;
  statusLabels: Record<string, string>;
};

export const DOCUMENTS_COPY: Record<SiteLocale, DocumentsCopy> = {
  ar: {
    draftNotice: "مسودة: هذا المستند نموذج مبدئي لم يُراجَع بعد من محامٍ مصري، ولا يُعتمد عليه قانونياً قبل مراجعته.",
    notSignatureNotice: "الموافقة على هذا المستند داخل موقع سكني هي موافقة مسجلة بتاريخها ونسختها، وليست توقيعاً إلكترونياً معتمداً.",
    print: "تحميل PDF / طباعة",
    documentsTitle: "مستندات الحجز",
    documentsIntro: "كل مستند يظهر عندما يصبح جاهزاً. اضغط «تحميل PDF» واختر «حفظ كـ PDF».",
    notAvailableYet: "لم يجهز بعد",
    open: "افتح",
    back: "رجوع للمستندات",
    reference: "رقم المرجع",
    issuedOn: "تاريخ الإصدار",
    version: "نسخة المستند",
    parties: "الأطراف",
    guest: "المستأجر",
    host: "صاحب المكان",
    platform: "منصة سكني (وسيط)",
    property: "المكان",
    moveIn: "تاريخ الدخول",
    stay: "المدة",
    months: (count) => (count === 1 ? "شهر واحد" : `${count} أشهر`),
    people: "عدد الأفراد",
    amounts: "التفاصيل المالية (بالجنيه المصري)",
    firstMonthRent: "إيجار الشهر الأول",
    guestFee: "رسوم خدمة المستأجر",
    hostFee: "رسوم صاحب المكان (تُخصم من الإيجار)",
    deposit: "مبلغ التأمين (بدون رسوم)",
    totalPaid: "إجمالي ما دفعه المستأجر",
    hostNetRent: "صافي إيجار الشهر الأول لصاحب المكان",
    platformTotal: "إجمالي رسوم المنصة",
    paymentMethod: "طريقة الدفع",
    instapay: "إنستاباي",
    transactionRef: "رقم العملية",
    paymentStatus: "حالة الدفع",
    paymentDate: "تاريخ تأكيد الدفع",
    acceptances: "الموافقات",
    acceptedBy: (party, date) => `وافق ${party} في ${date}`,
    notAcceptedYet: (party) => `لم يوافق ${party} بعد`,
    acceptButton: "أوافق على هذا المستند",
    acceptedNote: "تم تسجيل موافقتك.",
    contractSigned: (date) => `اكتملت موافقة الطرفين على العقد في ${date}.`,
    contractWaiting: "في انتظار موافقة الطرفين.",
    acceptError: "تعذر تسجيل الموافقة. حاول مرة أخرى.",
    loadError: "تعذر تحميل المستند، أو ليس لديك صلاحية لعرضه.",
    signInNeeded: "سجّل الدخول لعرض مستندات الحجز.",
    titles: {
      guest_platform: "اتفاقية استخدام المنصة للمستأجر",
      host_platform: "اتفاقية استخدام المنصة لصاحب المكان",
      booking_confirmation: "تأكيد الحجز",
      payment_receipt: "إيصال دفع",
      rental_agreement: "نموذج عقد إيجار",
      deposit_receipt: "إيصال تحويل التأمين وإقرار الاستلام",
      cancellation_request: "طلب إلغاء / رد مبلغ",
      refund_receipt: "إيصال رد مبلغ",
    },
    guestPlatform: [
      { heading: "دور سكني", body: ["سكني منصة وسيطة تربط المستأجر بصاحب المكان، وليست مالكة للمكان ولا مؤجرة له."] },
      { heading: "الحجز والدفع", body: ["يدفع المستأجر عند الحجز إيجار الشهر الأول ورسوم خدمة 8% من إيجار شهر واحد ومبلغ التأمين، بتحويل إنستاباي إلى الحساب الموضح في صفحة الدفع.", "لا تُحسب رسوم على مبلغ التأمين."] },
      { heading: "حفظ المبالغ وتحويلها", body: ["يحتفظ سكني بإيجار الشهر الأول حتى يؤكد المستأجر استلام المكان، ثم يحوّله لصاحب المكان بعد خصم رسومه.", "يُحوَّل التأمين لصاحب المكان بعد موافقة الطرفين على عقد الإيجار وتأكيد الدفع، ويصبح صاحب المكان مسؤولاً عن رده وفق العقد."] },
      { heading: "الإلغاء والرد", body: ["تُراجع طلبات الإلغاء والرد حسب سياسة الإلغاء والرد المعلنة على الموقع، وهي مسودة لم تُعتمد قانونياً بعد. لا يتم أي خصم أو احتجاز تلقائياً."] },
      { heading: "التواصل", body: ["يتم التواصل مع صاحب المكان عن طريق فريق سكني فقط، ويلتزم المستأجر بعدم الدفع لأي طرف خارج المنصة."] },
    ],
    hostPlatform: [
      { heading: "دور سكني", body: ["سكني منصة وسيطة تعرض المكان وتستقبل الحجوزات والمبالغ نيابة عن الطرفين، وليست طرفاً في عقد الإيجار نفسه."] },
      { heading: "مسؤولية صاحب المكان", body: ["يقر صاحب المكان بأن له حق تأجير المكان، وأن البيانات والصور صحيحة، وأن المكان مخصص للرجال أو للنساء كما هو موضح."] },
      { heading: "الرسوم والتحويلات", body: ["رسوم صاحب المكان 10% من إيجار شهر واحد تُخصم من أول تحويل له.", "يُحوَّل صافي إيجار الشهر الأول بعد تأكيد المستأجر استلام المكان، ويُحوَّل التأمين بعد موافقة الطرفين على العقد، إلى عنوان إنستاباي المسجل في حسابه."] },
      { heading: "التأمين", body: ["يقر صاحب المكان باستلام التأمين عند تحويله، ويكون مسؤولاً عن رده للمستأجر وفق عقد الإيجار والقانون."] },
      { heading: "التواصل", body: ["يتم التواصل مع المستأجر عن طريق فريق سكني فقط، ويلتزم صاحب المكان بعدم طلب أي مبالغ خارج المنصة."] },
    ],
    rentalAgreement: [
      { heading: "موضوع العقد", body: ["يؤجر صاحب المكان للمستأجر المكان الموضح أعلاه للسكن فقط، للمدة وبالقيمة الموضحتين أعلاه."] },
      { heading: "الإيجار", body: ["يُدفع إيجار الشهر الأول عن طريق سكني. يتفق الطرفان على طريقة سداد باقي الأشهر بمساعدة فريق سكني."] },
      { heading: "التأمين", body: ["يُحوَّل التأمين لصاحب المكان بعد موافقة الطرفين على هذا العقد، ويُرد للمستأجر عند نهاية المدة بعد خصم أي تلفيات مثبتة، وفق ما يتفق عليه الطرفان والقانون."] },
      { heading: "التزامات المستأجر", body: ["المحافظة على المكان واستخدامه للسكن فقط، وعدم التأجير من الباطن، والالتزام بقواعد العقار."] },
      { heading: "التزامات صاحب المكان", body: ["تسليم المكان في الموعد وبالحالة الموصوفة في الإعلان، وتمكين المستأجر من الانتفاع الهادئ به."] },
      { heading: "بيانات إضافية", body: ["الرقم القومي للمستأجر: ____________", "الرقم القومي لصاحب المكان: ____________", "العنوان التفصيلي للمكان: ____________"] },
    ],
    bookingConfirmationText: "يؤكد سكني أن هذا الحجز مؤكد: وصل المبلغ المدفوع ووافق صاحب المكان.",
    paymentReceiptText: "يقر سكني باستلام المبلغ التالي من المستأجر عن الحجز الموضح، ويحتفظ به حسب اتفاقية استخدام المنصة.",
    depositReceiptText: "يقر سكني بتحويل مبلغ التأمين التالي لصاحب المكان عن الحجز الموضح. يصبح صاحب المكان مسؤولاً عن رده للمستأجر وفق عقد الإيجار.",
    depositAcknowledged: (date) => `أقر صاحب المكان باستلام التأمين في ${date}.`,
    depositNotAcknowledged: "لم يقر صاحب المكان باستلام التأمين بعد.",
    cancellationText: "طلب المستأجر إلغاء الحجز ورد المبلغ للسبب الموضح. يُراجع الطلب حسب سياسة الإلغاء والرد.",
    cancellationReason: "سبب الطلب",
    cancellationDate: "تاريخ الطلب",
    refundReceiptText: "يقر سكني برد المبلغ التالي للمستأجر عن الحجز الموضح.",
    refundRef: "رقم عملية الرد",
    refundDate: "تاريخ الرد",
    statusLabels: { due: "مطلوب", submitted: "قيد المراجعة", paid: "مدفوع", waived: "ملغى", refunded: "مردود" },
  },
  en: {
    draftNotice: "Draft: this document is a preliminary template not yet reviewed by an Egyptian lawyer; do not rely on it legally before review.",
    notSignatureNotice: "Accepting this document on Sakani is a recorded agreement with its date and version; it is not a certified electronic signature.",
    print: "Download PDF / Print",
    documentsTitle: "Booking documents",
    documentsIntro: "Each document appears when it’s ready. Tap “Download PDF” and choose “Save as PDF”.",
    notAvailableYet: "Not ready yet",
    open: "Open",
    back: "Back to documents",
    reference: "Reference",
    issuedOn: "Issued on",
    version: "Document version",
    parties: "Parties",
    guest: "Guest",
    host: "Host",
    platform: "Sakani platform (intermediary)",
    property: "Place",
    moveIn: "Move-in date",
    stay: "Stay",
    months: (count) => (count === 1 ? "1 month" : `${count} months`),
    people: "People",
    amounts: "Financial breakdown (EGP)",
    firstMonthRent: "First month’s rent",
    guestFee: "Guest service fee",
    hostFee: "Host fee (taken from the rent)",
    deposit: "Security deposit (no fee)",
    totalPaid: "Total paid by the guest",
    hostNetRent: "Host’s net first-month rent",
    platformTotal: "Total platform fees",
    paymentMethod: "Payment method",
    instapay: "InstaPay",
    transactionRef: "Transaction number",
    paymentStatus: "Payment status",
    paymentDate: "Payment confirmed on",
    acceptances: "Acceptances",
    acceptedBy: (party, date) => `${party} accepted on ${date}`,
    notAcceptedYet: (party) => `${party} hasn’t accepted yet`,
    acceptButton: "I accept this document",
    acceptedNote: "Your acceptance is recorded.",
    contractSigned: (date) => `Both sides accepted the contract on ${date}.`,
    contractWaiting: "Waiting for both sides to accept.",
    acceptError: "Couldn’t record your acceptance. Try again.",
    loadError: "Couldn’t load this document, or you don’t have access to it.",
    signInNeeded: "Log in to see your booking documents.",
    titles: {
      guest_platform: "Platform agreement for guests",
      host_platform: "Platform agreement for hosts",
      booking_confirmation: "Booking confirmation",
      payment_receipt: "Payment receipt",
      rental_agreement: "Rental agreement template",
      deposit_receipt: "Deposit transfer receipt and acknowledgement",
      cancellation_request: "Cancellation / refund request",
      refund_receipt: "Refund receipt",
    },
    guestPlatform: [
      { heading: "Sakani’s role", body: ["Sakani is an intermediary platform connecting guests and hosts. It does not own or rent out the place."] },
      { heading: "Booking and payment", body: ["When booking, the guest pays the first month’s rent, a service fee of 8% of one month’s rent, and the security deposit, by InstaPay to the account shown on the payment page.", "No fee is charged on the deposit."] },
      { heading: "Holding and transferring money", body: ["Sakani holds the first month’s rent until the guest confirms moving in, then pays it to the host minus the host fee.", "The deposit is transferred to the host after both sides accept the rental agreement and the payment is confirmed; the host is then responsible for returning it under the agreement."] },
      { heading: "Cancellation and refunds", body: ["Cancellation and refund requests are reviewed under the cancellation and refund policy on the site, which is a draft pending legal approval. No deduction or retention is applied automatically."] },
      { heading: "Contact", body: ["The guest contacts the host only through the Sakani team and agrees not to pay anyone outside the platform."] },
    ],
    hostPlatform: [
      { heading: "Sakani’s role", body: ["Sakani is an intermediary platform that lists the place and receives bookings and payments on behalf of both sides. It is not a party to the rental agreement itself."] },
      { heading: "Host’s responsibility", body: ["The host confirms they have the right to rent out the place, that the details and photos are accurate, and that it is for men or women as stated."] },
      { heading: "Fees and payouts", body: ["The host fee is 10% of one month’s rent, taken from the first payout.", "The net first-month rent is paid after the guest confirms moving in, and the deposit after both sides accept the agreement, to the InstaPay address in the host’s account."] },
      { heading: "Deposit", body: ["The host acknowledges receipt of the deposit when it is transferred and is responsible for returning it to the guest under the rental agreement and the law."] },
      { heading: "Contact", body: ["The host contacts the guest only through the Sakani team and agrees not to ask for any money outside the platform."] },
    ],
    rentalAgreement: [
      { heading: "Subject", body: ["The host rents to the guest the place described above, for residence only, for the stay and amounts shown above."] },
      { heading: "Rent", body: ["The first month’s rent is paid through Sakani. Both sides agree how later months are paid, with the Sakani team’s help."] },
      { heading: "Deposit", body: ["The deposit is transferred to the host after both sides accept this agreement, and is returned to the guest at the end of the stay less any proven damage, as agreed by both sides and the law."] },
      { heading: "Guest’s obligations", body: ["Take care of the place, use it for residence only, do not sublet, and follow the building’s rules."] },
      { heading: "Host’s obligations", body: ["Hand over the place on time and in the condition described in the listing, and allow the guest quiet enjoyment of it."] },
      { heading: "Additional details", body: ["Guest national ID: ____________", "Host national ID: ____________", "Full address of the place: ____________"] },
    ],
    bookingConfirmationText: "Sakani confirms this booking: the payment arrived and the host accepted.",
    paymentReceiptText: "Sakani acknowledges receiving the following amount from the guest for the booking shown, and holds it under the platform agreement.",
    depositReceiptText: "Sakani confirms transferring the following deposit to the host for the booking shown. The host is responsible for returning it to the guest under the rental agreement.",
    depositAcknowledged: (date) => `The host acknowledged receiving the deposit on ${date}.`,
    depositNotAcknowledged: "The host hasn’t acknowledged receiving the deposit yet.",
    cancellationText: "The guest asked to cancel the booking and be refunded, for the reason below. The request is reviewed under the cancellation and refund policy.",
    cancellationReason: "Reason",
    cancellationDate: "Request date",
    refundReceiptText: "Sakani confirms refunding the following amount to the guest for the booking shown.",
    refundRef: "Refund transaction",
    refundDate: "Refund date",
    statusLabels: { due: "Due", submitted: "Under review", paid: "Paid", waived: "Cancelled", refunded: "Refunded" },
  },
};
