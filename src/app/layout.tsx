import type { Metadata } from "next";
import { Geist, Geist_Mono, Noto_Sans_JP } from "next/font/google";
import "./globals.css";
import { Toaster } from "@/components/ui/toaster";
import { LangProvider } from "@/lib/i18n";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

// Japanese font for BMS chart metadata (titles, artists, notemakers).
// The BMS ecosystem is Japanese-centric, and Han unification means CJK
// ideographs can render with wrong-language glyphs if the font fallback
// picks Korean/Chinese. Pinning a Japanese font for chart-name display
// ensures correct glyph shapes regardless of the selected UI language.
const notoSansJP = Noto_Sans_JP({
  variable: "--font-noto-sans-jp",
  subsets: ["latin"],
  weight: ["400", "500", "700"],
});

export const metadata: Metadata = {
  title: "QUEstimator · 6K U_E Scale Difficulty Estimator",
  description:
    "Data-driven difficulty estimation for 6-key charts on the U_E scale in Qwilight. Powered by Item Response Theory (Graded Response Model).",
  keywords: [
    "Qwilight",
    "U_E",
    "IRT",
    "Graded Response Model",
    "rhythm game",
    "difficulty estimation",
    "6K",
  ],
  authors: [{ name: "QUEstimator Project" }],
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="ko" className="dark" suppressHydrationWarning>
      <body
        className={`${geistSans.variable} ${geistMono.variable} ${notoSansJP.variable} antialiased bg-background text-foreground min-h-screen`}
      >
        <LangProvider>{children}</LangProvider>
        <Toaster />
      </body>
    </html>
  );
}
