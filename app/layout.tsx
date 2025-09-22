import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
  display: "swap",
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
  display: "swap",
});

export const metadata: Metadata = {
  title: "UGC Studio",
  description:
    "Generate on-brand UGC imagery by combining OpenAI assistants with Gemini image generation.",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" className="bg-slate-100">
      <body
        className={`${geistSans.variable} ${geistMono.variable} antialiased bg-slate-100 text-slate-900`}
      >
        {children}
      </body>
    </html>
  );
}
