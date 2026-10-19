import type { Metadata } from "next";
import type { ReactNode } from "react";

export const metadata: Metadata = {
  title: "Sakani | Student Housing in Giza",
  description: "Find student housing in Giza that fits your needs and budget.",
  keywords: ["student housing", "Giza", "Cairo", "Sakani"],
};

export default function EnglishLayout({ children }: { children: ReactNode }) {
  return children;
}
