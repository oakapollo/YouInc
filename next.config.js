/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  ...(process.env.CAPACITOR_EXPORT === "true"
    ? {
        output: "export",
        images: {
          unoptimized: true,
        },
      }
    : {}),
};

module.exports = nextConfig;
