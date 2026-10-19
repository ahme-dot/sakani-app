import type { MetadataRoute } from "next";
import { SITE_URL } from "@/lib/site";

export default function robots(): MetadataRoute.Robots {
  return {
    rules: {
      userAgent: "*",
      allow: "/",
      disallow: ["/admin", "/ar/admin", "/en/admin", "/ar/sign-in", "/en/sign-in", "/ar/update-password", "/en/update-password"],
    },
    sitemap: `${SITE_URL}/sitemap.xml`,
  };
}
