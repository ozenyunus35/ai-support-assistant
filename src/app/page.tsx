import { HelpCenter } from "@/components/help-center";
import { LangProvider } from "@/lib/i18n";

// The store's help center and the assistant are in English; only the admin console has a Turkish version.
export default function Page() {
  return (
    <LangProvider fixed="en">
      <HelpCenter />
    </LangProvider>
  );
}
