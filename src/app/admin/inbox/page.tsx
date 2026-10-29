import type { Metadata } from "next";
import { Suspense } from "react";
import { Inbox } from "@/components/admin/inbox";
import { Spinner } from "@/components/ui";

export const metadata: Metadata = { title: "Inbox" };

export default function Page() {
  return (
    <Suspense fallback={<Spinner />}>
      <Inbox />
    </Suspense>
  );
}
