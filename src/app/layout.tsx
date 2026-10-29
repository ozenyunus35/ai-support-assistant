import type { Metadata, Viewport } from "next";
import { Inter, JetBrains_Mono } from "next/font/google";
import { ToastProvider } from "@/components/toast";
import "./globals.css";

const inter = Inter({ variable: "--font-inter", subsets: ["latin"] });
const jetbrainsMono = JetBrains_Mono({ variable: "--font-jetbrains-mono", subsets: ["latin"] });

export const metadata: Metadata = {
  title: { default: "Relay: AI support assistant demo", template: "%s · Relay" },
  description: "Demo AI customer-support assistant: a website chat widget that answers from a help center with sources, hands off to people when unsure, and an admin console. Runs entirely in the browser.",
};

export const viewport: Viewport = {
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#fbfbfc" },
    { media: "(prefers-color-scheme: dark)", color: "#0c0d0f" },
  ],
};

// Applies the saved theme before first paint to avoid a flash. Dark is the default.
const THEME_SCRIPT = `try{var t=localStorage.getItem("relay:theme");if(t!=="light")document.documentElement.classList.add("dark")}catch(e){}`;

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={`${inter.variable} ${jetbrainsMono.variable} h-full antialiased`} suppressHydrationWarning>
      <head>
        <script dangerouslySetInnerHTML={{ __html: THEME_SCRIPT }} />
      </head>
      <body className="min-h-full font-sans text-[13px] leading-5">
        <ToastProvider>{children}</ToastProvider>
      </body>
    </html>
  );
}
