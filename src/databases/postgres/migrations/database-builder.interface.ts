import { IMigration } from "./migration.interface.js";

export interface IDatabaseBuilder {
    withAuth(): IDatabaseBuilder;
    withMultitenant(): IDatabaseBuilder;
    withMigrations(migrations: IMigration[]): IDatabaseBuilder;
    build(): Promise<{ success: boolean, error: Error | null }>;
}