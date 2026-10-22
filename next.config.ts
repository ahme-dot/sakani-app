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
        ],
      },
    ];
  },
};

export default nextConfig;
