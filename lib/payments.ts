import type { SupabaseClient } from "@supabase/supabase-js";
import { commissionFor, type CommissionRates } from "@/lib/finance";

/** Where owners send money, and how the success fee is calculated. Edited by admins. */
export type PaymentSettings = {
  payee_name: string;
  instapay_address: string;
  vodafone_cash_number: string;
  fee_percent: number;
  fee_minimum: number;
  /** WhatsApp number students use to reach the Sakani team. */
  team_whatsapp: string;
  student_fee_percent: number;
  student_fee_minimum: number;
};

export type FeeStatus = "due" | "submitted" | "paid" | "waived" | "refunded";
/** New payments are by InstaPay only; "vodafone_cash" remains on older fees. */
export type PaymentMethod = "instapay" | "vodafone_cash";
/** "fee": a service fee; "upfront": a guest's first month + service fee, held by Sakani. */
export type FeeKind = "fee" | "upfront";

export type FeePayer = "owner" | "student";

export type RentalFee = {
  id: string;
  /** Private link token for the payment page (/pay/<token>). */
  pay_token: string;
  payer: FeePayer;
  kind: FeeKind;
  rent_amount: number | null;
  fee_amount: number | null;
  deposit_amount: number;
  request_id: string | null;
  payer_name: string | null;
  payer_contact: string | null;
  listing_id: string | null;
  owner_id: string;
  listing_title: string;
  monthly_price: number;
  amount: number;
  status: FeeStatus;
  method: PaymentMethod | null;
  reference: string | null;
  payer_phone: string | null;
  admin_note: string | null;
  created_by_admin: boolean;
  created_at: string;
  submitted_at: string | null;
  decided_at: string | null;
};

export const DEFAULT_PAYMENT_SETTINGS: PaymentSettings = {
  payee_name: "",
  instapay_address: "",
  vodafone_cash_number: "",
  fee_percent: 10,
  fee_minimum: 0,
  team_whatsapp: "",
  student_fee_percent: 8,
  student_fee_minimum: 0,
};

export const RENTAL_FEE_COLUMNS =
  "id,pay_token,payer,kind,rent_amount,fee_amount,deposit_amount,request_id,payer_name,payer_contact,listing_id,owner_id,listing_title,monthly_price,amount,status,method,reference,payer_phone,admin_note,created_by_admin,created_at,submitted_at,decided_at";

/** A fee is overdue after this many days; owners then can't add new listings (enforced in the database). */
export const FEE_GRACE_DAYS = 14;

export async function fetchPaymentSettings(client: SupabaseClient): Promise<PaymentSettings | null> {
  const { data, error } = await client
    .from("app_settings")
    .select("payee_name,instapay_address,vodafone_cash_number,fee_percent,fee_minimum,team_whatsapp,student_fee_percent,student_fee_minimum")
    .eq("id", 1)
    .maybeSingle();
  if (error || !data) return null;
  return {
    ...data,
    fee_percent: Number(data.fee_percent),
    fee_minimum: Number(data.fee_minimum),
    student_fee_percent: Number(data.student_fee_percent),
    student_fee_minimum: Number(data.student_fee_minimum),
  } as PaymentSettings;
}

/** The host commission on one month's rent (lib/finance.ts; the same formula as the database). */
export function successFee(monthlyPrice: number, settings: PaymentSettings) {
  return Math.max(settings.fee_minimum, commissionFor(monthlyPrice, settings.fee_percent));
}

/** The guest commission on one month's rent (lib/finance.ts; the same formula as the database). */
export function studentFee(monthlyPrice: number, settings: PaymentSettings) {
  return Math.max(settings.student_fee_minimum, commissionFor(monthlyPrice, settings.student_fee_percent));
}

/** The commission rates from the admin settings. */
export function ratesFrom(settings: PaymentSettings): CommissionRates {
  return { guestPercent: settings.student_fee_percent, hostPercent: settings.fee_percent };
}

/** True when the database has not been updated with the payments migration yet. */
export function isMissingFunction(error: { code?: string } | null | undefined) {
  return error?.code === "PGRST202" || error?.code === "42P01" || error?.code === "PGRST205";
}
