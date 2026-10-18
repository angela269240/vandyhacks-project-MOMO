import type { Metadata, Viewport } from "next";
import { Inter, Space_Grotesk } from "next/font/google";
import { Ambient } from "@/components/ambient/Ambient";
import { Providers } from "@/components/Providers";
import { themeBootScript } from "@/hooks/useTheme";
import "./globals.css";

const inter = Inter({ variable: "--font-inter", subsets: ["latin"] });
const grotesk = Space_Grotesk({ variable: "--font-grotesk", subsets: ["latin"] });

export const metadata: Metadata = {
  title: "Social Mapper",
  description: "Redefining social media, for learning. Find your people in live interest groups.",
};

export const viewport: Viewport = {
  themeColor: "#1f1e1c",
  colorScheme: "dark light",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="en" className={`dark ${inter.variable} ${grotesk.variable} antialiased`} suppressHydrationWarning>
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
