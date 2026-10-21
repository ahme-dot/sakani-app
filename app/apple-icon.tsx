import { ImageResponse } from "next/og";
import { BrandMark } from "@/components/brand-image";

export const size = { width: 180, height: 180 };
export const contentType = "image/png";

export default function AppleIcon() {
  // iOS rounds the corners itself, so the mark fills the square.
  return new ImageResponse(<BrandMark size={180} radius={0} />, { ...size });
}
