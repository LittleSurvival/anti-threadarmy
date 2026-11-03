import type { NextConfig } from "next";

const config: NextConfig = {
  transpilePackages: ["@anti-threadarmy/core", "@anti-threadarmy/ui", "@anti-threadarmy/threads-client"],
};

export default config;
