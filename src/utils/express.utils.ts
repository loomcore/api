import express, {Application, NextFunction, Request, Response} from 'express';
import { Db, MongoClient } from "mongodb";
import { Server } from "http";
import cookieParser from "cookie-parser";
import bodyParser from "body-parser";
import cors from "cors";

import { NotFoundError } from "../errors/not-found.error.js";
import { errorHandler } from "../middleware/error-handler.js";
import { IBaseApiConfig } from "../models/index.js";
import { ensureUserContext } from '../middleware/ensure-user-context.js';

// Define the type for the routes setup function
type RouteSetupFunction = (app: Application, db: Db, config: IBaseApiConfig) => void;

// function setupInternalExpress(db: Db, config: IBaseApiConfig, setupRoutes: RouteSetupFunction) {
// 	internalApp.use(bodyParser.json());
// 	internalApp.use(cookieParser());
// 	internalApp.use(cors({
// 		origin: config.corsAllowedOrigins
// 	}));
// 	internalRoutes(internalApp, db); // routes calls every controller to map its own routes

// 	internalApp.all('*', async (req, res) => {
// 		throw new NotFoundError();
// 	});
// 	internalApp.use(errorHandler);
// }

function setupExpressApp(db: Db, config: IBaseApiConfig, setupRoutes: RouteSetupFunction): Application {
  const app: Application = express();

  console.log(`config: `, config); // todo: delete me
  
  // Add early request logging before any middleware
  console.log(`about to register health endpoint`); // todo: delete me
  app.use((req, res, next) => {
    if (req.path !== '/api/health' && process.env.NODE_ENV !== 'test') {
      console.log(`[${new Date().toLocaleString('en-US', { timeZone: 'America/Chicago' })}] INCOMING REQUEST: ${req.method} ${req.path}`);
    }
    next();
  });

  console.log(`registering third party middleware`); // todo: delete me
  app.use(bodyParser.json());
  app.use(cookieParser() as any);
	app.use(cors({
		origin: config.corsAllowedOrigins,
		credentials: true
	}));
  console.log(`about to register ensureUserContext`); // todo: delete me
  app.use(ensureUserContext);

  console.log(`about to call setupRoutes`); // todo: delete me
  setupRoutes(app, db, config); // setupRoutes calls every controller to map its own routes

  console.log(`about to register * middleware for notfound paths`); // todo: delete me
  app.use(async (req, res) => {
    throw new NotFoundError(`Requested path, ${req.path}, Not Found`);
  });

  console.log(`about to register errorHandler middleware`); // todo: delete me
  app.use(errorHandler);
  return app;
}

// ******** Shutdown ********
/**
 * Performs a graceful shutdown of all server resources
 * - Closes HTTP servers with a timeout
 * - Ensures MongoDB connection is always closed
 * - Exits the process when cleanup is complete
 */
function performGracefulShutdown(
  event: any, 
  mongoClient: MongoClient | null, 
  externalServer: Server | null, 
  internalServer: Server | null
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
      console.log('Server shutdown timeout reached, proceeding with MongoDB cleanup');
      resolve();
    }, 5000); // 5 second timeout
  });

  // Handle the complete shutdown sequence
  Promise.race([
    // Normal path: servers close, then MongoDB
    shutdownServers.then(() => closeMongoConnection()),
    
    // Timeout path: ensure MongoDB closes even if servers timeout
    new Promise<void>(resolve => {
      setTimeout(async () => {
        console.log('Ensuring MongoDB connection is closed before exit');
        await closeMongoConnection();
        resolve();
      }, 6000); // Give a bit more time than the server timeout
    })
  ]).then(() => {
    console.log('Cleanup complete, exiting process');
    process.exit(0);
  });
}

export const expressUtils =  {
	setupExpressApp,
  performGracefulShutdown,
};
