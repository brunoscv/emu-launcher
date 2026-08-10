interface Props {
  page: number; // 1-based
  pageCount: number;
  onPageChange: (page: number) => void;
}

/** Só anterior/próxima + "página X de Y" — nada de renderizar um botão por página. */
export function Pagination({ page, pageCount, onPageChange }: Props) {
  if (pageCount <= 1) return null;

  return (
    <div className="pagination">
      <button
        className="pagination__btn"
        onClick={() => onPageChange(page - 1)}
        disabled={page <= 1}
      >
        ‹ Anterior
      </button>
      <span className="pagination__status">
        Página {page} de {pageCount}
      </span>
      <button
        className="pagination__btn"
        onClick={() => onPageChange(page + 1)}
        disabled={page >= pageCount}
      >
        Próxima ›
      </button>

      <style>{`
        .pagination {
          display: flex;
          align-items: center;
          justify-content: center;
          gap: 1rem;
          padding: 0.75rem;
          border-top: 1px solid var(--border-soft);
        }

        .pagination__btn {
          background: var(--bg-panel);
          border: 1px solid var(--border-soft);
          border-radius: var(--radius-sm);
          color: var(--ink-primary);
          padding: 0.4rem 0.8rem;
          font-size: 0.8rem;
        }

        .pagination__btn:disabled {
          opacity: 0.4;
          cursor: not-allowed;
        }

        .pagination__status {
          font-family: var(--font-mono);
          font-size: 0.8rem;
          color: var(--ink-muted);
        }
      `}</style>
    </div>
  );
}
