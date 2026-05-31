import type { Metadata } from "next";
import { Cinzel, Noto_Sans_KR } from "next/font/google";
import "./globals.css";

const cinzel = Cinzel({
  variable: "--font-display",
  subsets: ["latin"],
  weight: ["600", "700", "800"],
});

const notoSansKr = Noto_Sans_KR({
  variable: "--font-sans",
  subsets: ["latin"],
  weight: ["400", "500", "600", "700", "800"],
});

export const metadata: Metadata = {
  title: "Riftbound Price Compare",
  description: "Unofficial Korean Riftbound TCG price comparison, collection, and guide prototype.",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="ko" className={`${cinzel.variable} ${notoSansKr.variable}`}>
      <body>{children}</body>
    </html>
  );
}
