import { cookies } from 'next/headers';
import { verify } from 'jsonwebtoken';

export function getUserFromToken(req: any): { id: string } | null {
  const token = req.cookies.get('token')?.value;
  if (!token) return null;

  try {
    const decoded = verify(token, process.env.JWT_SECRET!) as { id: string };
    return { id: decoded.id };
  } catch {
    return null;
  }
}
