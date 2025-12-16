import { Request, Response, NextFunction } from 'express';
import { IUserContext, UserContextSpec } from '@loomcore/common/models';
import { UnauthenticatedError, UnauthorizedError } from '../errors/index.js';
import { JwtService } from '../services/index.js';
import { config } from '../config/index.js';

// Shared middleware implementation
const isAuthorized = (allowedFeatures?: string[]) => {
  return (req: Request, res: Response, next: NextFunction) => {
    let token = null;

    // check Authorization Header
    if (req.headers?.authorization) {
      let authHeader = req.headers.authorization;
      const authHeaderArray = authHeader.split('Bearer ');
      if (authHeaderArray?.length > 1) {
        token = authHeaderArray[1];
      }
    }

    if (!token) {
      throw new UnauthenticatedError();
    }

    try {
      // Get raw JWT payload first
      const rawPayload = JwtService.verify(token, config.clientSecret);

      // Use TypeBox to decode the payload properly, which will convert string dates to Date objects
      const userContext = UserContextSpec.decode(rawPayload) as IUserContext;

      req.userContext = userContext;

      if (userContext.authorizations.some(authorization => authorization.feature === 'admin')) {
        next();
      }
      else if (allowedFeatures && allowedFeatures.length) {
        if (!userContext.authorizations.some(authorization => allowedFeatures?.includes(authorization.feature))) {
          throw new UnauthorizedError();
        }
        next();
      } else {
        next();
      }
    }
    catch (err) {
      throw new UnauthenticatedError();
    }
  }
}

export { isAuthorized };
