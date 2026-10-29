import type { Metadata } from "next";
import { Playground } from "@/components/admin/playground";

export const metadata: Metadata = { title: "Answer playground" };

export default function Page() {
  return <Playground />;
}
