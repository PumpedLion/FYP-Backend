// src/middleware/authMiddleware.ts
import { Request, Response, NextFunction } from 'express';
import jwt from 'jsonwebtoken';

// We export this interface just in case we need it for type casting,
// but the middleware function itself will use standard 'Request'
export interface AuthRequest extends Request {
  user?: any;
}

export const protect = (req: Request, res: Response, next: NextFunction) => {
  let token: string | undefined;

  if (req.headers.authorization && req.headers.authorization.startsWith('Bearer')) {
    try {
      token = req.headers.authorization.split(' ')[1];

      const jwtSecret = process.env.JWT_SECRET ?? 'secret';
      const decoded = jwt.verify(token!, jwtSecret);

      // We cast 'req' to 'any' or 'AuthRequest' here to attach the user
      (req as AuthRequest).user = decoded;

      next();
    } catch (error) {
      res.status(401).json({ message: 'Not authorized, token failed' });
    }
  } else {
    res.status(401).json({ message: 'Not authorized, no token' });
  }
};

export const optionalAuth = (req: Request, res: Response, next: NextFunction) => {
  if (req.headers.authorization && req.headers.authorization.startsWith('Bearer')) {
    try {
      const token = req.headers.authorization.split(' ')[1];
      const jwtSecret = process.env.JWT_SECRET ?? 'secret';
      const decoded = jwt.verify(token!, jwtSecret);
      (req as AuthRequest).user = decoded;
    } catch (error) {
      // Ignore token errors for optional auth
    }
  }
  next();
};