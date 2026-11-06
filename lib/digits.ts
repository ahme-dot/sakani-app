import type { FormEvent } from "react";

/** Arabic-Indic (٠-٩) and Persian (۰-۹) digits as 0-9. Both blocks start at a multiple of 16, so the digit is the code's last hex place. */
export function latinDigits(value: string) {
  return value.replace(/[٠-٩۰-۹]/g, (digit) => String(digit.charCodeAt(0) % 16));
}

/** Rewrites what's in the box without throwing the cursor to the end. */
function rewrite(input: HTMLInputElement, next: string) {
  if (input.value === next) return;
  const caret = input.selectionStart;
  const removed = input.value.length - next.length;
  input.value = next;
  if (caret !== null) {
    const position = Math.max(0, caret - removed);
    input.setSelectionRange(position, position);
  }
}

/** onInput for phones, codes and references: typing ٠١٠ just works. */
export function onDigitsInput(event: FormEvent<HTMLInputElement>) {
  rewrite(event.currentTarget, latinDigits(event.currentTarget.value));
}

/** onInput for amounts and counts: also drops thousands separators and spaces, so "٣٬٠٠٠" becomes 3000. */
export function onNumberInput(event: FormEvent<HTMLInputElement>) {
  rewrite(event.currentTarget, latinDigits(event.currentTarget.value).replace(/[,٬\s]/g, ""));
}

/**
 * Props for a whole-number field. Not type="number": browsers refuse Arabic-Indic digits there before any
 * code sees them. The limits travel as data attributes, so `outOfRange` can check them.
 */
export function numberField(min: number, max: number) {
  return { type: "text", inputMode: "numeric", autoComplete: "off", "data-min": min, "data-max": max, onInput: onNumberInput } as const;
}

/** A filled-in `numberField` that isn't a whole number within its limits. Empty is left to `required`. */
export function outOfRange(input: HTMLInputElement) {
  const value = input.value.trim();
  if (!value) return false;
  const number = Number(value);
  return !/^\d+$/.test(value) || number < Number(input.dataset.min) || number > Number(input.dataset.max);
}

/** An Egyptian mobile: 01 and nine more digits. Spaces, dashes and a +20 or 0020 country code are fine. */
export function isEgyptMobile(value: string) {
  return /^(?:0|\+?20|0020)1\d{9}$/.test(latinDigits(value).replace(/[\s()-]/g, ""));
}
