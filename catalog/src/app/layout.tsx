import type { Metadata, Viewport } from 'next';
import './globals.css';

export const metadata: Metadata = {
  title: 'Каталог',
  description: 'Квартиры и товары',
};

export const viewport: Viewport = { width: 'device-width', initialScale: 1 };

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="ru">
      <body>
        <div className="mx-auto max-w-3xl px-4 pb-16">{children}</div>
        {/* Скрипт нужен, чтобы страница корректно открывалась внутри Telegram */}
        <script src="https://telegram.org/js/telegram-web-app.js" async />
      </body>
    </html>
  );
}
