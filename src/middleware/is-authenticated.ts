import { Request, Response, NextFunction } from 'express';
import { IUserContext, UserContextSpec } from '@loomcore/common/models';
import { UnauthenticatedError } from '../errors/index.js';
import { JwtService } from '../services/index.js';
import { config } from '../config/index.js';

export const isAuthenticated = (req: Request, res: Response, next: NextFunction) => {
  let token = null;

  // check Authorization Header
  if (req.headers?.authorization) {
    let authHeader = req.headers.authorization;
    const authHeaderArray = authHeader.split('Bearer ');
    if (authHeaderArray?.length > 1) {
      token = authHeaderArray[1];
    }
  }

  if (token) {
    try {
      // Get raw JWT payload first
      const rawPayload = JwtService.verify(token, config.clientSecret) as IUserContext;

      // Use TypeBox to decode the payload properly, which will convert string dates to Date objects
      req.userContext = UserContextSpec.decode(rawPayload);

      next();
    }
    catch (err) {
      throw new UnauthenticatedError();
    }
  }
  else {
    throw new UnauthenticatedError();
  }
}
