"use client";

import { BadgeCheck, BedDouble, Building, DoorOpen, Heart, LayoutGrid, Mars, SlidersHorizontal, Sofa, Venus } from "lucide-react";
import type { ListingFilters } from "@/lib/supabase/listings";
import { SITE_COPY, type SiteLocale } from "@/messages/site";

type Props = {
  locale: SiteLocale;
  filters: ListingFilters;
  onChange: (patch: Partial<ListingFilters>) => void;
  onOpenFilters: () => void;
  /** Filters set in the Filters window that the categories do not show (price, area, other amenities). */
  extraCount: number;
  savedCount: number;
  showSaved: boolean;
  onToggleSaved: () => void;
};

type Category = { key: string; label: string; icon: typeof LayoutGrid; active: boolean; patch: Partial<ListingFilters> };

/** Row of icon categories; each one toggles a single filter. Universities live in the search bar. */
export default function CategoryBar({ locale, filters, onChange, onOpenFilters, extraCount, savedCount, showSaved, onToggleSaved }: Props) {
  const t = SITE_COPY[locale];
  const furnished = filters.amenities.includes("furnished");
  const toggle = <K extends keyof ListingFilters>(key: K, value: ListingFilters[K], empty: ListingFilters[K]) =>
    ({ [key]: filters[key] === value ? empty : value }) as Partial<ListingFilters>;

  const categories: Category[] = [
    {
      key: "all",
      label: t.categoryAll,
      icon: LayoutGrid,
      active: !showSaved && !filters.propertyType && !filters.gender && !filters.verified && !furnished,
      patch: { propertyType: "", gender: "", verified: false, amenities: filters.amenities.filter((item) => item !== "furnished") },
    },
    { key: "verified", label: t.categoryVerified, icon: BadgeCheck, active: filters.verified, patch: { verified: !filters.verified } },
    { key: "female", label: t.categoryWomen, icon: Venus, active: filters.gender === "female", patch: toggle("gender", "female", "") },
    { key: "male", label: t.categoryMen, icon: Mars, active: filters.gender === "male", patch: toggle("gender", "male", "") },
    { key: "room", label: t.categoryRooms, icon: DoorOpen, active: filters.propertyType === "room", patch: toggle("propertyType", "room", "") },
    { key: "apartment", label: t.categoryApartments, icon: Building, active: filters.propertyType === "apartment", patch: toggle("propertyType", "apartment", "") },
    { key: "bed", label: t.categoryBeds, icon: BedDouble, active: filters.propertyType === "bed", patch: toggle("propertyType", "bed", "") },
    {
      key: "furnished",
      label: t.furnished,
      icon: Sofa,
      active: furnished,
      patch: { amenities: furnished ? filters.amenities.filter((item) => item !== "furnished") : [...filters.amenities, "furnished"] },
    },
  ];

  return (
    <div className="category-bar">
      <div className="category-inner">
        <div className="category-scroll" role="group" aria-label={t.categoriesLabel}>
          {categories.map(({ key, label, icon: Icon, active, patch }) => (
            <button key={key} type="button" className={`category-tab${active && !showSaved ? " is-active" : ""}`} aria-pressed={active && !showSaved} onClick={() => onChange(patch)}>
              <Icon size={22} strokeWidth={1.7} />
              <span>{label}</span>
            </button>
          ))}
          {(savedCount > 0 || showSaved) && (
            <button type="button" className={`category-tab category-saved${showSaved ? " is-active" : ""}`} aria-pressed={showSaved} onClick={onToggleSaved}>
              <Heart size={22} strokeWidth={1.7} fill={showSaved ? "currentColor" : "none"} />
              <span>{t.savedFilter(savedCount)}</span>
            </button>
          )}
        </div>
        <button type="button" className="filters-button" onClick={onOpenFilters}>
          <SlidersHorizontal size={16} /> {t.filtersButton}
          {extraCount > 0 && <span className="filters-count">{extraCount}</span>}
        </button>
      </div>
    </div>
  );
}
