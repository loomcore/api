import express, { Application, NextFunction, Request, Response } from 'express';
import { Db, MongoClient } from "mongodb";
import type { Client, Pool } from "pg";
import { Server } from "http";
import cookieParser from "cookie-parser";
import bodyParser from "body-parser";
import cors from "cors";
import qs from 'qs';

import { NotFoundError } from "../errors/not-found.error.js";
import { errorHandler } from "../middleware/error-handler.js";
import { IBaseApiConfig } from "../models/index.js";
import { ensureUserContext } from '../middleware/ensure-user-context.js';
import { IDatabase } from '../databases/models/index.js';

// Define the type for the routes setup function
type RouteSetupFunction = (app: Application, database: IDatabase, config: IBaseApiConfig) => void;

function setupExpressApp(database: IDatabase, config: IBaseApiConfig, setupRoutes: RouteSetupFunction): Application {
  const app: Application = express();

  // Use the 'qs' library for parsing query strings which allows for nested objects
  app.set('query parser', (str: string) => {
    return qs.parse(str, {
      // You can configure qs options here if needed
    });
  });

  // Add early request logging before any middleware
  app.use((req, res, next) => {
    if (req.path !== '/api/health' && process.env.NODE_ENV !== 'test') {
      console.log(`[${new Date().toLocaleString('en-US', { timeZone: 'America/Chicago' })}] INCOMING REQUEST: ${req.method} ${req.path}`);
    }
    next();
  });

  app.use(bodyParser.json());
  app.use(cookieParser() as any);
  app.use(cors({
    origin: config.network.corsAllowedOrigins,
    credentials: true
  }));
  app.use(ensureUserContext);

  setupRoutes(app, database, config); // setupRoutes calls every controller to map its own routes

  app.use(async (req, res) => {
    throw new NotFoundError(`Requested path, ${req.path}, Not Found`);
  });

  app.use(errorHandler);
  return app;
}

// ******** Shutdown ********
/**
 * Performs a graceful shutdown of all server resources
 * - Closes HTTP servers with a timeout
 * - Ensures MongoDB connection is closed when a client was provided
 * - Ensures PostgreSQL pool (or single Client) is ended when provided
 * - Exits the process when cleanup is complete
 */
function performGracefulShutdown(
  event: any,
  mongoClient: MongoClient | null,
  externalServer: Server | null,
  internalServer: Server | null,
  postgres: Pool | Client | null = null
): void {
  // Function to close MongoDB connection
  const closeMongoConnection = async (): Promise<void> => {
    if (mongoClient) {
      console.log('closing mongodb connection');
      try {
        await mongoClient.close();
        console.log('MongoDB connection closed successfully');
      } catch (err) {
        console.error('Error closing MongoDB connection:', err);
      }
    }
  };

  const closePostgres = async (): Promise<void> => {
    if (!postgres) {
      return;
    }
    console.log('closing PostgreSQL pool');
    try {
      await postgres.end();
      console.log('PostgreSQL pool closed successfully');
    } catch (err) {
      console.error('Error closing PostgreSQL pool:', err);
    }
  };

  // Create a promise to track server shutdown completion
  const shutdownServers = new Promise<void>((resolve) => {
    let serversClosedCount = 0;
    const totalServers = (externalServer ? 1 : 0) + (internalServer ? 1 : 0);

    const onServerClosed = () => {
      serversClosedCount++;
      if (serversClosedCount >= totalServers) {
        resolve();
      }
    };

    // If no servers were started, resolve immediately
    if (totalServers === 0) {
      resolve();
      return;
    }

    // Close the HTTP servers
    if (externalServer) {
      console.log('Closing external HTTP server...');
      externalServer.close((err: any) => {
        if (err) console.error('Error closing external server:', err);
        console.log('External HTTP server closed');
        onServerClosed();
      });
    }

    if (internalServer) {
      console.log('Closing internal HTTP server...');
      internalServer.close((err) => {
        if (err) console.error('Error closing internal server:', err);
        console.log('Internal HTTP server closed');
        onServerClosed();
      });
    }

    // Force resolve after timeout if servers don't close gracefully
    setTimeout(() => {
      console.log('Server shutdown timeout reached, proceeding with database cleanup');
      resolve();
    }, 5000); // 5 second timeout
  });

  const closeAllDatabases = async (): Promise<void> => {
    await Promise.all([closeMongoConnection(), closePostgres()]);
  };

  // Handle the complete shutdown sequence
  Promise.race([
    // Normal path: servers close, then database connections
    shutdownServers.then(() => closeAllDatabases()),

    // Timeout path: ensure database connections close even if servers timeout
    new Promise<void>(resolve => {
      setTimeout(async () => {
        console.log('Ensuring database connections are closed before exit');
        await closeAllDatabases();
        resolve();
      }, 6000); // Give a bit more time than the server timeout
    })
  ]).then(() => {
    console.log('Cleanup complete, exiting process');
    process.exit(0);
  });
}

export const expressUtils = {
  setupExpressApp,
  performGracefulShutdown,
};
