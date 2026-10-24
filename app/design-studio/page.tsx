import type { Metadata } from "next";
import { DesignStudio } from "@/components/design-studio";

export const metadata: Metadata = {
  title: "Sakani Design Studio | Three Concept Previews",
  description: "Compare three bilingual, full-project design directions for Sakani.",
  robots: { index: false, follow: false },
};

export default async function DesignStudioPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const params = await searchParams;
  return (
    <DesignStudio
      initialConcept={typeof params.concept === "string" ? params.concept : undefined}
      initialScreen={typeof params.screen === "string" ? params.screen : undefined}
      initialLocale={typeof params.locale === "string" ? params.locale : undefined}
      initialDevice={typeof params.device === "string" ? params.device : undefined}
    />
  );
}
