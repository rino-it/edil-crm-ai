'use client'

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { Badge } from "@/components/ui/badge";

export default function ScadenzeNav({ badgeDaSmistare }: { badgeDaSmistare: number }) {
  const pathname = usePathname();

  const tabs = [
    { name: 'Da Pagare', href: '/scadenze/da-pagare' },
    { name: 'Da Incassare', href: '/scadenze/da-incassare' },
    { name: 'Scadute', href: '/scadenze/scadute' },
    { name: 'Da Smistare', href: '/scadenze/da-smistare', badge: badgeDaSmistare },
    { name: 'Pagate (Archivio)', href: '/scadenze/pagate' },
  ];

  return (
    <div className="flex space-x-1 border-b border-zinc-200 mb-6 overflow-x-auto">
      {tabs.map((tab) => {
        const isActive = pathname === tab.href;
        return (
          <Link
            key={tab.name}
            href={tab.href}
            className={`
              flex items-center gap-2 px-4 py-3 text-sm font-medium border-b-2 transition-colors whitespace-nowrap
              ${isActive 
                ? 'border-blue-600 text-blue-600' 
                : 'border-transparent text-zinc-500 hover:text-zinc-700 hover:border-zinc-300'}
            `}
          >
            {tab.name}
            {tab.badge !== undefined && tab.badge > 0 && (
              <Badge variant={isActive ? "default" : "secondary"} className="ml-1 px-1.5 py-0 text-xs">
                {tab.badge}
              </Badge>
            )}
          </Link>
        );
      })}
    </div>
  );
}