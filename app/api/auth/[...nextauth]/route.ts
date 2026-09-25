import NextAuth from "next-auth";
import CredentialsProvider from "next-auth/providers/credentials";
import connectToDatabase from "../../../../lib/mongodb";
import User from "../../../../models/User";
import { buildRollNoRegex, normalizeRollNo } from "../../../../lib/rollNo";
import { hashPassword, verifyPassword } from "../../../../lib/security/password";
import {
  clearRateLimit,
  consumeRateLimit,
  getLoginRateLimitStatus,
  getTrustedClientIp,
  hashRateLimitIdentifier,
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

async function measureLoginPhase<T>(
  phases: Record<string, number>,
  name: string,
  operation: () => Promise<T>
) {
  const startedAt = performance.now();
  try {
    return await operation();
  } finally {
    phases[name] = (phases[name] || 0) + performance.now() - startedAt;
  }
}

function logLoginPhases(startedAt: number, phases: Record<string, number>, outcome: string) {
  if (process.env.LOGIN_PHASE_TIMINGS !== '1') return;
  console.info('login_phase_timing', JSON.stringify({
    outcome,
    totalMs: Number((performance.now() - startedAt).toFixed(2)),
    phases: Object.fromEntries(
      Object.entries(phases).map(([name, duration]) => [name, Number(duration.toFixed(2))])
    ),
  }));
}

const handler = NextAuth({
  providers: [
    CredentialsProvider({
      name: "Credentials",
      credentials: {
        rollNo: { label: "Roll No", type: "text" },
        password: { label: "Password", type: "password" }
      },
      async authorize(credentials, request) {
        const startedAt = performance.now();
        const phases: Record<string, number> = {};
        let outcome = 'rejected';
        try {
          const [portal] = await measureLoginPhase(phases, 'statusConnection', () => Promise.all([
            getPortalPause(),
            connectToDatabase(),
          ]));

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

          const rateLimitStatus = await measureLoginPhase(phases, 'limits', () =>
            getLoginRateLimitStatus(
              loginRateLimitIdentifier,
              LOGIN_ATTEMPT_LIMIT,
              loginIpRateLimitIdentifier,
              LOGIN_IP_ATTEMPT_LIMIT
            )
          );
          if (rateLimitStatus.accountExceeded || rateLimitStatus.ipExceeded) {
            throw new Error('Too many login attempts. Please try again in 15 minutes.');
          }

          const denyLogin = async () => {
            const [accountRateLimit, ipRateLimit] = await measureLoginPhase(phases, 'limits', () =>
              Promise.all([
                consumeRateLimit(loginRateLimitIdentifier, LOGIN_ATTEMPT_LIMIT),
                loginIpRateLimitIdentifier
                  ? consumeRateLimit(loginIpRateLimitIdentifier, LOGIN_IP_ATTEMPT_LIMIT)
                  : Promise.resolve(null),
              ])
            );
            if (!accountRateLimit.allowed || ipRateLimit?.allowed === false) {
              throw new Error('Too many login attempts. Please try again in 15 minutes.');
            }
            throw new Error('Invalid roll number or password.');
          };

          const user = await measureLoginPhase(phases, 'userLookup', async () => {
            let matchedUser = await User.findOne({ rollNo: normalizedRollNo })
              .select('_id +password role isActive name rollNo sessionVersion');

            // ponytail: fallback supports legacy rows that were saved with trailing spaces or mixed case.
            if (!matchedUser) {
              matchedUser = await User.findOne({ rollNo: buildRollNoRegex(normalizedRollNo) })
                .select('_id +password role isActive name rollNo sessionVersion');
            }
            return matchedUser;
          });

          if (!user) {
            await denyLogin();
          }

          if (portal.paused && user.role !== 'admin') {
            throw new Error(portal.reason);
          }

          if (user.isActive === false) {
            await denyLogin();
          }

          const verifiedPasswordHash = user.password;
          const verifiedSessionVersion = Number(user.sessionVersion || 0);
          const passwordCheck = await measureLoginPhase(phases, 'passwordVerification', () =>
            verifyPassword(password, verifiedPasswordHash)
          );

          if (!passwordCheck.matches) {
            await denyLogin();
          }

          const vivaAccessRestricted = await measureLoginPhase(phases, 'restriction', () =>
            isVivaSessionAccessRestricted(user._id.toString())
          );
          if (vivaAccessRestricted) {
            throw new Error(VIVA_ACTIVE_SESSION_ACCESS_ERROR);
          }

          await measureLoginPhase(phases, 'successfulLoginWrites', async () => {
            if (passwordCheck.needsRehash) {
              const rehashedPassword = await hashPassword(password, { enforceLengthPolicy: false });
              await User.updateOne(
                {
                  _id: user._id,
                  password: verifiedPasswordHash,
                  sessionVersion: verifiedSessionVersion,
                },
                { $set: { password: rehashedPassword } }
              );
            }

            const currentMonth = new Date().toISOString().slice(0, 7);
            const activityWrite = isPortalActivityActorRole(user.role)
              ? recordPortalActivity({
                action: 'login',
                actorId: user._id.toString(),
                actorRole: user.role,
                actorName: user.name,
                actorRollNo: user.rollNo,
              })
              : Promise.resolve();

            await Promise.all([
              clearRateLimit(loginRateLimitIdentifier),
              User.updateOne(
                { _id: user._id },
                [{
                  $set: {
                    monthlyLoginCount: {
                      $cond: [
                        { $eq: ['$lastLoginMonth', currentMonth] },
                        { $add: [{ $ifNull: ['$monthlyLoginCount', 0] }, 1] },
                        1,
                      ],
                    },
                    lastLoginMonth: currentMonth,
                  },
                }],
                { updatePipeline: true }
              ),
              activityWrite,
            ]);
          });
          outcome = 'accepted';
          return {
            id: user._id.toString(),
            name: user.name,
            rollNo: user.rollNo,
            role: user.role,
            sessionVersion: verifiedSessionVersion,
          };
        } finally {
          logLoginPhases(startedAt, phases, outcome);
        }
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
