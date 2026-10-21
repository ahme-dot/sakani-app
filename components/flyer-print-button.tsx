"use client";

import { Printer } from "lucide-react";

export default function FlyerPrintButton({ label }: { label: string }) {
  return (
    <button className="button button-primary flyer-print" type="button" onClick={() => window.print()}>
      <Printer size={16} /> {label}
    </button>
  );
}
