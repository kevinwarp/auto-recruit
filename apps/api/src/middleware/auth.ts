import type { Request, Response, NextFunction } from 'express';
import { getAuth } from '../services/firebase.js';
import { prisma } from '@auto-recruit/db';

export interface AuthenticatedRequest extends Request {
  user: {
    uid: string;
    email: string;
    role: string;
  };
}

export async function requireAuth(req: Request, res: Response, next: NextFunction) {
  const authHeader = req.headers['authorization'];
  if (!authHeader?.startsWith('Bearer ')) {
    res.status(401).json({ message: 'Missing or invalid Authorization header' });
    return;
  }

  const token = authHeader.slice(7);
  try {
    const decoded = await getAuth().verifyIdToken(token);

    // Upsert user record (mirrors Firebase user into our DB)
    const user = await prisma.user.upsert({
      where: { id: decoded.uid },
      create: {
        id: decoded.uid,
        email: decoded.email ?? '',
        displayName: decoded.name as string | undefined,
        role: 'recruiter',
      },
      update: {
        email: decoded.email ?? '',
        displayName: decoded.name as string | undefined,
      },
      select: { id: true, email: true, role: true },
    });

    (req as AuthenticatedRequest).user = { uid: user.id, email: user.email, role: user.role };
    // Also set req.userId for the request logger
    req.userId = user.id;
    next();
  } catch {
    res.status(401).json({ message: 'Invalid or expired token' });
  }
}

export function requireRole(...roles: string[]) {
  return (req: Request, res: Response, next: NextFunction) => {
    const user = (req as AuthenticatedRequest).user;
    if (!user || !roles.includes(user.role)) {
      res.status(403).json({ message: 'Insufficient permissions' });
      return;
    }
    next();
  };
}
