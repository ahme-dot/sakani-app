import type { NextConfig } from "next";

function supabaseStoragePattern(): URL[] {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL?.trim();
  if (!supabaseUrl) return [];
  try {
    return [new URL(`${supabaseUrl.replace(/\/+$/, "")}/storage/v1/object/public/**`)];
  } catch {
    console.warn("NEXT_PUBLIC_SUPABASE_URL is not a valid URL; listing photos will not be optimized.");
    return [];
  }
}

/**
 * Content-Security-Policy: where pages may load scripts, images, frames and data from. Next.js needs inline
 * scripts for its own start-up; everything else is limited to this site, Supabase, the photo host, the map,
 * Cloudflare Turnstile and Vercel Analytics. Pages can't be framed by other sites.
 */
function contentSecurityPolicy(): string {
  const supabase = process.env.NEXT_PUBLIC_SUPABASE_URL?.trim().replace(/\/+$/, "") ?? "";
  const supabaseSocket = supabase.replace(/^https:/, "wss:");
  const dev = process.env.NODE_ENV !== "production";
  return [
    "default-src 'self'",
    `script-src 'self' 'unsafe-inline'${dev ? " 'unsafe-eval'" : ""} https://challenges.cloudflare.com https://va.vercel-scripts.com`,
    "style-src 'self' 'unsafe-inline'",
    `img-src 'self' data: blob: https://images.unsplash.com ${supabase}`,
    "font-src 'self' data:",
    `connect-src 'self' ${supabase} ${supabaseSocket} https://va.vercel-scripts.com https://vitals.vercel-insights.com`,
    "frame-src https://challenges.cloudflare.com https://maps.google.com https://www.google.com",
    "frame-ancestors 'none'",
    "object-src 'none'",
    "base-uri 'self'",
    "form-action 'self'",
    "upgrade-insecure-requests",
  ].join("; ");
}

const nextConfig: NextConfig = {
  // Dev server only: let phones on the same Wi-Fi load the page scripts (http://192.168.x.x:3000).
  allowedDevOrigins: ["192.168.*.*", "10.*.*.*"],
  images: {
    remotePatterns: [
      // Listing photos uploaded by owners.
      ...supabaseStoragePattern(),
      // Hero and sample images.
      { protocol: "https", hostname: "images.unsplash.com" },
    ],
  },
  async headers() {
    return [
      {
        source: "/:path*",
        headers: [
          { key: "X-Content-Type-Options", value: "nosniff" },
          { key: "X-Frame-Options", value: "DENY" },
          { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
          { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=(), payment=()" },
          { key: "Content-Security-Policy", value: contentSecurityPolicy() },
        ],
      },
    ];
  },
};

export default nextConfig;
