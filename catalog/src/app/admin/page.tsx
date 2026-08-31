import Link from 'next/link';
import { listItems, priceText } from '@/lib/db';
import { isLoggedIn } from '@/lib/auth';
import { login, logout, toggleHidden } from './actions';

export const dynamic = 'force-dynamic';

export default async function AdminPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string }>;
}) {
  const { error } = await searchParams;

  if (!(await isLoggedIn())) {
    return (
      <main className="pt-16">
        <h1 className="mb-4 text-xl font-semibold">Вход</h1>
        <form action={login} className="flex flex-col gap-3">
          <input
            type="password"
            name="password"
            placeholder="Пароль"
            autoFocus
            className="h-12 rounded-lg border border-[var(--line)] bg-[var(--card)] px-3 outline-none"
          />
          {error ? <p className="text-sm text-red-600">Неверный пароль</p> : null}
          <button className="h-12 rounded-lg bg-[var(--accent)] font-medium text-white">Войти</button>
        </form>
      </main>
    );
  }

  const items = listItems({ includeHidden: true });

  return (
    <main className="pt-4">
      <div className="mb-4 flex items-center justify-between">
        <h1 className="text-xl font-semibold">Админка</h1>
        <div className="flex items-center gap-3">
          <Link href="/admin/new" className="rounded-lg bg-[var(--accent)] px-4 py-2 text-sm text-white">
            Добавить
          </Link>
          <form action={logout}>
            <button className="text-sm text-[var(--muted)]">Выйти</button>
          </form>
        </div>
      </div>

      {items.length === 0 ? (
        <p className="py-12 text-center text-[var(--muted)]">Пока пусто. Добавьте первую позицию.</p>
      ) : (
        <div className="flex flex-col gap-2">
          {items.map((item) => (
            <div
              key={item.id}
              className="flex items-center gap-3 rounded-xl border border-[var(--line)] bg-[var(--card)] p-3"
            >
              <div className="min-w-0 flex-1">
                <Link href={`/admin/${item.id}`} className="block truncate font-medium">
                  {item.title}
                </Link>
                <div className="text-xs text-[var(--muted)]">
                  №{item.id} · {item.kind === 'realty' ? 'жильё' : 'товар'} · {priceText(item.price)}
                  {item.hidden ? ' · скрыто' : ''}
                </div>
              </div>
              <form action={toggleHidden}>
                <input type="hidden" name="id" value={item.id} />
                <button className="text-sm text-[var(--muted)]">{item.hidden ? 'Показать' : 'Скрыть'}</button>
              </form>
            </div>
          ))}
        </div>
      )}
    </main>
  );
}
