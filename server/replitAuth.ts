import * as client from "openid-client";
import { Strategy, type VerifyFunction } from "openid-client/passport";

import passport from "passport";
import session from "express-session";
import type { Express, RequestHandler } from "express";
import memoize from "memoizee";
import connectPg from "connect-pg-simple";
import { UserRole } from "@shared/schema";
import { storage } from "./storage";

const replitDomains = (process.env.REPLIT_DOMAINS ?? "")
  .split(",")
  .map((domain) => domain.trim())
  .filter((domain) => domain.length > 0);

const replitAuthEnabled = replitDomains.length > 0;

const getOidcConfig = memoize(
  async () => {
    return await client.discovery(
      new URL(process.env.ISSUER_URL ?? "https://replit.com/oidc"),
      process.env.REPL_ID!
    );
  },
  { maxAge: 3600 * 1000 }
);

export function getSession() {
  const sessionTtl = 7 * 24 * 60 * 60 * 1000; // 1 week
  const pgStore = connectPg(session);
  const sessionStore = new pgStore({
    conString: process.env.DATABASE_URL,
    createTableIfMissing: false,
    ttl: sessionTtl,
    tableName: "sessions",
  });
  return session({
    secret: process.env.SESSION_SECRET!,
    store: sessionStore,
    resave: false,
    saveUninitialized: false,
    cookie: {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production', // Only secure in production
      maxAge: sessionTtl,
      sameSite: 'lax', // Add sameSite for better compatibility
    },
  });
}

function updateUserSession(
  user: any,
  tokens: client.TokenEndpointResponse & client.TokenEndpointResponseHelpers
) {
  user.claims = tokens.claims();
  user.access_token = tokens.access_token;
  user.refresh_token = tokens.refresh_token;
  user.expires_at = user.claims?.exp;
}

async function upsertUser(userData: any) {
  try {
    const result = await storage.upsertUser(userData);
    console.log('User upserted successfully:', result.id, result.email, result.role);
    return result;
  } catch (error) {
    console.error('Error upserting user:', error);
    throw error;
  }
}

export async function setupAuth(app: Express) {
  app.set("trust proxy", 1);
  app.use(getSession());
  app.use(passport.initialize());
  app.use(passport.session());

  if (!replitAuthEnabled) {
    const fallbackUserId = process.env.DEFAULT_ADMIN_ID ?? "local-admin";
    const fallbackEmail = process.env.DEFAULT_ADMIN_EMAIL ?? "admin@example.com";
    const fallbackFirstName = process.env.DEFAULT_ADMIN_FIRST_NAME ?? "Local";
    const fallbackLastName = process.env.DEFAULT_ADMIN_LAST_NAME ?? "Admin";

    const fallbackUser = await storage.upsertUser({
      id: fallbackUserId,
      email: fallbackEmail,
      firstName: fallbackFirstName,
      lastName: fallbackLastName,
      profileImageUrl: null,
      role: UserRole.ADMIN,
    });

    console.warn(
      "REPLIT_DOMAINS not set. Falling back to a local admin session for development and Docker environments."
    );

    app.use((req, _res, next) => {
      const claims = {
        sub: fallbackUser.id,
        email: fallbackUser.email,
        first_name: fallbackUser.firstName ?? fallbackFirstName,
        last_name: fallbackUser.lastName ?? fallbackLastName,
      };

      (req as any).user = {
        id: fallbackUser.id,
        claims,
        expires_at: Math.floor(Date.now() / 1000) + 60 * 60 * 24 * 365,
      };
      (req as any).isAuthenticated = () => true;
      next();
    });

    app.get("/api/login", (_req, res) => {
      res.json({
        message: "Replit SSO disabled. Using local admin session.",
        user: {
          id: fallbackUser.id,
          email: fallbackUser.email,
        },
      });
    });

    app.get("/api/callback", (_req, res) => {
      res.redirect("/");
    });

    app.get("/api/logout", (_req, res) => {
      res.json({ message: "Replit SSO disabled. Logout is a no-op." });
    });

    return;
  }

  const config = await getOidcConfig();

  const verify: VerifyFunction = async (
    tokens: client.TokenEndpointResponse & client.TokenEndpointResponseHelpers,
    verified: passport.AuthenticateCallback
  ) => {
    try {
      const claims = tokens.claims();
      console.log('OAuth verification for user:', claims?.sub, claims?.email);
      
      const user = {};
      updateUserSession(user, tokens);
      
      // Ensure the user is created/updated with proper role
      if (claims) {
        await upsertUser({
          id: claims["sub"],
          email: claims["email"],
          firstName: claims["first_name"],
          lastName: claims["last_name"],
          profileImageUrl: claims["profile_image_url"],
          role: "user", // Explicitly set role for new users
        });
      } else {
        throw new Error("No claims found in tokens");
      }
      
      console.log('User successfully authenticated and upserted');
      verified(null, user);
    } catch (error) {
      console.error('Error during OAuth verification:', error);
      verified(error, null);
    }
  };

  for (const domain of replitDomains) {
    const strategy = new Strategy(
      {
        name: `replitauth:${domain}`,
        config,
        scope: "openid email profile offline_access",
        callbackURL: `https://${domain}/api/callback`,
      },
      verify,
    );
    passport.use(strategy);
  }

  passport.serializeUser((user: Express.User, cb) => cb(null, user));
  passport.deserializeUser((user: Express.User, cb) => cb(null, user));

  app.get("/api/login", (req, res, next) => {
    const domain = replitDomains[0];
    passport.authenticate(`replitauth:${domain}`, {
      prompt: "login consent",
      scope: ["openid", "email", "profile", "offline_access"],
    })(req, res, next);
  });

  app.get("/api/callback", (req, res, next) => {
    const domain = replitDomains[0];
    passport.authenticate(`replitauth:${domain}`, {
      successReturnToOrRedirect: "/",
      failureRedirect: "/api/login",
    })(req, res, next);
  });

  app.get("/api/logout", (req, res) => {
    const domain = replitDomains[0];
    req.logout(() => {
      res.redirect(
        client.buildEndSessionUrl(config, {
          client_id: process.env.REPL_ID!,
          post_logout_redirect_uri: `https://${domain}`,
        }).href
      );
    });
  });
}

export const isAuthenticated: RequestHandler = async (req, res, next) => {
  const user = req.user as any;

  if (!req.isAuthenticated() || !user?.expires_at) {
    return res.status(401).json({ message: "Unauthorized" });
  }

  const now = Math.floor(Date.now() / 1000);
  if (now <= user.expires_at) {
    return next();
  }

  // For manually created users (impersonation), skip token refresh
  if (user.id && !user.refresh_token) {
    return next();
  }

  const refreshToken = user.refresh_token;
  if (!refreshToken) {
    res.status(401).json({ message: "Unauthorized" });
    return;
  }

  try {
    const config = await getOidcConfig();
    const tokenResponse = await client.refreshTokenGrant(config, refreshToken);
    updateUserSession(user, tokenResponse);
    return next();
  } catch (error) {
    res.status(401).json({ message: "Unauthorized" });
    return;
  }
};
