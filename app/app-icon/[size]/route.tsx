import { ImageResponse } from "next/og";
import { BrandMark } from "@/components/brand-image";

// PNG icons for the web app manifest (Android "Add to home screen" needs 192 and 512).
const SIZES = [192, 512];

export function generateStaticParams() {
  return SIZES.map((size) => ({ size: String(size) }));
}

export async function GET(_request: Request, { params }: { params: Promise<{ size: string }> }) {
  const size = Number((await params).size);
  if (!SIZES.includes(size)) return new Response("Not found", { status: 404 });
  return new ImageResponse(<BrandMark size={size} radius={0} />, { width: size, height: size });
}
