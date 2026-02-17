import { IDatabaseConfig } from "../../../models/database-config.interface.js";

export function buildPostgresUrl(config: { database: IDatabaseConfig }): string {
  const { database } = config;

  if (!database) {
    throw new Error("Database configuration is required to build the PostgreSQL URL.");
  }

  const { username, password, host, port, name } = database;

  if (!username || !password || !host || !port || !name) {
    throw new Error(
      "Database configuration must include user, password, host, port, and name to build the PostgreSQL URL."
    );
  }

  // Always encode credentials to handle special characters (e.g., @, :)
  const encodedUsername = encodeURIComponent(username);
  const encodedPassword = encodeURIComponent(password);

  // Standard PostgreSQL connection URI
  return `postgresql://${encodedUsername}:${encodedPassword}@${host}:${port}/${name}`;
}

