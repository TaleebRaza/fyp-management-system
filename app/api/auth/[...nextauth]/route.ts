import NextAuth from "next-auth";
import CredentialsProvider from "next-auth/providers/credentials";
import type { NextRequest } from "next/server";
import connectToDatabase from "../../../../lib/mongodb";
import User from "../../../../models/User";
import { buildRollNoRegex, normalizeRollNo } from "../../../../lib/rollNo";
import bcrypt from "bcryptjs"; // NEW: Secure cryptographic hashing library

// --- HELPER: Backward-Compatible Verification ---
async function verifyPassword(inputPassword: string, storedPassword: string) {
  // Standard bcrypt hashes always start with "$2a$", "$2b$", or "$2y$" and are 60 chars long.
  const isHashed = storedPassword.startsWith('$2') && storedPassword.length === 60;
  
  if (isHashed) {
    // If securely hashed, use cryptographic comparison
    return await bcrypt.compare(inputPassword, storedPassword);
  } else {
    // Legacy Fallback: Allow existing plaintext users to still log in
    return inputPassword === storedPassword;
  }
}

const handler = NextAuth({
  providers: [
    CredentialsProvider({
      name: "Credentials",
      credentials: {
        rollNo: { label: "Roll No", type: "text" },
        password: { label: "Password", type: "password" }
      },
      async authorize(credentials) {
        await connectToDatabase();

        const normalizedRollNo = normalizeRollNo(credentials?.rollNo);

        if (!normalizedRollNo) {
          throw new Error("Roll Number is required");
        }
        
        let user = await User.findOne({ rollNo: normalizedRollNo });

        // ponytail: fallback supports legacy rows that were saved with trailing spaces or mixed case.
        if (!user) {
          user = await User.findOne({ rollNo: buildRollNoRegex(normalizedRollNo) });
        }
        
        if (!user) {
          throw new Error("No user found with this Roll Number");
        }
        
        // Security Lockout Check
        if (user.isActive === false) {
          throw new Error("Your account has been deactivated. Contact administration.");
        }
        
        // NEW: Utilize our smart verifier instead of direct string comparison
        const isPasswordMatch = await verifyPassword(credentials?.password || "", user.password);
        
        if (!isPasswordMatch) {
          throw new Error("Incorrect password");
        }
        
        // --- OPTIMIZATION: Lazy Login Counter ---
        // Generates a strict "YYYY-MM" string (e.g., "2026-05")
        const currentMonth = new Date().toISOString().slice(0, 7); 
        
        if (user.lastLoginMonth === currentMonth) {
          // It is the same month: Increment the tally
          await User.findByIdAndUpdate(user._id, { $inc: { monthlyLoginCount: 1 } });
        } else {
          // It is a new month (or their first login): Reset to 1 and stamp the new month
          await User.findByIdAndUpdate(user._id, { $set: { monthlyLoginCount: 1, lastLoginMonth: currentMonth } });
        }
        // ----------------------------------------
        
        return {
          id: user._id.toString(),
          name: user.name,
          rollNo: user.rollNo,
          role: user.role
        };
      }
    })
  ],
  callbacks: {
    async jwt({ token, user }) {
      if (user) {
        token.id = user.id;
        token.role = user.role;
        token.rollNo = user.rollNo;
      }
      return token;
    },
    async session({ session, token }) {
      if (session.user) {
        session.user.id = token.id;
        session.user.role = token.role;
        session.user.rollNo = token.rollNo;
      }
      return session;
    }
  },
  session: {
    strategy: "jwt",
    // We can remove the hardcoded 2-hour maxAge, as the browser closure will now handle termination
  },
  secret: process.env.NEXTAUTH_SECRET,
});

type NextAuthRouteContext = {
  params: Promise<{ nextauth: string[] }>;
};

// --- ARCHITECT-AI: TRUE BROWSER SESSION OVERRIDE ---
// Intercept the NextAuth response and strip the explicit expiration dates.
// This forces the browser to treat the token as a RAM-only session cookie.
function enforceBrowserSession(response: Response) {
  // Create a mutable copy of the response
  const modifiedResponse = new Response(response.body, response);
  
  // Extract all cookies NextAuth is trying to set
  const cookies = modifiedResponse.headers.getSetCookie();
  modifiedResponse.headers.delete('set-cookie');
  
  // Re-apply the cookies, but surgically remove the Max-Age and Expires attributes
  cookies.forEach(cookie => {
    const sessionOnlyCookie = cookie
      .replace(/;\s*Max-Age=[0-9]+/i, '')
      .replace(/;\s*Expires=[^;]+/i, '');
    modifiedResponse.headers.append('set-cookie', sessionOnlyCookie);
  });
  
  return modifiedResponse;
}

// We must pass the "context" object so NextAuth knows the exact route parameters
export async function GET(req: NextRequest, context: NextAuthRouteContext) {
  const response = await handler(req, context);
  return enforceBrowserSession(response);
}

export async function POST(req: NextRequest, context: NextAuthRouteContext) {
  const response = await handler(req, context);
  return enforceBrowserSession(response);
}
