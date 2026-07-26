import mongoose from 'mongoose';

// Grab the secret connection string from our .env.local file
const MONGODB_URI = process.env.MONGODB_URI;

// If we forgot to put it in the file, throw a massive error to warn us
if (!MONGODB_URI) {
  throw new Error('Please define the MONGODB_URI environment variable inside .env.local');
}

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

    cached.promise = mongoose.connect(MONGODB_URI as string, opts).then((mongoose) => {
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
