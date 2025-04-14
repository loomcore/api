import jwt from 'jsonwebtoken';

export class JwtService {
  static sign(payload: any, secret: string, options: any): string {
    return jwt.sign(payload, secret, options);
  }

  static verify(token: string, secret: string): any {
    if (!secret) {
      throw new Error('JWT secret is required for verification');
    }
    
    try {
      const decoded = jwt.verify(token, secret);
      return decoded;
    } catch (error) {
      throw error;
    }
  }
}
