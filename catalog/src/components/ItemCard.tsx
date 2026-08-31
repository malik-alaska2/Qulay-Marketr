import Link from 'next/link';
import { images, priceText, type Item } from '@/lib/db';

export function ItemCard({ item }: { item: Item }) {
  const [cover] = images(item);
  const specs = [item.rooms, item.area ? `${item.area} м²` : null, item.floor, item.district]
    .filter(Boolean)
    .join(' · ');

  return (
    <Link
      href={`/item/${item.id}`}
      className="flex gap-3 rounded-xl border border-[var(--line)] bg-[var(--card)] p-3"
    >
      <div className="size-24 shrink-0 overflow-hidden rounded-lg bg-[var(--bg)]">
        {cover ? (
          // Обычный img: не нужен ни оптимизатор, ни настройка доменов
          // eslint-disable-next-line @next/next/no-img-element
          <img src={`/uploads/${cover}`} alt={item.title} className="size-full object-cover" />
        ) : null}
      </div>

      <div className="min-w-0 flex-1">
        <div className="font-semibold">{priceText(item.price)}
          {item.kind === 'realty' ? <span className="text-sm font-normal text-[var(--muted)]">/мес</span> : null}
        </div>
        <div className="mt-0.5 line-clamp-2 text-sm">{item.title}</div>
        {specs ? <div className="mt-1 text-xs text-[var(--muted)]">{specs}</div> : null}
      </div>
    </Link>
  );
}
