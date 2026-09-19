import type { NextConfig } from "next";

const cspHeader = `
  default-src 'self';
  script-src 'self' 'unsafe-eval' 'unsafe-inline' https://cdn.jsdelivr.net;
  style-src 'self' 'unsafe-inline' https://fonts.googleapis.com;
  img-src 'self' blob: data: https:;
  font-src 'self' https://fonts.gstatic.com;
  connect-src 'self' https: http://localhost:* ws: wss:;
  frame-src 'self' https:;
  media-src 'self' blob: mediastream:;
  worker-src 'self' blob:;
`;

const nextConfig: NextConfig = {
  transpilePackages: ["@project1xr/engine"],
  serverExternalPackages: ["@huggingface/transformers", "onnxruntime-node", "sharp"],
  async redirects() { return [{ source: "/favicon.ico", destination: "/favicon.svg", permanent: true }]; },
  experimental: {
    serverActions: {
      bodySizeLimit: "50mb",
    },
  },
  images: {
    remotePatterns: [
      {
        protocol: "https",
        hostname: "**.aliyuncs.com",
      },
    ],
  },
  async headers() {
    return [
      {
        source: "/(.*)",
        headers: [
          {
            key: "Content-Security-Policy",
            value: cspHeader.replace(/\n/g, " ").trim(),
          },
        ],
      },
      {
        source: "/view/:path*",
        headers: [
          {
            key: "Cross-Origin-Opener-Policy",
            value: "same-origin-allow-popups",
          },
        ],
      },
      {
        source: "/models/:path*",
        headers: [
          {
            key: "Cache-Control",
            value: "public, max-age=31536000, immutable",
          },
        ],
      },
      {
        source: "/_next/static/:path*",
        headers: [
          {
            key: "Cache-Control",
            value: "public, max-age=31536000, immutable",
          },
        ],
      },
      {
        source: "/wasm/:path*",
        headers: [
          {
            key: "Cache-Control",
            value: "public, max-age=31536000, immutable",
          },
        ],
      },
    ];
  },
  webpack(config, { webpack }) {
    config.module.rules.push({
      test: /\.wasm$/,
      type: "asset/resource",
    });
    return config;
  },
};

// Allow cross-origin access from local network for mobile testing
if (process.env.NODE_ENV === 'development') {
  (nextConfig as any).allowedDevOrigins = ['*.local'];
}

export default nextConfig;
