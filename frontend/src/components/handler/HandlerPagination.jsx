import React from 'react';
import { ChevronLeft, ChevronRight } from 'lucide-react';

export function HandlerPagination({
  currentPage = 1,
  pageSize = 5,
  totalItems = 0,
  onPageChange,
  onPageSizeChange,
  pageSizeOptions = [5, 10, 20, 50],
}) {
  const totalPages = Math.max(1, Math.ceil(totalItems / pageSize));
  const safeCurrentPage = Math.min(Math.max(1, currentPage), totalPages);

  const startRecord = totalItems === 0 ? 0 : (safeCurrentPage - 1) * pageSize + 1;
  const endRecord = Math.min(safeCurrentPage * pageSize, totalItems);

  // Generate page numbers
  const getPageNumbers = () => {
    const pages = [];
    if (totalPages <= 6) {
      for (let i = 1; i <= totalPages; i++) pages.push(i);
    } else {
      pages.push(1);
      if (safeCurrentPage > 3) pages.push('...');
      const start = Math.max(2, safeCurrentPage - 1);
      const end = Math.min(totalPages - 1, safeCurrentPage + 1);
      for (let i = start; i <= end; i++) {
        if (!pages.includes(i)) pages.push(i);
      }
      if (safeCurrentPage < totalPages - 2) pages.push('...');
      if (!pages.includes(totalPages)) pages.push(totalPages);
    }
    return pages;
  };

  return (
    <div className="hd-pagination-row">
      <div className="hd-pagination-left">
        <span className="hd-pagination-info">
          Showing {startRecord}-{endRecord} of {totalItems}
        </span>
        {onPageSizeChange && (
          <div className="hd-page-size-selector">
            <span className="hd-page-size-label">Rows per page:</span>
            <select
              className="hd-page-size-select"
              value={pageSize}
              onChange={(e) => {
                const nextSize = Number(e.target.value);
                if (onPageSizeChange) onPageSizeChange(nextSize);
              }}
            >
              {pageSizeOptions.map((opt) => (
                <option key={opt} value={opt}>
                  {opt}
                </option>
              ))}
            </select>
          </div>
        )}
      </div>

      <div className="hd-pagination-controls">
        <button
          type="button"
          className="hd-page-nav-btn"
          disabled={safeCurrentPage <= 1}
          onClick={() => onPageChange && onPageChange(safeCurrentPage - 1)}
          title="Previous page"
        >
          <ChevronLeft size={16} />
        </button>

        {getPageNumbers().map((p, idx) => {
          if (p === '...') {
            return (
              <span key={`ellipsis-${idx}`} className="hd-pagination-ellipsis">
                ...
              </span>
            );
          }
          return (
            <button
              key={p}
              type="button"
              className={`hd-page-num-btn ${safeCurrentPage === p ? 'active' : ''}`}
              onClick={() => onPageChange && onPageChange(p)}
            >
              {p}
            </button>
          );
        })}

        <button
          type="button"
          className="hd-page-nav-btn"
          disabled={safeCurrentPage >= totalPages}
          onClick={() => onPageChange && onPageChange(safeCurrentPage + 1)}
          title="Next page"
        >
          <ChevronRight size={16} />
        </button>
      </div>
    </div>
  );
}

export default HandlerPagination;

