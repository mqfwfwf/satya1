import { Request, Response, NextFunction } from "express";
import { authService } from "../services/auth";
import type { User } from "@shared/schema";

// Extend Express Request type to include user
declare global {
  namespace Express {
    interface Request {
      user?: Omit<User, 'password'>;
      userId?: string;
    }
  }
}

export interface AuthenticatedRequest extends Request {
  user: Omit<User, 'password'>;
  userId: string;
}

/**
 * Middleware to authenticate JWT tokens
 */
export const authenticateToken = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const authHeader = req.headers.authorization;
    const token = authHeader && authHeader.split(' ')[1]; // Bearer TOKEN

    if (!token) {
      return res.status(401).json({ 
        error: "Access token required",
        code: "NO_TOKEN"
      });
    }

    const user = await authService.verifyToken(token);
    
    if (!user) {
      return res.status(403).json({ 
        error: "Invalid or expired token",
        code: "INVALID_TOKEN"
      });
    }

    // Remove password from user object
    const { password, ...sanitizedUser } = user;
    req.user = sanitizedUser;
    req.userId = user.id;
    
    next();
  } catch (error) {
    console.error("Authentication middleware error:", error);
    return res.status(403).json({ 
      error: "Authentication failed",
      code: "AUTH_FAILED"
    });
  }
};

/**
 * Optional authentication middleware - doesn't fail if no token
 */
export const optionalAuth = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const authHeader = req.headers.authorization;
    const token = authHeader && authHeader.split(' ')[1];

    if (token) {
      const user = await authService.verifyToken(token);
      if (user) {
        const { password, ...sanitizedUser } = user;
        req.user = sanitizedUser;
        req.userId = user.id;
      }
    }
    
    next();
  } catch (error) {
    console.error("Optional auth middleware error:", error);
    next(); // Continue even if authentication fails
  }
};

/**
 * Middleware to require admin privileges
 */
export const requireAdmin = (req: Request, res: Response, next: NextFunction) => {
  if (!req.user) {
    return res.status(401).json({ 
      error: "Authentication required",
      code: "NO_AUTH"
    });
  }

  // For now, check if username contains 'admin' - in production, use proper role system
  if (!req.user.username.toLowerCase().includes('admin')) {
    return res.status(403).json({ 
      error: "Admin privileges required",
      code: "NOT_ADMIN"
    });
  }

  next();
};

/**
 * Rate limiting middleware for auth endpoints
 */
const loginAttempts = new Map<string, { count: number; lastAttempt: number }>();

export const rateLimitAuth = (maxAttempts: number = 5, windowMs: number = 15 * 60 * 1000) => {
  return (req: Request, res: Response, next: NextFunction) => {
    const identifier = req.ip || req.socket.remoteAddress || 'unknown';
    const now = Date.now();
    
    const attempts = loginAttempts.get(identifier);
    
    if (attempts) {
      // Reset if window has passed
      if (now - attempts.lastAttempt > windowMs) {
        loginAttempts.delete(identifier);
      } else if (attempts.count >= maxAttempts) {
        return res.status(429).json({
          error: "Too many login attempts. Please try again later.",
          code: "RATE_LIMITED",
          retryAfter: Math.ceil((windowMs - (now - attempts.lastAttempt)) / 1000)
        });
      }
    }
    
    next();
    
    // Increment attempt count on failed login (this would be called from login route)
    res.on('finish', () => {
      if (res.statusCode === 401 || res.statusCode === 400) {
        const currentAttempts = loginAttempts.get(identifier) || { count: 0, lastAttempt: now };
        loginAttempts.set(identifier, {
          count: currentAttempts.count + 1,
          lastAttempt: now
        });
      } else if (res.statusCode === 200) {
        // Reset on successful login
        loginAttempts.delete(identifier);
      }
    });
  };
};

/**
 * Middleware to extract user ID from token for analytics
 */
export const extractUserId = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const authHeader = req.headers.authorization;
    const token = authHeader && authHeader.split(' ')[1];

    if (token) {
      const user = await authService.verifyToken(token);
      if (user) {
        req.userId = user.id;
      }
    }
    
    next();
  } catch (error) {
    next(); // Continue even if token extraction fails
  }
};