import { IBaseApiConfig } from "../../../models/base-api-config.interface.js";

export function buildMongoUrl(config: IBaseApiConfig): string {
  const { database } = config;

  if (!database) {
    throw new Error("Database configuration is required to build the MongoDB URL.");
  }

  const { username, password, host, port, name } = database;

  if (!username || !password || !host || !port || !name) {
    throw new Error(
      "Database configuration must include user, password, host, port, and name to build the MongoDB URL."
    );
  }

  // Always encode credentials to handle special characters (e.g., @, :)
  const encodedUsername = encodeURIComponent(username);
  const encodedPassword = encodeURIComponent(password);

  return `mongodb://${encodedUsername}:${encodedPassword}@${host}:${port}/${name}`;
}