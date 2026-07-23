import { useEffect, useMemo, useRef, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { modalPop, useReducedMotionSafe } from "../motion";

export type CommandItem = {
  id: string;
  label: string;
  group?: string;
  index?: string;
  keywords?: string;
  onSelect: () => void;
};

/**
 * ⌘K command palette for jumping between Studio views. Opening/closing is owned
 * by the parent (which registers the global shortcut); this handles search,
 * keyboard navigation, and the glass presentation.
 */
export function CommandPalette({
  open,
  onClose,
  items,
}: {
  open: boolean;
  onClose: () => void;
  items: CommandItem[];
}) {
  const [query, setQuery] = useState("");
  const [active, setActive] = useState(0);
  const inputRef = useRef<HTMLInputElement | null>(null);
  const { variants } = useReducedMotionSafe();

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return items;
    return items.filter((item) =>
      `${item.label} ${item.group ?? ""} ${item.keywords ?? ""}`.toLowerCase().includes(q),
    );
  }, [items, query]);

  useEffect(() => {
    if (open) {
      setQuery("");
      setActive(0);
      const id = window.setTimeout(() => inputRef.current?.focus(), 20);
      return () => window.clearTimeout(id);
    }
  }, [open]);

  useEffect(() => {
    setActive(0);
  }, [query]);

  function choose(item: CommandItem | undefined) {
    if (!item) return;
    item.onSelect();
    onClose();
  }

  return (
    <AnimatePresence>
      {open && (
        <motion.div
          className="studio-cmdk-layer"
          role="presentation"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.14 }}
          onMouseDown={(event) => {
            if (event.target === event.currentTarget) onClose();
          }}
        >
          <motion.div
            className="studio-cmdk"
            role="dialog"
            aria-modal="true"
            aria-label="Command palette"
            variants={variants(modalPop)}
            initial="hidden"
            animate="show"
            exit="exit"
            onKeyDown={(event) => {
              if (event.key === "Escape") {
                onClose();
              } else if (event.key === "ArrowDown") {
                event.preventDefault();
                setActive((value) => Math.min(value + 1, filtered.length - 1));
              } else if (event.key === "ArrowUp") {
                event.preventDefault();
                setActive((value) => Math.max(value - 1, 0));
              } else if (event.key === "Enter") {
                event.preventDefault();
                choose(filtered[active]);
              }
            }}
          >
            <div className="studio-cmdk__search">
              <span className="studio-cmdk__mark" aria-hidden="true" />
              <input
                ref={inputRef}
                value={query}
                onChange={(event) => setQuery(event.target.value)}
                placeholder="Jump to a view…"
                aria-label="Search views"
              />
              <kbd>esc</kbd>
            </div>
            <div className="studio-cmdk__list" role="listbox">
              {filtered.length === 0 && <p className="studio-cmdk__empty">No matches</p>}
              {filtered.map((item, index) => (
                <button
                  type="button"
                  key={item.id}
                  role="option"
                  aria-selected={index === active}
                  className={index === active ? "is-active" : ""}
                  onMouseMove={() => setActive(index)}
                  onClick={() => choose(item)}
                >
                  {item.index && <small>{item.index}</small>}
                  <span>{item.label}</span>
                  {item.group && <em>{item.group}</em>}
                </button>
              ))}
            </div>
            <div className="studio-cmdk__hint">
              <span><kbd>↑</kbd><kbd>↓</kbd> navigate</span>
              <span><kbd>↵</kbd> open</span>
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
