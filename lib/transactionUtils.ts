// lib/transactionUtils.ts
import mongoose, { ClientSession } from 'mongoose';

/**
 * Executes a MongoDB transaction with automatic retries for transient concurrency locks.
 * * @param session - The active mongoose ClientSession
 * @param transactionFunc - The async callback containing the database operations
 * @param maxRetries - Maximum number of times to retry before throwing (default: 3)
 */
export async function withTransactionRetry<T>(
  session: ClientSession,
  transactionFunc: () => Promise<T>,
  maxRetries: number = 3
): Promise<T> {
  let attempt = 0;

  while (attempt < maxRetries) {
    try {
      session.startTransaction();
      
      // Execute the user-provided logic
      const result = await transactionFunc();
      
      // Attempt to commit
      await session.commitTransaction();
      return result;
      
    } catch (error: any) {
      // Always abort the current failed transaction safely
      if (session.inTransaction()) {
        await session.abortTransaction();
      }

      // Check if this is a TransientTransactionError or a WriteConflict (112)
      const isTransient = error.hasErrorLabel && error.hasErrorLabel('TransientTransactionError');
      const isWriteConflict = error.code === 112;

      if ((isTransient || isWriteConflict) && attempt < maxRetries - 1) {
        attempt++;
        console.warn(`⚠️ WriteConflict detected. Retrying transaction (Attempt ${attempt + 1}/${maxRetries})...`);
        
        // Exponential backoff strategy (e.g., 100ms, 200ms, 400ms) to prevent the thundering herd problem
        const backoffDelay = Math.pow(2, attempt) * 50; 
        await new Promise(resolve => setTimeout(resolve, backoffDelay));
      } else {
        // If it's a regular error (e.g., validation failed) or we ran out of retries, throw it up the chain
        throw error;
      }
    }
  }
  
  // TypeScript safety net (execution should technically never reach here without throwing)
  throw new Error('Transaction failed after maximum retries');
}