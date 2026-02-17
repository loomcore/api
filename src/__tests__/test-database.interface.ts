import { IDatabase } from "../databases/models/index.js";
import { IInitialDbMigrationConfig } from "../models/initial-database-config.interface.js";

export type ITestDatabase = {
  /**
   * Initialize the test database
   * @returns Promise resolving to the database instance
   */
  init(): Promise<IDatabase>;

  /**
   * Generate a random ID for testing
   * @returns A random ID string
   */
  getRandomId(): string;

  /**
   * Clear all collections/tables in the database
   */
  clearCollections(): Promise<void>;

  /**
   * Clean up database resources
   */
  cleanup(): Promise<void>;
};