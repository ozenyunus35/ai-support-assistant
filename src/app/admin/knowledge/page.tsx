import type { Metadata } from "next";
import { Suspense } from "react";
import { KnowledgeBase } from "@/components/admin/knowledge";
import { Spinner } from "@/components/ui";

export const metadata: Metadata = { title: "Knowledge base" };

export default function Page() {
  return (
    <Suspense fallback={<Spinner />}>
      <KnowledgeBase />
    </Suspense>
  );
}
