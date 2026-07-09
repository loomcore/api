import { initializeTypeBox } from "@loomcore/common/validation";
import bodyParser from "body-parser";
import cookieParser from "cookie-parser";
import express, { type Application } from "express";
import supertest from "supertest";

import type { IDatabase } from "../databases/models/database.interface.js";
import { ensureUserContext } from "../middleware/ensure-user-context.js";
import { errorHandler } from "../middleware/error-handler.js";
import { setupTestConfig } from "./common-test.utils.js";
import { TestMongoDatabase } from "./mongo-db.test-database.js";
import { TestPostgresDatabase } from "./postgres.test-database.js";
import type { ITestDatabase } from "./test-database.interface.js";

type TestExpressAppInitResult = {
	app: Application;
	database: IDatabase;
	testDatabase: ITestDatabase;
	agent: any;
};

let app: Application;
let database: IDatabase;
let testDatabase: ITestDatabase;
let initPromise: Promise<TestExpressAppInitResult> | null = null;

/**
 * Initialize the Express application with a test database
 * @param useMongoDb - If not provided, will check TEST_DATABASE env var ('mongodb' or 'postgres')
 * @returns Promise resolving to an object with the app, database, and supertest agent
 */
async function init(useMongoDb?: boolean): Promise<TestExpressAppInitResult> {
	// If useMongoDb is not explicitly provided, check environment variable
	if (useMongoDb === undefined) {
		const testDb = process.env.TEST_DATABASE;
		useMongoDb = testDb === "mongodb";
	}

	// Return existing promise if initialization is already in progress
	if (initPromise) {
		return initPromise;
	}

	// Create and cache the initialization promise
	initPromise = performInit(useMongoDb);
	return initPromise;
}

async function performInit(
	useMongoDb: boolean,
): Promise<TestExpressAppInitResult> {
	// Set up a fake clientSecret for authentication
	setupTestConfig(true, useMongoDb ? "mongodb" : "postgres");

	// Initialize TypeBox format validators
	initializeTypeBox();

	if (!database) {
		if (useMongoDb) {
			const testMongoDb = new TestMongoDatabase();
			testDatabase = testMongoDb;
			database = await testMongoDb.init();
		} else {
			const testPostgresDb = new TestPostgresDatabase();
			testDatabase = testPostgresDb;
			database = await testPostgresDb.init();
		}
	}

	// Set up Express app if not already done
	if (!app) {
		app = express();
		app.use(bodyParser.json());
		app.use(cookieParser()); // Add cookie-parser middleware
		app.use(ensureUserContext);

		// Add diagnostic middleware to log all requests
		app.use((req, res, next) => {
			next();
		});
	}

	// Create a supertest agent for making test requests
	const agent = supertest.agent(app);

	return {
		app,
		database,
		testDatabase,
		agent,
	};
}

// Use the real error handler from our application
async function setupErrorHandling(): Promise<void> {
	// Add the same error handling middleware used in the real app
	app.use(errorHandler);
}

/**
 * Clear all collections in the database
 */
async function clearCollections(): Promise<void> {
	if (testDatabase) {
		await testDatabase.clearCollections();
	}
}

/**
 * Clean up resources
 */
async function cleanup(): Promise<void> {
	if (testDatabase) {
		await testDatabase.cleanup();
	}
	// Reset initialization state
	initPromise = null;
	app = undefined as any;
	database = undefined as any;
	testDatabase = undefined as any;
}

/**
 * Utility for setting up a minimal Express application for testing.
 * This uses the real authentication middleware, unlike our previous approach.
 */
export const TestExpressApp = {
	init,
	setupErrorHandling,
	clearCollections,
	cleanup,
};
