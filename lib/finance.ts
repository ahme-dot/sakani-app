/**
 * The one place where booking money is calculated. The database uses the same formula
 * (public.commission_for in 20261103000000_sakani_finance_deposits.sql), and tests check they agree.
 *
 * Amounts are whole Egyptian pounds (integers). Percentages become basis points (8% = 800) and
 * commissions are rounded half-up to the pound with integer arithmetic only, so no floating-point error.
 *
 * Rules: commissions are on the FIRST MONTH'S RENT only; the security deposit never earns commission.
 *   guest pays   = rent + guest commission + deposit
 *   host receives = rent − host commission (and the deposit separately, after the contract is signed)
 *   platform earns = guest commission + host commission
 */

export type CommissionRates = {
  /** Guest commission, percent of one month's rent (e.g. 8). */
  guestPercent: number;
  /** Host commission, percent of one month's rent (e.g. 10). */
  hostPercent: number;
};

export type BookingAmounts = {
  rent: number;
  deposit: number;
  guestCommission: number;
  hostCommission: number;
  /** What the guest pays upfront: first month + guest commission + deposit. */
  guestTotal: number;
  /** What the host receives for the first month: rent − host commission. */
  hostNetRent: number;
  /** Sakani's revenue from the booking (the deposit is not revenue). */
  platformCommission: number;
};

export const DEFAULT_RATES: CommissionRates = { guestPercent: 8, hostPercent: 10 };

function wholePounds(value: number, name: string) {
  if (!Number.isSafeInteger(value) || value < 0) throw new RangeError(`${name} must be a whole number of pounds, 0 or more`);
  return value;
}

/** 8 → 800, 12.5 → 1250 (percent with up to two decimals). */
export function basisPoints(percent: number) {
  if (!Number.isFinite(percent) || percent < 0 || percent > 100) throw new RangeError("percent must be between 0 and 100");
  return Math.round(percent * 100);
}

/** amount × percent / 100, rounded half-up to the pound, using integers only. */
export function commissionFor(amount: number, percent: number) {
  return Math.floor((wholePounds(amount, "amount") * basisPoints(percent) + 5000) / 10000);
}

/** Everything about a booking's money, from the first month's rent and the deposit. Lease length doesn't matter. */
export function bookingAmounts({ rent, deposit }: { rent: number; deposit: number }, rates: CommissionRates = DEFAULT_RATES): BookingAmounts {
  wholePounds(rent, "rent");
  wholePounds(deposit, "deposit");
  const guestCommission = commissionFor(rent, rates.guestPercent);
  const hostCommission = commissionFor(rent, rates.hostPercent);
  return {
    rent,
    deposit,
    guestCommission,
    hostCommission,
    guestTotal: rent + guestCommission + deposit,
    hostNetRent: rent - hostCommission,
    platformCommission: guestCommission + hostCommission,
  };
}

/** Today in Egypt as YYYY-MM-DD, or that many days from it. Move-in dates are Egyptian calendar days. */
export function cairoDay(offset = 0) {
  const today = new Intl.DateTimeFormat("en-CA", { timeZone: "Africa/Cairo" }).format(new Date());
  const date = new Date(`${today}T00:00:00Z`);
  date.setUTCDate(date.getUTCDate() + offset);
  return date.toISOString().slice(0, 10);
}

/** The day a stay ends, as YYYY-MM-DD. Like public.stay_end in the database: 31 January + 1 month is the end of February. */
/** How long a host has to answer a paid booking (host_bookings in the database uses the same). */
export const HOST_ANSWER_HOURS = 24;

/** Until when the host can answer a booking paid at this time. */
export function hostDecideBy(paidAt: string) {
  return new Date(new Date(paidAt).getTime() + HOST_ANSWER_HOURS * 3_600_000);
}

export function stayEnd(moveIn: string, months: number | null) {
  const start = new Date(`${moveIn}T00:00:00Z`);
  const end = new Date(Date.UTC(start.getUTCFullYear(), start.getUTCMonth() + (months ?? 1), 1));
  const lastDay = new Date(Date.UTC(end.getUTCFullYear(), end.getUTCMonth() + 1, 0)).getUTCDate();
  end.setUTCDate(Math.min(start.getUTCDate(), lastDay));
  return end.toISOString().slice(0, 10);
}
