import NextAuth from "next-auth";
import CredentialsProvider from "next-auth/providers/credentials";
import connectToDatabase from "../../../../lib/mongodb";
import User from "../../../../models/User";
import { buildRollNoRegex, normalizeRollNo } from "../../../../lib/rollNo";
import { hashPassword, verifyPassword } from "../../../../lib/security/password";
import {
  clearRateLimit,
  consumeRateLimit,
  getTrustedClientIp,
  hashRateLimitIdentifier,
  isRateLimitExceeded,
} from "../../../../lib/rateLimit";
import {
  isPortalActivityActorRole,
  recordPortalActivity,
} from '../../../../lib/portalActivityLog';
import { getPortalPause } from '../../../../lib/portalPause';
import {
  isVivaSessionAccessRestricted,
  VIVA_ACTIVE_SESSION_ACCESS_ERROR,
} from '../../../../lib/vivaAccessRestriction';

const LOGIN_ATTEMPT_LIMIT = 5;
const LOGIN_IP_ATTEMPT_LIMIT = 25;

const handler = NextAuth({
  providers: [
    CredentialsProvider({
      name: "Credentials",
      credentials: {
        rollNo: { label: "Roll No", type: "text" },
        password: { label: "Password", type: "password" }
      },
      async authorize(credentials, request) {
        const portal = await getPortalPause();
        await connectToDatabase();

        const normalizedRollNo = normalizeRollNo(credentials?.rollNo);
        const password = credentials?.password || "";

        if (!normalizedRollNo || !password) {
          throw new Error("Invalid roll number or password.");
        }
        const loginRateLimitIdentifier = `login:account:${hashRateLimitIdentifier(normalizedRollNo)}`;
        const clientIp = getTrustedClientIp(new Headers(request.headers as HeadersInit));
        const loginIpRateLimitIdentifier = clientIp
          ? `login:ip:${hashRateLimitIdentifier(clientIp)}`
          : null;

        if (
          await isRateLimitExceeded(loginRateLimitIdentifier, LOGIN_ATTEMPT_LIMIT)
          || (loginIpRateLimitIdentifier
            && await isRateLimitExceeded(loginIpRateLimitIdentifier, LOGIN_IP_ATTEMPT_LIMIT))
        ) {
          throw new Error('Too many login attempts. Please try again in 15 minutes.');
        }

        const denyLogin = async () => {
          const [accountRateLimit, ipRateLimit] = await Promise.all([
            consumeRateLimit(loginRateLimitIdentifier, LOGIN_ATTEMPT_LIMIT),
            loginIpRateLimitIdentifier
              ? consumeRateLimit(loginIpRateLimitIdentifier, LOGIN_IP_ATTEMPT_LIMIT)
              : Promise.resolve(null),
          ]);
          if (!accountRateLimit.allowed || ipRateLimit?.allowed === false) {
            throw new Error('Too many login attempts. Please try again in 15 minutes.');
          }
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
        
        if (user.isActive === false) {
          await denyLogin();
        }
        
        const passwordCheck = await verifyPassword(password, user.password);

        if (!passwordCheck.matches) {
          await denyLogin();
        }

        if (await isVivaSessionAccessRestricted(user._id.toString())) {
          throw new Error(VIVA_ACTIVE_SESSION_ACCESS_ERROR);
        }

        if (passwordCheck.needsRehash) {
          user.password = await hashPassword(password);
          await user.save();
        }

        await clearRateLimit(loginRateLimitIdentifier);
        
        const currentMonth = new Date().toISOString().slice(0, 7);

        if (user.lastLoginMonth === currentMonth) {
          await User.findByIdAndUpdate(user._id, { $inc: { monthlyLoginCount: 1 } });
        } else {
          await User.findByIdAndUpdate(user._id, { $set: { monthlyLoginCount: 1, lastLoginMonth: currentMonth } });
        }

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
          role: user.role,
          sessionVersion: Number(user.sessionVersion || 0),
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
        token.sessionVersion = user.sessionVersion;
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
    maxAge: 8 * 60 * 60,
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

export { handler as GET, handler as POST };
