// src/models/index.ts
import dotenv from 'dotenv';

// Configure dotenv FIRST before accessing any environment variables
dotenv.config();

import { PrismaClient } from '../../generated/prisma/index.js';
import { Pool } from 'pg';
import { PrismaPg } from '@prisma/adapter-pg';

const globalForPrisma = global as unknown as { prisma: PrismaClient };

// Get and validate DATABASE_URL
const databaseUrl = process.env.DATABASE_URL;
if (!databaseUrl) {
  throw new Error('DATABASE_URL environment variable is not set');
}

// Remove any surrounding quotes from the connection string
const cleanDatabaseUrl = databaseUrl.trim().replace(/^["']|["']$/g, '');

// Validate connection string format
if (!cleanDatabaseUrl.startsWith('postgresql://') && !cleanDatabaseUrl.startsWith('postgres://')) {
  throw new Error('DATABASE_URL must be a valid PostgreSQL connection string');
}

// Parse the connection string to extract components
// Format: postgresql://user:password@host:port/database
const urlPattern = /^(?:postgresql|postgres):\/\/([^:]+):([^@]+)@([^:]+):(\d+)\/(.+)$/;
const match = cleanDatabaseUrl.match(urlPattern);

let pool: Pool;

if (match) {
  // Parse connection string components
  const [, user, password, host, port, database] = match;
  
  // Create pool with individual parameters to ensure password is a string
  pool = new Pool({
    user: decodeURIComponent(user),
    password: String(decodeURIComponent(password)),
    host: decodeURIComponent(host),
    port: parseInt(port, 10),
    database: decodeURIComponent(database),
  });
} else {
  // Fallback to connection string if parsing fails
  pool = new Pool({
    connectionString: cleanDatabaseUrl,
  });
}

// Handle pool errors
pool.on('error', (err) => {
  console.error('Unexpected error on idle PostgreSQL client', err);
});

// Create the Prisma adapter
const adapter = new PrismaPg(pool);

export const prisma = globalForPrisma.prisma || new PrismaClient({
  adapter,
  log: process.env.NODE_ENV === 'production' 
    ? ['error'] 
    : ['query', 'error', 'warn'],
  errorFormat: 'pretty',
});

if (process.env.NODE_ENV !== 'production') globalForPrisma.prisma = prisma;

export default prisma;