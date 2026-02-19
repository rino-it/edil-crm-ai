"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { LayoutDashboard, Users, FileSpreadsheet, LogOut, HardHat } from "lucide-react";
import { logout } from "@/app/(auth)/actions";

const NAV_LINKS = [
  { href: "/cantieri", label: "Dashboard Cantieri", icon: LayoutDashboard },
  { href: "/personale", label: "Gestione Personale", icon: Users },
  { href: "/preventivi", label: "Preventivazione", icon: FileSpreadsheet },
];

export default function Sidebar() {
  const pathname = usePathname();

  return (
    <aside className="fixed top-0 left-0 h-screen w-56 bg-zinc-900 flex flex-col z-40">
      {/* Logo */}
      <div className="flex items-center gap-2.5 px-5 py-5 border-b border-zinc-800">
        <div className="flex items-center justify-center h-8 w-8 rounded-lg bg-blue-600">
          <HardHat className="h-5 w-5 text-white" />
        </div>
        <span className="text-white font-bold tracking-tight text-sm">EdilCRM AI</span>
      </div>

      {/* Nav */}
      <nav className="flex-1 px-3 py-4 space-y-1">
        {NAV_LINKS.map(({ href, label, icon: Icon }) => {
          const isActive = pathname === href || pathname.startsWith(href + "/");
          return (
            <Link
              key={href}
              href={href}
              className={`flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-colors ${
                isActive
                  ? "bg-blue-600 text-white"
                  : "text-zinc-400 hover:bg-zinc-800 hover:text-white"
              }`}
            >
              <Icon className="h-4 w-4 flex-shrink-0" />
              {label}
            </Link>
          );
        })}
      </nav>

      {/* Logout */}
      <div className="px-3 py-4 border-t border-zinc-800">
        <form action={logout}>
          <button
            type="submit"
            className="w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium text-zinc-400 hover:bg-zinc-800 hover:text-white transition-colors"
          >
            <LogOut className="h-4 w-4 flex-shrink-0" />
            Esci
          </button>
        </form>
      </div>
    </aside>
  );
}
