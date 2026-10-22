"use client";

import { useEffect, useRef, useState } from "react";
import Image from "next/image";
import { Grid2x2, X } from "lucide-react";
import PhotoCarousel from "@/components/photo-carousel";
import { SITE_COPY, type SiteLocale } from "@/messages/site";

/** Airbnb-style photos: one large and up to four small on desktop, a swipe carousel on phones, and a full list. */
export default function ListingGallery({ locale, images, altFor }: { locale: SiteLocale; images: string[]; altFor: string[] }) {
  const t = SITE_COPY[locale];
  const [showAll, setShowAll] = useState(false);
  const closeRef = useRef<HTMLButtonElement>(null);
  const tiles = images.slice(0, 5);

  useEffect(() => {
    if (!showAll) return;
    const previous = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    closeRef.current?.focus();
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") setShowAll(false);
    };
    window.addEventListener("keydown", onKey);
    return () => {
      document.body.style.overflow = previous;
      window.removeEventListener("keydown", onKey);
    };
  }, [showAll]);

  return (
    <>
      <div className={`photo-grid photo-grid-${tiles.length}`}>
        {tiles.map((src, index) => (
          <button key={src} type="button" className="photo-grid-tile" onClick={() => setShowAll(true)} aria-label={altFor[index]}>
            <Image src={src} alt="" fill priority={index === 0} sizes={index === 0 ? "(max-width: 900px) 100vw, 560px" : "280px"} />
          </button>
        ))}
        {images.length > 1 && (
          <button type="button" className="photo-grid-all" onClick={() => setShowAll(true)}>
            <Grid2x2 size={15} /> {t.showAllPhotos}
          </button>
        )}
      </div>

      <div className="photo-mobile">
        <PhotoCarousel locale={locale} images={images} alt={altFor[0] ?? ""} sizes="100vw" counter priority />
      </div>

      {showAll && (
        <div className="photo-all" role="dialog" aria-modal="true" aria-label={t.showAllPhotos}>
          <div className="photo-all-head">
            <button type="button" className="icon-circle" ref={closeRef} onClick={() => setShowAll(false)} aria-label={t.close}><X size={18} /></button>
          </div>
          <div className="photo-all-list">
            {images.map((src, index) => (
              <div className="photo-all-item" key={src}>
                <Image src={src} alt={altFor[index]} fill sizes="(max-width: 900px) 100vw, 860px" />
              </div>
            ))}
          </div>
        </div>
      )}
    </>
  );
}
