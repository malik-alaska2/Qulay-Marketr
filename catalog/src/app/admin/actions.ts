'use server';

import { randomUUID } from 'node:crypto';
import { writeFile, unlink } from 'node:fs/promises';
import path from 'node:path';
import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';
import { revalidatePath } from 'next/cache';
import { db, getItem, images } from '@/lib/db';
import { checkPassword, isLoggedIn, sessionValue, COOKIE_NAME } from '@/lib/auth';

const UPLOADS = path.join(process.cwd(), 'public', 'uploads');

export async function login(formData: FormData) {
  const password = String(formData.get('password') ?? '');
  if (!checkPassword(password)) redirect('/admin?error=1');

  (await cookies()).set(COOKIE_NAME, sessionValue(), {
    httpOnly: true,
    sameSite: 'lax',
    path: '/',
    maxAge: 60 * 60 * 24 * 30,
  });
  redirect('/admin');
}

export async function logout() {
  (await cookies()).delete(COOKIE_NAME);
  redirect('/admin');
}

async function requireAuth() {
  if (!(await isLoggedIn())) redirect('/admin');
}

/** Сохраняет фотографии в public/uploads и возвращает их имена. */
async function saveUploads(files: File[]): Promise<string[]> {
  const saved: string[] = [];
  for (const file of files) {
    if (!file || file.size === 0) continue;
    if (!file.type.startsWith('image/')) continue;

    const extension = file.type.split('/')[1]?.replace('jpeg', 'jpg') ?? 'jpg';
    const name = `${randomUUID()}.${extension}`;
    await writeFile(path.join(UPLOADS, name), Buffer.from(await file.arrayBuffer()));
    saved.push(name);
  }
  return saved;
}

export async function saveItem(formData: FormData) {
  await requireAuth();

  const id = Number(formData.get('id') ?? 0);
  const existing = id ? getItem(id) : undefined;

  const keep = formData.getAll('keep').map(String);
  const uploaded = await saveUploads(formData.getAll('photos') as File[]);
  const photos = [...keep, ...uploaded];

  const values = {
    kind: String(formData.get('kind') ?? 'product'),
    title: String(formData.get('title') ?? '').trim(),
    description: String(formData.get('description') ?? '').trim(),
    price: Number(formData.get('price') ?? 0) || 0,
    category: String(formData.get('category') ?? '').trim(),
    district: String(formData.get('district') ?? '').trim(),
    rooms: String(formData.get('rooms') ?? '').trim(),
    area: formData.get('area') ? Number(formData.get('area')) : null,
    floor: String(formData.get('floor') ?? '').trim(),
    furnished: formData.get('furnished') ? 1 : 0,
    hidden: formData.get('hidden') ? 1 : 0,
    images: JSON.stringify(photos),
  };

  if (!values.title) redirect(`/admin/${id || 'new'}?error=title`);

  if (existing) {
    db.prepare(
      `UPDATE items SET kind=@kind, title=@title, description=@description, price=@price,
       category=@category, district=@district, rooms=@rooms, area=@area, floor=@floor,
       furnished=@furnished, hidden=@hidden, images=@images WHERE id=@id`,
    ).run({ ...values, id });

    // Удаляем с диска фотографии, которые убрали из карточки
    for (const photo of images(existing)) {
      if (!photos.includes(photo)) await unlink(path.join(UPLOADS, photo)).catch(() => undefined);
    }
  } else {
    db.prepare(
      `INSERT INTO items (kind, title, description, price, category, district, rooms, area, floor, furnished, hidden, images)
       VALUES (@kind, @title, @description, @price, @category, @district, @rooms, @area, @floor, @furnished, @hidden, @images)`,
    ).run(values);
  }

  revalidatePath('/');
  redirect('/admin');
}

export async function deleteItem(formData: FormData) {
  await requireAuth();

  const id = Number(formData.get('id'));
  const item = getItem(id);
  if (item) {
    for (const photo of images(item)) {
      await unlink(path.join(UPLOADS, photo)).catch(() => undefined);
    }
    db.prepare('DELETE FROM items WHERE id = ?').run(id);
  }

  revalidatePath('/');
  redirect('/admin');
}

/** Быстрое скрытие и показ прямо из списка. */
export async function toggleHidden(formData: FormData) {
  await requireAuth();
  db.prepare('UPDATE items SET hidden = 1 - hidden WHERE id = ?').run(Number(formData.get('id')));
  revalidatePath('/');
  redirect('/admin');
}
