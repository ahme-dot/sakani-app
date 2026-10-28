"use client";

import { useEffect, useRef, useState, type FormEvent } from "react";
import { createPortal } from "react-dom";
import { useRouter } from "next/navigation";
import { Search, X } from "lucide-react";
import { GOVERNORATES, governorateLabel } from "@/lib/egypt";
import { EMPTY_FILTERS, filtersToParams } from "@/lib/supabase/listings";
import { SITE_COPY, type SiteLocale } from "@/messages/site";

export type SearchValues = { governorate: string; propertyType: string; gender: string };
export const EMPTY_SEARCH: SearchValues = { governorate: "", propertyType: "", gender: "" };

type Props = {
  locale: SiteLocale;
  /** Current search on the home page; other pages start empty. */
  value?: SearchValues;
  /** Home page applies the search in place; elsewhere the pill opens the home page with the search. */
  onSearch?: (values: SearchValues) => void;
};

/** Airbnb-style search: a pill with three parts on desktop, a full-screen sheet on phones. */
export default function SearchPill({ locale, value = EMPTY_SEARCH, onSearch }: Props) {
  const t = SITE_COPY[locale];
  const router = useRouter();
  const [draft, setDraft] = useState<SearchValues>(value);
  const [sheetOpen, setSheetOpen] = useState(false);
  const sheetRef = useRef<HTMLDivElement>(null);

  const whereLabel = (name: string) => (name ? governorateLabel(locale, name) : t.searchAnywhere);
  const typeLabel = (type: string) => (type === "room" || type === "apartment" || type === "bed" ? t[type] : t.allTypes);
  const genderLabel = (gender: string) => (gender === "female" || gender === "male" ? t[gender] : t.searchAnyone);

  function run(values: SearchValues) {
    setSheetOpen(false);
    if (onSearch) {
      onSearch(values);
      return;
    }
    const params = filtersToParams({ ...EMPTY_FILTERS, ...values }).toString();
    router.push(`/${locale}${params ? `?${params}` : ""}#homes`);
  }

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    run(draft);
  }

  // Phone sheet: lock page scroll, close with Escape, and move focus into the sheet.
  useEffect(() => {
    if (!sheetOpen) return;
    const previous = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    sheetRef.current?.querySelector<HTMLElement>("select")?.focus();
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") setSheetOpen(false);
    };
    window.addEventListener("keydown", onKey);
    return () => {
      document.body.style.overflow = previous;
      window.removeEventListener("keydown", onKey);
    };
  }, [sheetOpen]);

  const fields = (
    <>
      <label className="search-seg">
        <span className="search-seg-label">{t.searchWhere}</span>
        <span className="search-seg-value">{whereLabel(draft.governorate)}</span>
        <select value={draft.governorate} onChange={(event) => setDraft({ ...draft, governorate: event.target.value })}>
          <option value="">{t.searchAnywhere}</option>
          {GOVERNORATES.map((item) => <option key={item.id} value={item.name_en}>{locale === "ar" ? item.name : item.name_en}</option>)}
        </select>
      </label>
      <span className="search-seg-divider" aria-hidden="true" />
      <label className="search-seg">
        <span className="search-seg-label">{t.propertyType}</span>
        <span className="search-seg-value">{typeLabel(draft.propertyType)}</span>
        <select value={draft.propertyType} onChange={(event) => setDraft({ ...draft, propertyType: event.target.value })}>
          <option value="">{t.allTypes}</option>
          <option value="room">{t.room}</option>
          <option value="apartment">{t.apartment}</option>
          <option value="bed">{t.bed}</option>
        </select>
      </label>
      <span className="search-seg-divider" aria-hidden="true" />
      <label className="search-seg">
        <span className="search-seg-label">{t.searchWho}</span>
        <span className="search-seg-value">{genderLabel(draft.gender)}</span>
        <select value={draft.gender} onChange={(event) => setDraft({ ...draft, gender: event.target.value })}>
          <option value="">{t.searchAnyone}</option>
          <option value="female">{t.female}</option>
          <option value="male">{t.male}</option>
        </select>
      </label>
    </>
  );

  const summary = [draft.governorate && whereLabel(draft.governorate), draft.propertyType && typeLabel(draft.propertyType), draft.gender && genderLabel(draft.gender)]
    .filter(Boolean)
    .join(" · ");

  return (
    <>
      <form className="search-pill" role="search" aria-label={t.searchTitle} onSubmit={submit}>
        {fields}
        <button className="search-pill-go" type="submit" aria-label={t.searchButton}>
          <Search size={17} strokeWidth={2.6} />
        </button>
      </form>

      <button className="search-pill-mobile" type="button" aria-haspopup="dialog" onClick={() => setSheetOpen(true)}>
        <Search size={19} strokeWidth={2.4} />
        <span>
          <strong>{t.searchMobilePrompt}</strong>
          <small>{summary || `${t.searchAnywhere} · ${t.allTypes}`}</small>
        </span>
      </button>

      {/* Rendered at the page root: inside the sticky header it would sit behind the phone tab bar. */}
      {sheetOpen && createPortal(
        <div className="search-sheet" role="dialog" aria-modal="true" aria-label={t.searchTitle} ref={sheetRef}>
          <div className="search-sheet-head">
            <button type="button" className="icon-circle" onClick={() => setSheetOpen(false)} aria-label={t.close}><X size={18} /></button>
            <strong>{t.headerSearch}</strong>
          </div>
          <form className="search-sheet-body" onSubmit={submit}>
            <div className="search-sheet-fields">{fields}</div>
            <div className="search-sheet-foot">
              <button type="button" className="text-button" onClick={() => setDraft(EMPTY_SEARCH)}>{t.filtersClear}</button>
              <button type="submit" className="button button-primary"><Search size={17} /> {t.searchButton}</button>
            </div>
          </form>
        </div>,
        document.body,
      )}
    </>
  );
}
