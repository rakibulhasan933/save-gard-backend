const DEFAULT_HTTP_PORT = 4000;
const DEFAULT_WS_PORT = 4000;

export type ServerConfig = {
  httpPort: number;
  wsPort: number;
  jwtSecret: string;
  databaseUrl: string;
};

export function getServerConfig(): ServerConfig {
  const jwtSecret = process.env.JWT_SECRET;
  const databaseUrl = process.env.DATABASE_URL;

  if (!jwtSecret || jwtSecret.length < 32) {
    throw new Error("JWT_SECRET must be at least 32 characters");
  }

  if (!databaseUrl) {
    throw new Error("DATABASE_URL is required");
  }

  return {
    httpPort: Number(process.env.API_PORT ?? process.env.HTTP_PORT ?? process.env.PORT ?? DEFAULT_HTTP_PORT),
    wsPort: Number(process.env.WS_PORT ?? DEFAULT_WS_PORT),
    jwtSecret,
    databaseUrl
  };
}
