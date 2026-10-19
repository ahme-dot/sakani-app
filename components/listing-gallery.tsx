"use client";

import { useState } from "react";
import Image from "next/image";

export default function ListingGallery({ images, altFor }: { images: string[]; altFor: string[] }) {
  const [active, setActive] = useState(0);

  return (
    <div className="listing-gallery">
      <div className="listing-gallery-main">
        <Image src={images[active]} alt={altFor[active]} fill priority sizes="(max-width: 900px) 100vw, 680px" />
      </div>
      {images.length > 1 && (
        <div className="listing-gallery-thumbs">
          {images.map((src, index) => (
            <button
              key={src}
              type="button"
              className={index === active ? "is-active" : ""}
              aria-label={altFor[index]}
              aria-pressed={index === active}
              onClick={() => setActive(index)}
            >
              <Image src={src} alt="" fill sizes="96px" />
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
