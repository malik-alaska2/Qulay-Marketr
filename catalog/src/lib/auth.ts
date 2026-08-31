import { createHmac, timingSafeEqual } from 'node:crypto';
import { cookies } from 'next/headers';

export const COOKIE_NAME = 'admin';

/** Вход по одному паролю: в cookie кладётся подпись, а не сам пароль. */
export function sessionValue(): string {
  return createHmac('sha256', process.env.SESSION_SECRET ?? 'dev-secret')
    .update(process.env.ADMIN_PASSWORD ?? '')
    .digest('hex');
}

export function checkPassword(password: string): boolean {
  const expected = process.env.ADMIN_PASSWORD ?? '';
  if (!expected || password.length !== expected.length) return false;
  return timingSafeEqual(Buffer.from(password), Buffer.from(expected));
}

export async function isLoggedIn(): Promise<boolean> {
  const cookie = (await cookies()).get(COOKIE_NAME)?.value;
  return Boolean(cookie) && cookie === sessionValue();
}
