import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  serverExternalPackages: [
    "@prisma/client",
    "imapflow",
    "mailparser",
    "nodemailer",
    "archiver",
    "@react-pdf/renderer",
  ],
  experimental: {
    serverActions: { bodySizeLimit: "25mb" },
  },
  eslint: { ignoreDuringBuilds: true },
};

export default nextConfig;
