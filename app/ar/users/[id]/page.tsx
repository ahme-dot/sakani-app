import PublicProfileRoute from "@/components/public-profile-route";

export const metadata = { robots: { index: false } };

export default function ArabicPublicProfilePage({ params }: { params: Promise<{ id: string }> }) {
  return <PublicProfileRoute locale="ar" params={params} />;
}
