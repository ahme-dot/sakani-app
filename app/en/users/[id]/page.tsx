import PublicProfileRoute from "@/components/public-profile-route";

export const metadata = { robots: { index: false } };

export default function EnglishPublicProfilePage({ params }: { params: Promise<{ id: string }> }) {
  return <PublicProfileRoute locale="en" params={params} />;
}
