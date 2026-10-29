import MessagesPage from "@/components/messages-page";
import { PRIVATE_PAGE_METADATA } from "@/lib/metadata";

export const metadata = PRIVATE_PAGE_METADATA;

type MessagesParams = Promise<{ listing?: string; booking?: string }>;

export default async function EnglishMessagesPage({ searchParams }: { searchParams: MessagesParams }) {
  const { listing, booking } = await searchParams;
  return <MessagesPage locale="en" listingId={listing ?? null} bookingId={booking ?? null} />;
}
