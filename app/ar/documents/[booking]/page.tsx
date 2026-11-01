import { DocumentsRoute } from "@/components/documents-route";
import { PRIVATE_PAGE_METADATA } from "@/lib/metadata";

export const metadata = PRIVATE_PAGE_METADATA;

export default function ArabicDocumentsPage({ params, searchParams }: { params: Promise<{ booking: string }>; searchParams: Promise<{ doc?: string }> }) {
  return <DocumentsRoute locale="ar" params={params} searchParams={searchParams} />;
}
