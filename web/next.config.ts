import path from 'node:path'
import type { NextConfig } from 'next'

const nextConfig: NextConfig = {
  // Enable React strict mode
  reactStrictMode: true,
  turbopack: {
    root: path.resolve(__dirname, '..'),
  },

  // Optimize images
  images: {
    unoptimized: true,
  },

  async rewrites() {
    const backendUrl = process.env.AGENT_BACKEND_URL?.replace(/\/$/, '')
const incidentServerUrl =
  process.env.INCIDENT_SERVER_URL?.replace(/\/$/, '') || 'http://localhost:9000'

if (!backendUrl) {
  return []
}

    return [
      {
        source: '/api/get_config',
        destination: `${backendUrl}/get_config`,
      },
      {
        source: '/api/startAgent',
        destination: `${backendUrl}/startAgent`,
      },
      {
        source: '/api/stopAgent',
        destination: `${backendUrl}/stopAgent`,
      },
        {
          source: '/api/incidents',
          destination: `${incidentServerUrl}/incidents`,
        },
        {
          source: '/api/incidents/:path*',
          destination: `${incidentServerUrl}/incidents/:path*`,
        },
        {
          source: '/api/services/health',
          destination: `${incidentServerUrl}/services/health`,
        },
      ]
  },
}

export default nextConfig
