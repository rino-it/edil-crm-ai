'use client'

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { Badge } from "@/components/ui/badge";
import { motion } from 'framer-motion';

export default function ScadenzeNav({ badgeDaSmistare }: { badgeDaSmistare: number }) {
  const pathname = usePathname();

  const tabs = [
    { name: 'Da Pagare', href: '/scadenze/da-pagare' },
    { name: 'Da Incassare', href: '/scadenze/da-incassare' },
    { name: 'Scadute', href: '/scadenze/scadute' },
    { name: 'Da Smistare', href: '/scadenze/da-smistare', badge: badgeDaSmistare },
    { name: 'Pagate (Archivio)', href: '/scadenze/pagate' },
  ];

  const activeIndex = tabs.findIndex(tab => pathname === tab.href);

  return (
    <div className="relative flex space-x-1 border-b border-border/40 mb-6 overflow-x-auto">
      {tabs.map((tab, index) => {
        const isActive = pathname === tab.href;
        return (
          <Link
            key={tab.name}
            href={tab.href}
            className={`
              relative flex items-center gap-2 px-4 py-3 text-sm font-medium transition-colors whitespace-nowrap z-10
              ${isActive 
                ? 'text-blue-600' 
                : 'text-muted-foreground hover:text-foreground'}
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
      {/* Animated bottom border indicator */}
      {activeIndex !== -1 && (
        <motion.div
          layoutId="activeTab"
          className="absolute bottom-0 h-0.5 bg-blue-600"
          initial={false}
          transition={{ type: 'spring', stiffness: 300, damping: 30 }}
          style={{
            left: `${(100 / tabs.length) * activeIndex}%`,
            width: `${100 / tabs.length}%`,
          }}
        />
      )}
    </div>
  );
}