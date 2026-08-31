import Link from 'next/link';
import { notFound } from 'next/navigation';
import { getItem, images, priceText } from '@/lib/db';

export const dynamic = 'force-dynamic';

export async function generateMetadata({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const item = getItem(Number(id));
  return item ? { title: `${item.title} — ${priceText(item.price)}` } : { title: 'Не найдено' };
}

export default async function ItemPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const item = getItem(Number(id));
  if (!item || item.hidden) notFound();

  const photos = images(item);
  const contact = (process.env.CONTACT_TELEGRAM ?? '').replace(/^@/, '');
  const specs = [
    item.category ? { label: 'Категория', value: item.category } : null,
    item.district ? { label: 'Район', value: item.district } : null,
    item.rooms ? { label: 'Комнаты', value: item.rooms } : null,
    item.area ? { label: 'Площадь', value: `${item.area} м²` } : null,
    item.floor ? { label: 'Этаж', value: item.floor } : null,
    item.kind === 'realty' ? { label: 'Мебель', value: item.furnished ? 'Есть' : 'Нет' } : null,
  ].filter(Boolean) as Array<{ label: string; value: string }>;

  return (
    <main className="pt-4">
      <Link href="/" className="text-sm text-[var(--muted)]">
        ← Назад
      </Link>

      {photos.length > 0 ? (
        <div className="mt-3 flex gap-2 overflow-x-auto">
          {photos.map((photo) => (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              key={photo}
              src={`/uploads/${photo}`}
              alt={item.title}
              className="h-64 w-auto rounded-xl object-cover"
            />
          ))}
        </div>
      ) : null}

      <h1 className="mt-4 text-2xl font-semibold">{item.title}</h1>
      <div className="mt-1 text-xl font-semibold">
        {priceText(item.price)}
        {item.kind === 'realty' ? <span className="text-base font-normal text-[var(--muted)]">/мес</span> : null}
      </div>

      {specs.length > 0 ? (
        <dl className="mt-4 divide-y divide-[var(--line)] rounded-xl border border-[var(--line)] bg-[var(--card)] px-3">
          {specs.map((spec) => (
            <div key={spec.label} className="flex justify-between gap-4 py-2 text-sm">
              <dt className="text-[var(--muted)]">{spec.label}</dt>
              <dd>{spec.value}</dd>
            </div>
          ))}
        </dl>
      ) : null}

      {item.description ? (
        <p className="mt-4 whitespace-pre-line leading-6">{item.description}</p>
      ) : null}

      {contact ? (
        <a
          href={`https://t.me/${contact}?text=${encodeURIComponent(`Здравствуйте, интересует «${item.title}» (№${item.id})`)}`}
          target="_blank"
          rel="noopener"
          className="mt-6 block rounded-lg bg-[var(--accent)] py-3 text-center font-medium text-white"
        >
          Написать в Telegram
        </a>
      ) : null}
    </main>
  );
}
