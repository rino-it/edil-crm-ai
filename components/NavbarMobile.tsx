// components/NavbarMobile.tsx
"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { HardHat, CalendarCheck, TrendingUp, Menu } from "lucide-react";

export default function NavbarMobile() {
  const pathname = usePathname();
  const navLinks = [
    { href: "/cantieri", icon: HardHat, label: "Cantieri" },
    { href: "/scadenze", icon: CalendarCheck, label: "Scadenze" },
    { href: "/finanza", icon: TrendingUp, label: "Finanza" },
  ];

  return (
    <nav className="md:hidden fixed bottom-0 left-0 right-0 bg-gray-900 border-t border-gray-800 px-6 py-3 flex justify-between items-center z-50">
      {navLinks.map(({ href, icon: Icon, label }) => (
        <Link key={href} href={href} className={`flex flex-col items-center gap-1 ${pathname.startsWith(href) ? 'text-blue-500' : 'text-gray-400'}`}>
          <Icon size={20} />
          <span className="text-[10px]">{label}</span>
        </Link>
      ))}
      <button className="text-gray-400 flex flex-col items-center gap-1">
        <Menu size={20} />
        <span className="text-[10px]">Altro</span>
      </button>
    </nav>
  );
}