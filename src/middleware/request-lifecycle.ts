import { Request, Response, NextFunction } from 'express';

/**
 * Options for the request lifecycle middleware
 */
export interface RequestLifecycleOptions {
  /**
   * Callback invoked when a request starts
   * @param req - Express request object
   * @param res - Express response object
   */
  onRequestStart?: (req: Request, res: Response) => void | Promise<void>;

  /**
   * Callback invoked when a request ends (successfully or with error)
   * @param req - Express request object
   * @param res - Express response object
   * @param duration - Request duration in milliseconds
   * @param error - Error object if the request ended with an error, undefined otherwise
   */
  onRequestEnd?: (req: Request, res: Response, duration: number, error?: Error) => void | Promise<void>;
}

/**
 * Middleware that provides onRequestStart and onRequestEnd callbacks
 * for tracking request lifecycle events.
 * 
 * @param options - Configuration options with optional callbacks
 * @returns Express middleware function
 * 
 * @example
 * ```typescript
 * app.use(requestLifecycle({
 *   onRequestStart: (req, res) => {
 *     console.log(`Request started: ${req.method} ${req.path}`);
 *   },
 *   onRequestEnd: (req, res, duration, error) => {
 *     console.log(`Request ended: ${req.method} ${req.path} - ${duration}ms`);
 *   }
 * }));
 * ```
 */
export const requestLifecycle = (options: RequestLifecycleOptions = {}) => {
  const { onRequestStart, onRequestEnd } = options;

  return async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    // Store start time for duration calculation
    const startTime = Date.now();

    // Call onRequestStart callback if provided
    if (onRequestStart) {
      try {
        await onRequestStart(req, res);
      } catch (error) {
        // Log error but don't block the request
        console.error('Error in onRequestStart callback:', error);
      }
    }

    // Track if onRequestEnd has been called to avoid double invocation
    let endCallbackCalled = false;

    const callOnRequestEnd = async (error?: Error) => {
      if (endCallbackCalled) return;
      endCallbackCalled = true;

      if (onRequestEnd) {
        try {
          const duration = Date.now() - startTime;
          await onRequestEnd(req, res, duration, error);
        } catch (callbackError) {
          // Log error but don't affect the response
          console.error('Error in onRequestEnd callback:', callbackError);
        }
      }
    };

    // Handle successful response completion (including error responses sent by error handlers)
    res.on('finish', () => {
      callOnRequestEnd();
    });

    // Handle client disconnect or connection close
    res.on('close', () => {
      if (!res.writableEnded && !endCallbackCalled) {
        callOnRequestEnd(new Error('Request closed before completion'));
      }
    });

    // Call next middleware
    next();
  };
};

