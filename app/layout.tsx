import type { Metadata } from "next";
import "./globals.css";
import { createClient } from "@/utils/supabase/server";
import { headers } from "next/headers";
import Sidebar from "@/components/Sidebar";

export const metadata: Metadata = {
  title: "EdilCRM AI",
  description: "Gestione cantieri, personale e preventivi",
};

export default async function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  // Legge il pathname dagli headers per nascondere la nav su /login
  const headersList = await headers();
  const pathname = headersList.get("x-pathname") || "";
  const isAuthPage =
    pathname.startsWith("/login") || pathname.startsWith("/auth");

  const showSidebar = !!user && !isAuthPage;

  return (
    <html lang="it">
      <body className="font-sans antialiased bg-zinc-50">
        {showSidebar && <Sidebar />}
        <main className={showSidebar ? "ml-56 min-h-screen" : "min-h-screen"}>
          {children}
        </main>
      </body>
    </html>
  );
}
