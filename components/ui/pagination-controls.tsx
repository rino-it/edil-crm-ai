'use client'

import { useRouter, useSearchParams, usePathname } from 'next/navigation';
import { Button } from "@/components/ui/button";
import { ChevronLeft, ChevronRight, ChevronsLeft, ChevronsRight } from "lucide-react";
import { PAGE_SIZE_OPTIONS } from '@/types/pagination';

interface PaginationControlsProps {
  totalCount: number;
  currentPage: number;
  pageSize: number;
  totalPages: number;
}

export function PaginationControls({ totalCount, currentPage, pageSize, totalPages }: PaginationControlsProps) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();

  const createPageURL = (pageNumber: number | string, size: number) => {
    const params = new URLSearchParams(searchParams.toString());
    params.set('page', pageNumber.toString());
    params.set('pageSize', size.toString());
    return `${pathname}?${params.toString()}`;
  };

  const handlePageChange = (newPage: number) => {
    router.push(createPageURL(newPage, pageSize));
  };

  const handlePageSizeChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
    const newSize = Number(e.target.value);
    // Quando si cambia il pageSize, resettiamo alla pagina 1
    router.push(createPageURL(1, newSize));
  };

  if (totalCount === 0) return null;

  return (
    <div className="flex flex-col sm:flex-row items-center justify-between gap-4 px-2 py-4 text-sm text-zinc-500">
      <div className="flex items-center gap-2">
        <span>Mostra</span>
        <select
          value={pageSize}
          onChange={handlePageSizeChange}
          className="h-8 rounded-md border border-zinc-200 bg-white px-2 py-1 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
        >
          {PAGE_SIZE_OPTIONS.map(size => (
            <option key={size} value={size}>{size}</option>
          ))}
        </select>
        <span>righe per pagina</span>
      </div>

      <div className="flex items-center gap-4">
        <span>
          Pagina <span className="font-medium text-zinc-900">{currentPage}</span> di <span className="font-medium text-zinc-900">{totalPages}</span> 
          <span className="hidden sm:inline"> ({totalCount} righe totali)</span>
        </span>
        
        <div className="flex items-center gap-1">
          <Button
            variant="outline"
            className="h-8 w-8 p-0"
            onClick={() => handlePageChange(1)}
            disabled={currentPage <= 1}
            title="Prima pagina"
          >
            <span className="sr-only">Prima pagina</span>
            <ChevronsLeft className="h-4 w-4" />
          </Button>
          <Button
            variant="outline"
            className="h-8 w-8 p-0"
            onClick={() => handlePageChange(currentPage - 1)}
            disabled={currentPage <= 1}
            title="Pagina precedente"
          >
            <span className="sr-only">Pagina precedente</span>
            <ChevronLeft className="h-4 w-4" />
          </Button>
          <Button
            variant="outline"
            className="h-8 w-8 p-0"
            onClick={() => handlePageChange(currentPage + 1)}
            disabled={currentPage >= totalPages}
            title="Pagina successiva"
          >
            <span className="sr-only">Pagina successiva</span>
            <ChevronRight className="h-4 w-4" />
          </Button>
          <Button
            variant="outline"
            className="h-8 w-8 p-0"
            onClick={() => handlePageChange(totalPages)}
            disabled={currentPage >= totalPages}
            title="Ultima pagina"
          >
            <span className="sr-only">Ultima pagina</span>
            <ChevronsRight className="h-4 w-4" />
          </Button>
        </div>
      </div>
    </div>
  );
}