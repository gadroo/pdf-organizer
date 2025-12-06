import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  /**
   * Increase body size limit for Server Actions and Route Handlers.
   * Required for large PDF uploads (up to 100MB).
   */
  experimental: {
    serverActions: {
      bodySizeLimit: "100mb",
    },
  },
  
  /**
   * Turbopack configuration (Next.js 16+ default bundler)
   * Empty config to acknowledge Turbopack usage and silence warnings
   */
  turbopack: {
    // Turbopack handles most cases automatically
    // Add resolveAlias here if needed in the future
  },
};

export default nextConfig;
