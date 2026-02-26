import jwt from 'jsonwebtoken';
import { Request, Response } from 'express';

const JWT_EXPIRY = '24h';

export interface JwtPayload {
  sub: string;
  iat?: number;
  exp?: number;
}

export function signToken(secret: string): string {
  return jwt.sign({ sub: 'agent-user' }, secret, {
    expiresIn: JWT_EXPIRY,
    algorithm: 'HS256',
  });
}

export function verifyToken(token: string, secret: string): JwtPayload {
  return jwt.verify(token, secret) as JwtPayload;
}

// Constant-time string comparison to prevent timing attacks
function safeCompare(a: string, b: string): boolean {
  if (a.length !== b.length) {
    // Still compare to avoid timing difference on length
    let result = 1;
    for (let i = 0; i < a.length && i < b.length; i++) {
      result |= a.charCodeAt(i) ^ b.charCodeAt(i);
    }
    return false;
  }
  let result = 0;
  for (let i = 0; i < a.length; i++) {
    result |= a.charCodeAt(i) ^ b.charCodeAt(i);
  }
  return result === 0;
}

export function loginHandler(req: Request, res: Response): void {
  const password = req.body?.password;

  if (typeof password !== 'string' || !password) {
    res.status(400).json({ message: 'Password is required' });
    return;
  }

  const agentPassword = process.env.AGENT_PASSWORD!;
  const jwtSecret = process.env.AGENT_JWT_SECRET!;

  // Always wait ~200ms to prevent timing attacks revealing if password exists
  const start = Date.now();
  const isValid = safeCompare(password, agentPassword);
  const elapsed = Date.now() - start;
  const delay = Math.max(0, 200 - elapsed);

  setTimeout(() => {
    if (!isValid) {
      res.status(401).json({ message: 'Invalid password' });
      return;
    }

    const token = signToken(jwtSecret);
    res.json({ token });
  }, delay);
}

export function validateWsToken(token: string | undefined): JwtPayload | null {
  if (!token) return null;

  try {
    return verifyToken(token, process.env.AGENT_JWT_SECRET!);
  } catch {
    return null;
  }
}
