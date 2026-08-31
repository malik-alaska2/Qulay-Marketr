import Link from 'next/link';
import { notFound, redirect } from 'next/navigation';
import { getItem, images } from '@/lib/db';
import { isLoggedIn } from '@/lib/auth';
import { deleteItem, saveItem } from '../actions';

export const dynamic = 'force-dynamic';

const input =
  'h-12 w-full rounded-lg border border-[var(--line)] bg-[var(--card)] px-3 outline-none';

export default async function EditPage({ params }: { params: Promise<{ id: string }> }) {
  if (!(await isLoggedIn())) redirect('/admin');

  const { id } = await params;
  const isNew = id === 'new';
  const item = isNew ? undefined : getItem(Number(id));
  if (!isNew && !item) notFound();

  const photos = item ? images(item) : [];

  return (
    <main className="pt-4">
      <Link href="/admin" className="text-sm text-[var(--muted)]">
        ← Назад
      </Link>
      <h1 className="mb-4 mt-2 text-xl font-semibold">{isNew ? 'Новая позиция' : `Позиция №${item!.id}`}</h1>

      <form action={saveItem} className="flex flex-col gap-4">
        {item ? <input type="hidden" name="id" value={item.id} /> : null}

        <label className="flex flex-col gap-1 text-sm">
          Тип
          <select name="kind" defaultValue={item?.kind ?? 'product'} className={input}>
            <option value="product">Товар</option>
            <option value="realty">Жильё</option>
          </select>
        </label>

        <label className="flex flex-col gap-1 text-sm">
          Название
          <input name="title" required defaultValue={item?.title} className={input} />
        </label>

        <label className="flex flex-col gap-1 text-sm">
          Цена, TL
          <input name="price" type="number" min={0} defaultValue={item?.price ?? ''} className={input} />
        </label>

        <label className="flex flex-col gap-1 text-sm">
          Описание
          <textarea
            name="description"
            rows={5}
            defaultValue={item?.description}
            className={`${input} h-auto py-2`}
          />
        </label>

        <div className="grid grid-cols-2 gap-3">
          <label className="flex flex-col gap-1 text-sm">
            Категория
            <input name="category" defaultValue={item?.category} className={input} />
          </label>
          <label className="flex flex-col gap-1 text-sm">
            Район
            <input name="district" defaultValue={item?.district} className={input} />
          </label>
          <label className="flex flex-col gap-1 text-sm">
            Комнаты
            <input name="rooms" placeholder="2+1" defaultValue={item?.rooms} className={input} />
          </label>
          <label className="flex flex-col gap-1 text-sm">
            Площадь, м²
            <input name="area" type="number" min={0} defaultValue={item?.area ?? ''} className={input} />
          </label>
          <label className="flex flex-col gap-1 text-sm">
            Этаж
            <input name="floor" placeholder="5 из 12" defaultValue={item?.floor} className={input} />
          </label>
        </div>

        <div className="flex gap-5 text-sm">
          <label className="flex items-center gap-2">
            <input type="checkbox" name="furnished" defaultChecked={Boolean(item?.furnished)} className="size-5" />
            С мебелью
          </label>
          <label className="flex items-center gap-2">
            <input type="checkbox" name="hidden" defaultChecked={Boolean(item?.hidden)} className="size-5" />
            Скрыть с сайта
          </label>
        </div>

        <div className="flex flex-col gap-2 text-sm">
          Фотографии
          {photos.length > 0 ? (
            <div className="flex flex-wrap gap-2">
              {photos.map((photo) => (
                <label key={photo} className="flex w-24 flex-col gap-1">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={`/uploads/${photo}`} alt="" className="h-20 w-24 rounded-lg object-cover" />
                  <span className="flex items-center gap-1 text-xs">
                    {/* Снятая галочка — фотография удалится при сохранении */}
                    <input type="checkbox" name="keep" value={photo} defaultChecked />
                    оставить
                  </span>
                </label>
              ))}
            </div>
          ) : null}
          <input type="file" name="photos" accept="image/*" multiple className="text-sm" />
        </div>

        <button className="h-12 rounded-lg bg-[var(--accent)] font-medium text-white">Сохранить</button>
      </form>

      {item ? (
        <form action={deleteItem} className="mt-3">
          <input type="hidden" name="id" value={item.id} />
          <button className="text-sm text-red-600">Удалить позицию</button>
        </form>
      ) : null}
    </main>
  );
}
