import NextAuth from "next-auth";
import CredentialsProvider from "next-auth/providers/credentials";
import connectToDatabase from "../../../../lib/mongodb";
import User from "../../../../models/User";
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
        
        const user = await User.findOne({ rollNo: credentials?.rollNo });
        
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
        token.role = (user as any).role;
        token.rollNo = (user as any).rollNo;
      }
      return token;
    },
    async session({ session, token }) {
      if (session.user) {
        (session.user as any).id = token.id;
        (session.user as any).role = token.role;
        (session.user as any).rollNo = token.rollNo;
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
export async function GET(req: Request, context: any) {
  const response = await handler(req as any, context);
  return enforceBrowserSession(response);
}

export async function POST(req: Request, context: any) {
  const response = await handler(req as any, context);
  return enforceBrowserSession(response);
}