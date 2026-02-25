import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";
import { Sidebar } from "@/components/Sidebar";
import NavbarMobile from "@/components/NavbarMobile";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "Edil CRM",
  description: "Gestione cantieri, personale e preventivi",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="it">
      <body
        className={`${geistSans.variable} ${geistMono.variable} antialiased flex min-h-screen bg-gray-50`}
      >
        {/* SIDEBAR: Visibile solo da tablet in su (md:flex) */}
        <div className="hidden md:flex">
          <Sidebar />
        </div>

        {/* CONTENITORE PRINCIPALE: flex-col per gestire la navbar in basso su mobile */}
        <div className="flex-1 flex flex-col min-w-0">
          
          {/* MAIN CONTENT: p-4 su mobile per risparmiare spazio, pb-24 per non finire sotto la navbar */}
          <main className="flex-1 overflow-auto p-4 md:p-8 pb-24 md:pb-8">
            {children}
          </main>

          {/* NAVBAR MOBILE: Visibile solo su mobile (md:hidden) */}
          <div className="md:hidden">
            <NavbarMobile />
          </div>
          
        </div>
      </body>
    </html>
  );
}