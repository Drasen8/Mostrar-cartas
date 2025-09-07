import type { NextConfig } from "next";

const isVercel = !!process.env.VERCEL;
// Solo activar export estático para GitHub Pages cuando NO es Vercel
const isPages = !isVercel && process.env.GITHUB_PAGES === 'true';
const repoBase = '/cartas-online'; // si usas GitHub Pages de proyecto

const nextConfig: NextConfig = {
  // En Vercel: no export, sin basePath
  // En GitHub Pages: export estático y basePath
  ...(isPages
    ? {
        output: 'export',
        images: { unoptimized: true },
        basePath: repoBase,
        assetPrefix: `${repoBase}/`,
        trailingSlash: true,
      }
    : {}),
  eslint: { ignoreDuringBuilds: true }, // evita fallos por lint en Vercel
  // opcional: si tienes tipos en rojo y quieres que no paren el build
  // typescript: { ignoreBuildErrors: true },
};

export default nextConfig;
