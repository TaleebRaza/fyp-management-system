import mongoose from 'mongoose';

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
  const mongodbUri = process.env.MONGODB_URI;
  if (!mongodbUri) {
    throw new Error('Please define the MONGODB_URI environment variable inside .env.local');
  }

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
      // Production indexes are reviewed and applied by the guarded index scripts.
      autoIndex: process.env.NODE_ENV !== 'production',
    };

    cached.promise = mongoose.connect(mongodbUri, opts).then((mongoose) => {
      console.log("✅ Successfully connected to MongoDB with optimized serverless pooling!");
      return mongoose;
    }).catch((error) => {
      console.error("❌ MongoDB connection pool initialization failed:", error);
      cached.promise = null; // Reset cache so subsequent invocations can retry cleanly
      throw error;
    });
  }
  
  cached.conn = await cached.promise;
  return cached.conn;
}

export default connectToDatabase;
