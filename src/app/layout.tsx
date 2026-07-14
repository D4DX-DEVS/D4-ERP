import type { Metadata, Viewport } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import { ToastProvider } from "@/components/ui/toast";
import { PwaRegister } from "@/components/pwa-register";
import { PwaInstallBanner } from "@/components/pwa-install-banner";
import "./globals.css";

const appIcon = "/favicon.svg";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  maximumScale: 1,
  userScalable: false,
};

export const metadata: Metadata = {
  title: "D4 Media ERP",
  description: "D4 Media - Enterprise Resource Planning System",
  icons: {
    icon: [{ url: appIcon, type: "image/png", sizes: "512x512" }],
    shortcut: appIcon,
    apple: appIcon,
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="en"
      data-scroll-behavior="smooth"
      className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`}
    >
      <body className="min-h-full flex flex-col" suppressHydrationWarning>
        <PwaRegister />
        <PwaInstallBanner />
        <ToastProvider>{children}</ToastProvider>
      </body>
    </html>
  );
}
