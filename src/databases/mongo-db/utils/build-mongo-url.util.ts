import { IDatabaseConfig } from "../../../models/database-config.interface.js";

function isAtlasSrvHost(host: string): boolean {
  return host.toLowerCase().endsWith(".mongodb.net");
}

export function buildMongoUrl(config: { database: IDatabaseConfig }): string {
  const { database } = config;

  if (!database) {
    throw new Error("Database configuration is required to build the MongoDB URL.");
  }

  const { username, password, host, port, name } = database;

  if (!username || !password || !host || !name) {
    throw new Error(
      "Database configuration must include user, password, host, and name to build the MongoDB URL."
    );
  }

  // Always encode credentials to handle special characters (e.g., @, :)
  const encodedUsername = encodeURIComponent(username);
  const encodedPassword = encodeURIComponent(password);

  // Atlas SRV hosts have no A/AAAA records; the driver must resolve via mongodb+srv.
  if (isAtlasSrvHost(host)) {
    return `mongodb+srv://${encodedUsername}:${encodedPassword}@${host}/${name}?authSource=admin&retryWrites=true&w=majority`;
  }

  if (!port) {
    throw new Error(
      "Database configuration must include port to build a non-SRV MongoDB URL."
    );
  }

  return `mongodb://${encodedUsername}:${encodedPassword}@${host}:${port}/${name}`;
}
