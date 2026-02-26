'use client'

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { Badge } from "@/components/ui/badge";
import { Archive, ArrowDownToLine, ArrowUpFromLine, CircleAlert, Inbox } from 'lucide-react';

export default function ScadenzeNav({ badgeDaSmistare }: { badgeDaSmistare: number }) {
  const pathname = usePathname();

  const tabs = [
    { label: 'Da Pagare', href: '/scadenze/da-pagare', icon: ArrowDownToLine },
    { label: 'Da Incassare', href: '/scadenze/da-incassare', icon: ArrowUpFromLine },
    { label: 'Scadute', href: '/scadenze/scadute', icon: CircleAlert },
    { label: 'Da Smistare', href: '/scadenze/da-smistare', icon: Inbox, badge: badgeDaSmistare },
    { label: 'Pagate (Archivio)', href: '/scadenze/pagate', icon: Archive },
  ];

  return (
    <nav className="flex gap-6 border-b border-border/50">
      {tabs.map((tab) => {
        const isActive = pathname === tab.href;
        const Icon = tab.icon;
        return (
          <Link 
            key={tab.href} 
            href={tab.href}
            className={`relative pb-3 text-sm font-medium transition-colors ${
              isActive ? 'text-blue-600' : 'text-zinc-500 hover:text-zinc-800'
            }`}
          >
            <div className="flex items-center gap-2">
              <Icon size={16} />
              {tab.label}
              {tab.badge !== undefined && tab.badge > 0 && (
                <Badge variant={isActive ? "default" : "secondary"} className="ml-1 px-1.5 py-0 text-xs">
                  {tab.badge}
                </Badge>
              )}
            </div>
            
            {isActive && (
              <div className="absolute left-0 right-0 bottom-0 h-[3px] bg-blue-600 rounded-t-full" />
            )}
          </Link>
        )
      })}
    </nav>
  );
}