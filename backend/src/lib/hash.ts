import { createHash, createHmac } from 'crypto';

export function sha256(input: string): string {
  return createHash('sha256').update(input).digest('hex');
}

export function hmacSha256(input: string, secret: string): string {
  return createHmac('sha256', secret).update(input).digest('hex');
}
