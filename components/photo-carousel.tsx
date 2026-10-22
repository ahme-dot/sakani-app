"use client";

import { useRef, useState } from "react";
import Image from "next/image";
import Link from "next/link";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { SITE_COPY, type SiteLocale } from "@/messages/site";

type Props = {
  locale: SiteLocale;
  images: string[];
  alt: string;
  /** Each photo links here (the listing page); omitted for sample cards. */
  href?: string;
  sizes: string;
  /** Show "2 / 5" instead of dots (listing page on phones). */
  counter?: boolean;
  priority?: boolean;
};

const MAX_DOTS = 5;

/** Swipeable photos with arrows (on hover) and dots, like Airbnb cards. */
export default function PhotoCarousel({ locale, images, alt, href, sizes, counter = false, priority = false }: Props) {
  const t = SITE_COPY[locale];
  const track = useRef<HTMLDivElement>(null);
  const [index, setIndex] = useState(0);
  const photos = images.length ? images : [];
  const rtl = locale === "ar";

  function go(step: 1 | -1) {
    const element = track.current;
    if (!element) return;
    // In right-to-left pages the track scrolls towards negative scrollLeft.
    element.scrollBy({ left: step * element.clientWidth * (rtl ? -1 : 1), behavior: "smooth" });
  }

  function onScroll() {
    const element = track.current;
    if (!element || !element.clientWidth) return;
    setIndex(Math.round(Math.abs(element.scrollLeft) / element.clientWidth));
  }

  return (
    <div className="carousel">
      <div className="carousel-track" ref={track} onScroll={onScroll}>
        {photos.map((src, photoIndex) => {
          const image = (
            <Image
              src={src}
              alt={photoIndex === 0 ? alt : ""}
              fill
              sizes={sizes}
              priority={priority && photoIndex === 0}
              loading={priority && photoIndex === 0 ? undefined : "lazy"}
            />
          );
          return (
            <div className="carousel-slide" key={src}>
              {href ? <Link href={href} tabIndex={-1} aria-hidden={photoIndex > 0 ? true : undefined}>{image}</Link> : image}
            </div>
          );
        })}
      </div>
      {photos.length > 1 && (
        <>
          <button type="button" className="carousel-arrow is-prev" aria-label={t.previousPhoto} disabled={index === 0} onClick={() => go(-1)}>
            {rtl ? <ChevronRight size={16} /> : <ChevronLeft size={16} />}
          </button>
          <button type="button" className="carousel-arrow is-next" aria-label={t.nextPhoto} disabled={index >= photos.length - 1} onClick={() => go(1)}>
            {rtl ? <ChevronLeft size={16} /> : <ChevronRight size={16} />}
          </button>
          {counter ? (
            <span className="carousel-counter">{t.photoOf(index + 1, photos.length)}</span>
          ) : (
            <span className="carousel-dots" aria-hidden="true">
              {photos.slice(0, MAX_DOTS).map((src, dot) => (
                <span key={src} className={dot === Math.min(index, MAX_DOTS - 1) ? "is-active" : ""} />
              ))}
            </span>
          )}
        </>
      )}
    </div>
  );
}
