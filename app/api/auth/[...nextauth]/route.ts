import NextAuth from "next-auth";
import CredentialsProvider from "next-auth/providers/credentials";
import connectToDatabase from "../../../../lib/mongodb";
import User from "../../../../models/User";

const handler = NextAuth({
  providers: [
    CredentialsProvider({
      name: "Credentials",
      credentials: {
        rollNo: { label: "Roll No", type: "text" },
        password: { label: "Password", type: "password" }
      },
      // This is the function that runs when someone clicks "Sign In"
      async authorize(credentials) {
        await connectToDatabase();
        
        // 1. Find the user in our MongoDB database
        const user = await User.findOne({ rollNo: credentials?.rollNo });
        
        if (!user) {
          throw new Error("No user found with this Roll Number");
        }
        
        // 2. Check the password
        // Note: For this MVP we are comparing plain text. Later, we will use bcrypt!
        if (user.password !== credentials?.password) {
          throw new Error("Incorrect password");
        }
        
        // 3. If successful, return the user data to create the session
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
    // This bakes the user's role and ID into their secure "wristband" (JWT Token)
    async jwt({ token, user }) {
      if (user) {
        token.id = user.id;
        token.role = (user as any).role;
        token.rollNo = (user as any).rollNo;
      }
      return token;
    },
    // This makes the token data available to our frontend React components
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
  },
  secret: process.env.NEXTAUTH_SECRET,
});

// Next.js App Router requires exporting the handler as both GET and POST
export { handler as GET, handler as POST };