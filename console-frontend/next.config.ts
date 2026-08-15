import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Packaged builds are static files served by the console-backend exe (see
  // console-backend/app/main.py) rather than a Node server; no Node.js runtime needed on the
  // install target. `next dev` is unaffected by this setting.
  output: "export",
  trailingSlash: true,
  images: {
    unoptimized: true,
  },
  // The on-screen route indicator `next dev` overlays in a corner of the page - dev-only
  // chrome, never present in the static export this actually ships as, but distracting during
  // design review.
  devIndicators: false,
};

export default nextConfig;
