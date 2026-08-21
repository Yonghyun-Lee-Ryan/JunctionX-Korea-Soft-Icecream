#!/usr/bin/env node

import { randomBytes } from 'node:crypto';

// 48 random bytes provide more entropy than the 32-byte JWT secret minimum.
console.log(randomBytes(48).toString('base64url'));
