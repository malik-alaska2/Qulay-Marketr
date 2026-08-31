import Link from 'next/link';
import { listItems } from '@/lib/db';
import { ItemCard } from '@/components/ItemCard';

export const dynamic = 'force-dynamic';

const TABS = [
  { value: '', label: 'Всё' },
  { value: 'realty', label: 'Жильё' },
  { value: 'product', label: 'Товары' },
];

export default async function HomePage({
  searchParams,
}: {
  searchParams: Promise<{ kind?: string; q?: string }>;
}) {
  const { kind = '', q = '' } = await searchParams;
  const items = listItems({ kind: kind || undefined, q: q || undefined });

  return (
    <main className="pt-4">
      <h1 className="mb-4 text-2xl font-semibold">Каталог</h1>

      <form className="mb-3">
        <input
          name="q"
          defaultValue={q}
          placeholder="Поиск"
          className="h-11 w-full rounded-lg border border-[var(--line)] bg-[var(--card)] px-3 outline-none"
        />
        {kind ? <input type="hidden" name="kind" value={kind} /> : null}
      </form>

      <div className="mb-4 flex gap-2">
        {TABS.map((tab) => (
          <Link
            key={tab.value}
            href={tab.value ? `/?kind=${tab.value}` : '/'}
            className={`rounded-full border px-4 py-1.5 text-sm ${
              kind === tab.value
                ? 'border-[var(--accent)] text-[var(--accent)]'
                : 'border-[var(--line)] bg-[var(--card)]'
            }`}
          >
            {tab.label}
          </Link>
        ))}
      </div>

      {items.length === 0 ? (
        <p className="py-12 text-center text-[var(--muted)]">
          Пока ничего нет. Добавьте первую позицию в{' '}
          <Link href="/admin" className="text-[var(--accent)]">
            админке
          </Link>
          .
        </p>
      ) : (
        <div className="flex flex-col gap-2">
          {items.map((item) => (
            <ItemCard key={item.id} item={item} />
          ))}
        </div>
      )}
    </main>
  );
}
