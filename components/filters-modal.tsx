"use client";

import { useEffect, useRef, useState } from "react";
import type { SupabaseClient } from "@supabase/supabase-js";
import { X } from "lucide-react";
import { GOVERNORATES, areaSuggestions } from "@/lib/egypt";
import { AMENITY_FILTERS, EMPTY_FILTERS, countApprovedListings, type AmenityFilter, type ListingFilters } from "@/lib/supabase/listings";
import { SITE_COPY, type SiteLocale } from "@/messages/site";

type Props = {
  locale: SiteLocale;
  filters: ListingFilters;
  /** Counts matching homes for the "Show N homes" button; null in sample mode. */
  supabase: SupabaseClient | null;
  onClose: () => void;
  onApply: (filters: ListingFilters) => void;
};

/** Airbnb-style filters window. Mounted only while open, so it starts from the current filters. */
export default function FiltersModal({ locale, filters, supabase, onClose, onApply }: Props) {
  const t = SITE_COPY[locale];
  const [draft, setDraft] = useState<ListingFilters>(filters);
  const [count, setCount] = useState<number | null>(null);
  const dialogRef = useRef<HTMLDivElement>(null);
  const numberFormat = new Intl.NumberFormat(locale === "ar" ? "ar-EG-u-nu-latn" : "en-EG");
  const amenityLabels: Record<AmenityFilter, string> = { furnished: t.furnished, wifi: t.wifi, air_conditioning: t.airConditioning, security: t.secure };
  const set = (patch: Partial<ListingFilters>) => setDraft((current) => ({ ...current, ...patch }));

  // Live "Show N homes" count, debounced while typing prices.
  useEffect(() => {
    if (!supabase) return;
    let active = true;
    const timer = window.setTimeout(() => {
      void countApprovedListings(supabase, draft).then((result) => {
        if (active) setCount(result);
      });
    }, 300);
    return () => {
      active = false;
      window.clearTimeout(timer);
    };
  }, [supabase, draft]);

  // Escape closes; page scroll is locked; focus starts inside the window.
  useEffect(() => {
    const previous = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    dialogRef.current?.focus();
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => {
      document.body.style.overflow = previous;
      window.removeEventListener("keydown", onKey);
    };
  }, [onClose]);

  const choice = (name: string, value: string, current: string, label: string, onPick: () => void) => (
    <label className="choice" key={`${name}-${value}`}>
      <input type="radio" name={name} checked={current === value} onChange={onPick} />
      <span>{label}</span>
    </label>
  );

  const showLabel = !supabase ? t.searchButton : count === null ? t.filtersCounting : count === 0 ? t.filtersNone : t.filtersShow(numberFormat.format(count));

  return (
    <div className="modal-backdrop" onPointerDown={(event) => { if (event.target === event.currentTarget) onClose(); }}>
      <div className="filters-modal" role="dialog" aria-modal="true" aria-labelledby="filters-title" tabIndex={-1} ref={dialogRef}>
        <div className="filters-head">
          <button type="button" className="icon-circle" onClick={onClose} aria-label={t.close}><X size={18} /></button>
          <h2 id="filters-title">{t.filtersButton}</h2>
        </div>

        <div className="filters-body">
          <section>
            <h3>{t.filtersPrice}</h3>
            <div className="filters-price">
              <label className="owner-field"><span>{t.filtersMin}</span>
                <input type="number" inputMode="numeric" min="0" step="100" dir="ltr" placeholder="0" value={draft.minPrice} onChange={(event) => set({ minPrice: event.target.value.replace(/\D/g, "").slice(0, 7) })} />
              </label>
              <span aria-hidden="true">–</span>
              <label className="owner-field"><span>{t.filtersMax}</span>
                <input type="number" inputMode="numeric" min="0" step="100" dir="ltr" placeholder={t.anyPrice} value={draft.maxPrice} onChange={(event) => set({ maxPrice: event.target.value.replace(/\D/g, "").slice(0, 7) })} />
              </label>
            </div>
          </section>

          <section>
            <h3>{t.propertyType}</h3>
            <div className="choice-row">
              {choice("type", "", draft.propertyType, t.allTypes, () => set({ propertyType: "" }))}
              {(["room", "apartment", "bed"] as const).map((type) => choice("type", type, draft.propertyType, t[type], () => set({ propertyType: type })))}
            </div>
          </section>

          <section>
            <h3>{t.searchWho}</h3>
            <div className="choice-row">
              {choice("gender", "", draft.gender, t.searchAnyone, () => set({ gender: "" }))}
              {(["female", "male", "mixed"] as const).map((gender) => choice("gender", gender, draft.gender, t[gender], () => set({ gender })))}
            </div>
          </section>

          <section>
            <h3>{t.searchWhere}</h3>
            <div className="owner-form-grid">
              <label className="owner-field">
                <span>{t.governorate}</span>
                <select value={draft.governorate} onChange={(event) => set({ governorate: event.target.value, university: "" })}>
                  <option value="">{t.searchAnywhere}</option>
                  {GOVERNORATES.map((item) => <option key={item.id} value={item.name_en}>{locale === "ar" ? item.name : item.name_en}</option>)}
                </select>
              </label>
              <label className="owner-field">
                <span>{t.area}</span>
                <input value={draft.area} maxLength={60} list="filter-area-suggestions" autoComplete="off" placeholder={t.searchAnyArea} onChange={(event) => set({ area: event.target.value })} />
                <datalist id="filter-area-suggestions">
                  {areaSuggestions(locale, draft.governorate).map((name) => <option key={name} value={name} />)}
                </datalist>
              </label>
            </div>
          </section>

          <section>
            <h3>{t.filterAmenities}</h3>
            <div className="choice-row">
              {AMENITY_FILTERS.map((amenity) => (
                <label className="choice" key={amenity}>
                  <input
                    type="checkbox"
                    checked={draft.amenities.includes(amenity)}
                    onChange={() => set({ amenities: draft.amenities.includes(amenity) ? draft.amenities.filter((item) => item !== amenity) : [...draft.amenities, amenity] })}
                  />
                  <span>{amenityLabels[amenity]}</span>
                </label>
              ))}
            </div>
          </section>

          <section>
            <label className="choice filters-verified">
              <input type="checkbox" checked={draft.verified} onChange={(event) => set({ verified: event.target.checked })} />
              <span>{t.filtersVerifiedOnly}</span>
            </label>
          </section>
        </div>

        <div className="filters-foot">
          <button type="button" className="text-button" onClick={() => setDraft({ ...EMPTY_FILTERS, sort: draft.sort })}>{t.filtersClear}</button>
          <button type="button" className="button button-primary" disabled={count === 0} onClick={() => onApply(draft)}>{showLabel}</button>
        </div>
      </div>
    </div>
  );
}
