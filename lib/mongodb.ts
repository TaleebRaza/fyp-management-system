import mongoose from 'mongoose';
import { getMongoDbUri } from './runtimeConfig';

type MongooseCache = {
  conn: typeof mongoose | null;
  promise: Promise<typeof mongoose> | null;
};

// Memory cache to prevent reconnecting thousands of times in Next.js
const globalWithMongoose = global as typeof globalThis & { mongoose?: MongooseCache };
const cached: MongooseCache =
  globalWithMongoose.mongoose ||
  (globalWithMongoose.mongoose = { conn: null, promise: null });

async function connectToDatabase() {
  // If we are already connected, just return the existing connection
  if (cached.conn) {
    return cached.conn;
  }

  // If we aren't connected yet, create a new connection with strict pooling guardrails
  if (!cached.promise) {
    const opts = {
      bufferCommands: false, // Disable Mongoose buffering; fail fast if not connected
      maxPoolSize: 10,       // Strict ceiling to protect Atlas M0 500-connection limit
      minPoolSize: 1,        // Maintain one active socket per warm lambda
      serverSelectionTimeoutMS: 5000, // Timeout after 5s instead of hanging serverless threads
      socketTimeoutMS: 45000,         // Close inactive sockets cleanly
    };

    cached.promise = mongoose.connect(getMongoDbUri(), opts).then((mongoose) => {
      console.info('mongodb_connected');
      return mongoose;
    }).catch((error) => {
      void error;
      console.error('mongodb_connection_failed');
      cached.promise = null; // Reset cache so subsequent invocations can retry cleanly
      throw new Error('Database connection failed.');
    });
  }
  
  cached.conn = await cached.promise;
  return cached.conn;
}

export default connectToDatabase;
