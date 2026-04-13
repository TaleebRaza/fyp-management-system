import mongoose from 'mongoose';

// Grab the secret connection string from our .env.local file
const MONGODB_URI = process.env.MONGODB_URI;

// If we forgot to put it in the file, throw a massive error to warn us
if (!MONGODB_URI) {
  throw new Error('Please define the MONGODB_URI environment variable inside .env.local');
}

// Memory cache to prevent reconnecting thousands of times in Next.js
let cached = (global as any).mongoose;

if (!cached) {
  cached = (global as any).mongoose = { conn: null, promise: null };
}

async function connectToDatabase() {
  // If we are already connected, just return the existing connection
  if (cached.conn) {
    return cached.conn;
  }

  // If we aren't connected yet, create a new connection
  if (!cached.promise) {
    cached.promise = mongoose.connect(MONGODB_URI as string).then((mongoose) => {
      console.log("✅ Successfully connected to MongoDB!");
      return mongoose;
    });
  }
  
  cached.conn = await cached.promise;
  return cached.conn;
}

export default connectToDatabase;