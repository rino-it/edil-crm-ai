"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { HardHat, Users, FileText, Building2, CalendarCheck } from "lucide-react";

const links = [
  { href: "/cantieri", label: "Cantieri", icon: HardHat },
  { href: "/personale", label: "Personale", icon: Users },
  { href: "/preventivi", label: "Preventivi", icon: FileText },
  { href: "/anagrafiche", label: "Anagrafiche", icon: Building2 },
  { href: "/scadenze", label: "Scadenze", icon: CalendarCheck },
];

export default function Sidebar() {
  const pathname = usePathname();

  return (
    <aside className="w-56 min-h-screen bg-gray-900 text-white flex flex-col py-6 px-3 shrink-0">
      <div className="mb-8 px-3">
        <span className="text-xl font-bold tracking-tight">Edil CRM</span>
      </div>
      <nav className="flex flex-col gap-1">
        {links.map(({ href, label, icon: Icon }) => {
          const active = pathname === href || pathname.startsWith(href + "/");
          return (
            <Link
              key={href}
              href={href}
              className={`flex items-center gap-3 px-3 py-2 rounded-lg text-sm font-medium transition-colors ${
                active
                  ? "bg-blue-600 text-white"
                  : "text-gray-300 hover:bg-gray-700 hover:text-white"
              }`}
            >
              <Icon size={18} />
              {label}
            </Link>
          );
        })}
      </nav>
    </aside>
  );
}