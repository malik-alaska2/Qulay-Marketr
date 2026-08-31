import type { NextConfig } from 'next';

const config: NextConfig = {
  // better-sqlite3 — нативный модуль, его нельзя упаковывать в бандл
  serverExternalPackages: ['better-sqlite3'],
};

export default config;
