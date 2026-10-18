import type { Metadata, Viewport } from "next";
import { Sora } from "next/font/google";
import { Ambient } from "@/components/ambient/Ambient";
import { Providers } from "@/components/Providers";
import { themeBootScript } from "@/hooks/useTheme";
import "./globals.css";

/** One typeface for the whole site: UI text, headings and the map canvas all read --font-sora. */
const sora = Sora({ variable: "--font-sora", subsets: ["latin"], display: "swap" });

export const metadata: Metadata = {
  title: "Orbit",
  description: "Redefining social media, for learning. Find your people in live interest groups.",
};

export const viewport: Viewport = {
  themeColor: [
    { media: "(prefers-color-scheme: dark)", color: "#1f1e1c" },
    { media: "(prefers-color-scheme: light)", color: "#f4eee3" },
  ],
  colorScheme: "dark light",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="en" className={`dark ${sora.variable} antialiased`} suppressHydrationWarning>
      <head>
        <script dangerouslySetInnerHTML={{ __html: themeBootScript }} />
      </head>
      <body>
        <Ambient />
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}
