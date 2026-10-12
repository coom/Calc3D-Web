import { useState, type ReactNode } from 'react';
import { ChevronDown, ChevronRight } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { monthKey, monthLabel } from '@/lib/dates';

interface Props<T> { items: T[]; dateOf: (item: T) => string; renderItem: (item: T) => ReactNode; countLabel: (n: number) => string }

/** Regroupe des lignes par mois (clé yyyy-MM, plus récent en premier), chaque mois repliable. Même ergonomie que les pages Historique et Achats de l'application bureau. */
export function MonthGroups<T>({ items, dateOf, renderItem, countLabel }: Props<T>) {
  const { i18n } = useTranslation();
  const [collapsed, setCollapsed] = useState<Set<string>>(new Set());
  const groups = new Map<string, T[]>();
  for (const it of items) { const k = monthKey(dateOf(it)); const g = groups.get(k); if (g) g.push(it); else groups.set(k, [it]); }
  const keys = [...groups.keys()].sort((a, b) => (a < b ? 1 : -1));
  const toggle = (k: string) => setCollapsed((s) => { const n = new Set(s); if (n.has(k)) n.delete(k); else n.add(k); return n; });
  return (
    <div className="space-y-3">
      {keys.map((k) => {
        const rows = groups.get(k)!; const open = !collapsed.has(k);
        return (
          <section key={k} className="rounded-md border border-border">
            <button type="button" onClick={() => toggle(k)} aria-expanded={open} className="flex w-full items-center gap-2 bg-muted/30 px-3 py-2 text-left text-sm font-medium">
              {open ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
              <span>{monthLabel(k, i18n.language)}</span>
              <span className="ml-auto text-xs text-muted-foreground">{countLabel(rows.length)}</span>
            </button>
            {open && <div>{rows.map(renderItem)}</div>}
          </section>
        );
      })}
    </div>
  );
}
