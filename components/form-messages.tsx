"use client";

import { useEffect } from "react";

type Field = HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement;

const COPY = {
  ar: {
    choose: "اختار واحد من الاختيارات.",
    pick: "اختار من القايمة.",
    required: "الخانة دي مطلوبة.",
    email: "اكتب إيميل صحيح، زي name@example.com.",
    format: "الشكل مش مظبوط، راجع اللي كتبته.",
    tooShort: (min: number) => `اكتب ${min} حروف على الأقل.`,
    tooLong: (max: number) => `اكتب ${max} حرف بالكتير.`,
    min: (min: string) => `لازم يكون ${min} أو أكتر.`,
    max: (max: string) => `لازم يكون ${max} أو أقل.`,
    number: "اكتب رقم صحيح.",
  },
  en: {
    choose: "Choose one of the options.",
    pick: "Choose from the list.",
    required: "This field is required.",
    email: "Enter a valid email, like name@example.com.",
    format: "This doesn't look right; please check it.",
    tooShort: (min: number) => `Enter at least ${min} characters.`,
    tooLong: (max: number) => `Enter at most ${max} characters.`,
    min: (min: string) => `Must be ${min} or more.`,
    max: (max: string) => `Must be ${max} or less.`,
    number: "Enter a valid number.",
  },
};

function messageFor(field: Field) {
  const t = COPY[field.closest("[lang]")?.getAttribute("lang") === "en" ? "en" : "ar"];
  const v = field.validity;
  if (v.valueMissing) {
    if (field instanceof HTMLInputElement && (field.type === "radio" || field.type === "checkbox")) return t.choose;
    return field instanceof HTMLSelectElement ? t.pick : t.required;
  }
  if (v.typeMismatch) return field.type === "email" ? t.email : t.format;
  if (v.patternMismatch) return field.title || t.format;
  if (v.tooShort && "minLength" in field) return t.tooShort(field.minLength);
  if (v.tooLong && "maxLength" in field) return t.tooLong(field.maxLength);
  if (v.rangeUnderflow && "min" in field) return t.min(field.min);
  if (v.rangeOverflow && "max" in field) return t.max(field.max);
  if (v.badInput || v.stepMismatch) return t.number;
  return "";
}

/** The browser's own form messages follow the browser's language; these follow the page's (Arabic or English). */
export default function FormMessages() {
  useEffect(() => {
    const onInvalid = (event: Event) => {
      const field = event.target as Field;
      if (!("setCustomValidity" in field)) return;
      field.setCustomValidity("");
      if (!field.validity.valid) field.setCustomValidity(messageFor(field));
    };
    // A custom message keeps the field invalid until it is cleared, so clear it as soon as the value changes.
    const onChange = (event: Event) => {
      const field = event.target as Field;
      if ("setCustomValidity" in field) field.setCustomValidity("");
      if (field instanceof HTMLInputElement && field.type === "radio" && field.form) {
        field.form.querySelectorAll<HTMLInputElement>(`input[type=radio][name="${CSS.escape(field.name)}"]`).forEach((radio) => radio.setCustomValidity(""));
      }
    };
    document.addEventListener("invalid", onInvalid, true);
    document.addEventListener("input", onChange, true);
    document.addEventListener("change", onChange, true);
    return () => {
      document.removeEventListener("invalid", onInvalid, true);
      document.removeEventListener("input", onChange, true);
      document.removeEventListener("change", onChange, true);
    };
  }, []);
  return null;
}
