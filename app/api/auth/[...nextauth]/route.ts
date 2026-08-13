import NextAuth from "next-auth";
import CredentialsProvider from "next-auth/providers/credentials";
import connectToDatabase from "../../../../lib/mongodb";
import User from "../../../../models/User";
import { buildRollNoRegex, normalizeRollNo } from "../../../../lib/rollNo";
import bcrypt from "bcryptjs"; // NEW: Secure cryptographic hashing library
import { isBcryptHash } from "../../../../lib/security/password";
import { consumeRateLimit, hashRateLimitIdentifier, isRateLimitExceeded } from "../../../../lib/rateLimit";
import {
  isPortalActivityActorRole,
  recordPortalActivity,
} from '../../../../lib/portalActivityLog';
import { getPortalPause } from '../../../../lib/portalPause';

const LOGIN_ATTEMPT_LIMIT = 5;

// --- HELPER: Backward-Compatible Verification ---
async function verifyPassword(inputPassword: string, storedPassword: string) {
  if (isBcryptHash(storedPassword)) {
    return { matches: await bcrypt.compare(inputPassword, storedPassword), isLegacy: false };
  }

  return { matches: inputPassword === storedPassword, isLegacy: true };
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
        const portal = await getPortalPause();
        await connectToDatabase();

        const normalizedRollNo = normalizeRollNo(credentials?.rollNo);
        const password = credentials?.password || "";

        if (!normalizedRollNo || !password) {
          throw new Error("Invalid roll number or password.");
        }
        const loginRateLimitIdentifier = `login:account:${hashRateLimitIdentifier(normalizedRollNo)}`;

        if (await isRateLimitExceeded(loginRateLimitIdentifier, LOGIN_ATTEMPT_LIMIT)) {
          throw new Error('Too many login attempts. Please try again in two hours.');
        }

        const denyLogin = async () => {
          const rateLimit = await consumeRateLimit(
            loginRateLimitIdentifier,
            LOGIN_ATTEMPT_LIMIT,
          );
          if (!rateLimit.allowed) throw new Error('Too many login attempts. Please try again in two hours.');
          throw new Error('Invalid roll number or password.');
        };

        let user = await User.findOne({ rollNo: normalizedRollNo }).select('+password');

        // ponytail: fallback supports legacy rows that were saved with trailing spaces or mixed case.
        if (!user) {
          user = await User.findOne({ rollNo: buildRollNoRegex(normalizedRollNo) }).select('+password');
        }

        if (!user) {
          await denyLogin();
        }

        if (portal.paused && user.role !== 'admin') {
          throw new Error(portal.reason);
        }
        
        // Security Lockout Check
        if (user.isActive === false) {
          await denyLogin();
        }
        
        // NEW: Utilize our smart verifier instead of direct string comparison
        const passwordCheck = await verifyPassword(password, user.password);

        if (!passwordCheck.matches) {
          await denyLogin();
        }

        if (passwordCheck.isLegacy) {
          user.password = await bcrypt.hash(password, 10);
          await user.save();
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

        if (isPortalActivityActorRole(user.role)) {
          await recordPortalActivity({
            action: 'login',
            actorId: user._id.toString(),
            actorRole: user.role,
            actorName: user.name,
            actorRollNo: user.rollNo,
          });
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
        token.role = user.role;
        token.rollNo = user.rollNo;
        token.name = user.name;
      }
      return token;
    },
    async session({ session, token }) {
      if (session.user) {
        session.user.id = token.id as string;
        session.user.role = token.role as string;
        session.user.rollNo = token.rollNo as string;
      }
      return session;
    }
  },
  session: {
    strategy: "jwt",
    // We can remove the hardcoded 2-hour maxAge, as the browser closure will now handle termination
  },
  events: {
    async signOut(message) {
      const token = 'token' in message ? message.token : null;
      if (!token || typeof token.id !== 'string' || !isPortalActivityActorRole(token.role)) return;

      await recordPortalActivity({
        action: 'logout',
        actorId: token.id,
        actorRole: token.role,
        actorName: typeof token.name === 'string' ? token.name : undefined,
        actorRollNo: token.rollNo,
      });
    },
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
export async function GET(
  req: Parameters<typeof handler>[0],
  context: Parameters<typeof handler>[1]
) {
  const response = await handler(req, context);
  return enforceBrowserSession(response);
}

export async function POST(
  req: Parameters<typeof handler>[0],
  context: Parameters<typeof handler>[1]
) {
  const response = await handler(req, context);
  return enforceBrowserSession(response);
}
