/** @type {import('next').NextConfig} */
const nextConfig = {
  experimental: {
    serverActions: {
      bodySizeLimit: '10mb', // Aumenta il limite a 10MB
    },
  },
};

export default nextConfig;