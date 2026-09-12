import type { Metadata, Viewport } from "next";
import { SpeedInsights } from "@vercel/speed-insights/next";
import { AuthProvider } from "@/contexts/AuthContext";
import { ThemeProvider } from "@/contexts/ThemeContext";
import Chatbot from "@/components/Chatbot";
import "./globals.css";

export const viewport: Viewport = {
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#124B91" },
    { media: "(prefers-color-scheme: dark)", color: "#101E2A" },
  ],
  width: "device-width",
  initialScale: 1,
};

export const metadata: Metadata = {
  title: "KNUPICK | 당신을 위한 공지, 여기서 PICK",
  description: "공주대학교 학생을 위한 공모전·장학금·대외활동 기회 모음",
  keywords: ["공주대학교", "대회", "대외활동", "공모전", "서포터즈", "취업"],
  manifest: "/manifest.json",
  appleWebApp: {
    capable: true,
    statusBarStyle: "default",
    title: "KNUPICK",
  },
  formatDetection: {
    telephone: false,
  },
  openGraph: {
    title: "KNUPICK | 당신을 위한 공지, 여기서 PICK",
    description: "공주대학교 학생을 위한 공모전·장학금·대외활동 기회 모음",
    type: "website",
  },
  icons: {
    icon: [
      { url: "/favicon.png", sizes: "32x32", type: "image/png" },
      { url: "/icons/icon-192.png", sizes: "192x192", type: "image/png" },
      { url: "/icons/icon-512.png", sizes: "512x512", type: "image/png" },
    ],
    apple: [
      { url: "/icons/apple-touch-icon.png", sizes: "180x180", type: "image/png" },
    ],
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="ko" suppressHydrationWarning>
      <body className="antialiased min-h-screen">
        <ThemeProvider>
          <AuthProvider>
            {children}
            <Chatbot />
          </AuthProvider>
        </ThemeProvider>
        <SpeedInsights />
      </body>
    </html>
  );
}
