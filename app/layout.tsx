import type { Metadata, Viewport } from "next";
import { Inter, Space_Grotesk } from "next/font/google";
import { Ambient } from "@/components/ambient/Ambient";
import { Providers } from "@/components/Providers";
import "./globals.css";

const inter = Inter({ variable: "--font-inter", subsets: ["latin"] });
const grotesk = Space_Grotesk({ variable: "--font-grotesk", subsets: ["latin"] });

export const metadata: Metadata = {
  title: "Orbit",
  description: "Find your people. Explore your campus.",
};

export const viewport: Viewport = {
  themeColor: "#03050c",
  colorScheme: "dark",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="en" className={`dark ${inter.variable} ${grotesk.variable} antialiased`}>
      <body>
        <Ambient />
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}
