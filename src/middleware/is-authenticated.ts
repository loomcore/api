import { Request, Response, NextFunction } from 'express';
import {IUserContext} from '../models/user-context.model.js';
import {UnauthenticatedError} from '../errors/index.js';
import {JwtService} from '../services/index.js';
import {config} from '../config/index.js';

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
      const payload = JwtService.verify(token, config.clientSecret) as IUserContext;
      req.userContext = payload;
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
