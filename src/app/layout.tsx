import type { Metadata } from "next";
import { Geist, Geist_Mono, Playfair_Display } from "next/font/google";
import "./globals.css";
import { Toaster } from "@/components/ui/toaster";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

const playfair = Playfair_Display({
  variable: "--font-playfair",
  subsets: ["latin"],
  weight: ["500", "600", "700", "800"],
});

export const metadata: Metadata = {
  title: "rmaaca.in — Multi-Model AI Peer Review",
  description:
    "Submit a prompt and watch multiple AI agents respond in parallel. A peer-review agent then scores each response and synthesizes the best final answer.",
  keywords: [
    "rmaaca.in",
    "multi-agent AI",
    "peer review",
    "GLM-4.6",
    "AI consensus",
  ],
  authors: [{ name: "rmaaca.in" }],
  icons: {
    icon: "/logo.svg",
  },
  openGraph: {
    title: "rmaaca.in — Multi-Model AI Peer Review",
    description:
      "Multiple AI agents respond in parallel. A peer reviewer scores and synthesizes the best answer.",
    siteName: "rmaaca.in",
    type: "website",
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" suppressHydrationWarning>
      <body
        className={`${geistSans.variable} ${geistMono.variable} ${playfair.variable} antialiased bg-background text-foreground`}
      >
        {children}
        <Toaster />
      </body>
    </html>
  );
}
