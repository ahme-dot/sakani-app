import type { Metadata } from "next";
import { DesignPrintBook, DesignPrintControls } from "@/components/design-studio";

export const metadata: Metadata = {
  title: "Sakani Design Concepts | PDF",
  robots: { index: false, follow: false },
};

export default function DesignStudioPrintPage() {
  return (
    <>
      <DesignPrintControls />
      <DesignPrintBook />
    </>
  );
}
