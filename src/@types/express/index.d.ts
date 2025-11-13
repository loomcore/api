import { IUserContext } from '@loomcore/common/models';

declare global {
  namespace Express {
    interface Request {
      userContext?: IUserContext,
    }
  }
}
