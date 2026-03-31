/** @type {import('next').NextConfig} */
const nextConfig = {
  experimental: {
    typedRoutes: true,
  },
  env: {
    NEXT_PUBLIC_API_URL: process.env['NEXT_PUBLIC_API_URL'] ?? 'http://localhost:8080',
    NEXT_PUBLIC_FIREBASE_API_KEY: process.env['NEXT_PUBLIC_FIREBASE_API_KEY'] ?? '',
    NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN: process.env['NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN'] ?? '',
    NEXT_PUBLIC_FIREBASE_PROJECT_ID: process.env['NEXT_PUBLIC_FIREBASE_PROJECT_ID'] ?? 'auto-recruit-aae2a',
  },
};

export default nextConfig;
