import type { SupabaseClient } from "@supabase/supabase-js";

/** Where owners send money, and how the success fee is calculated. Edited by admins. */
export type PaymentSettings = {
  payee_name: string;
  instapay_address: string;
  vodafone_cash_number: string;
  fee_percent: number;
  fee_minimum: number;
};

export type FeeStatus = "due" | "submitted" | "paid" | "waived";
export type PaymentMethod = "instapay" | "vodafone_cash";

export type RentalFee = {
  id: string;
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
  fee_percent: 20,
  fee_minimum: 150,
};

export const RENTAL_FEE_COLUMNS =
  "id,listing_id,owner_id,listing_title,monthly_price,amount,status,method,reference,payer_phone,admin_note,created_by_admin,created_at,submitted_at,decided_at";

/** A fee is overdue after this many days; owners then can't add new listings (enforced in the database). */
export const FEE_GRACE_DAYS = 14;

export async function fetchPaymentSettings(client: SupabaseClient): Promise<PaymentSettings | null> {
  const { data, error } = await client
    .from("app_settings")
    .select("payee_name,instapay_address,vodafone_cash_number,fee_percent,fee_minimum")
    .eq("id", 1)
    .maybeSingle();
  if (error || !data) return null;
  return { ...data, fee_percent: Number(data.fee_percent), fee_minimum: Number(data.fee_minimum) } as PaymentSettings;
}

/** Same formula as the database function success_fee_for, for showing the amount before confirming. */
export function successFee(monthlyPrice: number, settings: PaymentSettings) {
  return Math.max(settings.fee_minimum, Math.round((monthlyPrice * settings.fee_percent) / 100));
}

/** True when the database has not been updated with the payments migration yet. */
export function isMissingFunction(error: { code?: string } | null | undefined) {
  return error?.code === "PGRST202" || error?.code === "42P01" || error?.code === "PGRST205";
}
