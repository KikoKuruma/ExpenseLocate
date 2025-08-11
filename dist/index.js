var __defProp = Object.defineProperty;
var __export = (target, all) => {
  for (var name in all)
    __defProp(target, name, { get: all[name], enumerable: true });
};

// server/index.ts
import express3 from "express";

// server/routes.ts
import express from "express";
import { createServer } from "http";
import multer from "multer";
import path from "path";

// shared/schema.ts
var schema_exports = {};
__export(schema_exports, {
  UserRole: () => UserRole,
  categories: () => categories,
  categoryRelations: () => categoryRelations,
  expenses: () => expenses,
  hasPermission: () => hasPermission,
  insertCategorySchema: () => insertCategorySchema,
  insertExpenseSchema: () => insertExpenseSchema,
  insertUserSchema: () => insertUserSchema,
  sessions: () => sessions,
  users: () => users
});
import { sql } from "drizzle-orm";
import {
  index,
  jsonb,
  pgTable,
  timestamp,
  varchar,
  text,
  decimal
} from "drizzle-orm/pg-core";
import { relations } from "drizzle-orm";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod";
var sessions = pgTable(
  "sessions",
  {
    sid: varchar("sid").primaryKey(),
    sess: jsonb("sess").notNull(),
    expire: timestamp("expire").notNull()
  },
  (table) => [index("IDX_session_expire").on(table.expire)]
);
var users = pgTable("users", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  email: varchar("email").unique(),
  firstName: varchar("first_name"),
  lastName: varchar("last_name"),
  profileImageUrl: varchar("profile_image_url"),
  role: varchar("role", { length: 20 }).notNull().default("user"),
  // user, approver, admin
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow()
});
var categories = pgTable("categories", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  name: varchar("name", { length: 100 }).notNull(),
  description: text("description"),
  parentId: varchar("parent_id"),
  color: varchar("color", { length: 7 }).default("#6366F1"),
  // Default to indigo color
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow()
});
var expenses = pgTable("expenses", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  userId: varchar("user_id").notNull().references(() => users.id),
  submittedBy: varchar("submitted_by").references(() => users.id),
  // null if self-submitted, otherwise the manager who submitted it
  categoryId: varchar("category_id").notNull().references(() => categories.id),
  description: text("description").notNull(),
  amount: decimal("amount", { precision: 10, scale: 2 }).notNull(),
  date: timestamp("date").notNull(),
  status: varchar("status", { length: 20 }).notNull().default("pending"),
  // pending, approved, rejected
  receiptUrl: varchar("receipt_url"),
  notes: text("notes"),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow()
});
var insertUserSchema = createInsertSchema(users).omit({
  id: true,
  createdAt: true,
  updatedAt: true
});
var insertCategorySchema = createInsertSchema(categories).omit({
  id: true,
  createdAt: true,
  updatedAt: true
});
var insertExpenseSchema = createInsertSchema(expenses).omit({
  id: true,
  createdAt: true,
  updatedAt: true
}).extend({
  amount: z.coerce.number()
});
var UserRole = {
  USER: "user",
  APPROVER: "approver",
  ADMIN: "admin"
};
var hasPermission = (userRole, requiredRole) => {
  const roleHierarchy = { user: 0, approver: 1, admin: 2 };
  return roleHierarchy[userRole] >= roleHierarchy[requiredRole];
};
var categoryRelations = relations(categories, ({ one, many }) => ({
  parent: one(categories, {
    fields: [categories.parentId],
    references: [categories.id],
    relationName: "subcategories"
  }),
  subcategories: many(categories, { relationName: "subcategories" })
}));

// server/db.ts
import { Pool, neonConfig } from "@neondatabase/serverless";
import { drizzle } from "drizzle-orm/neon-serverless";
import ws from "ws";
neonConfig.webSocketConstructor = ws;
if (!process.env.DATABASE_URL) {
  throw new Error(
    "DATABASE_URL must be set. Did you forget to provision a database?"
  );
}
var pool = new Pool({ connectionString: process.env.DATABASE_URL });
var db = drizzle({ client: pool, schema: schema_exports });

// server/storage.ts
import { eq, desc, and, sql as sql2, ilike } from "drizzle-orm";
import { alias } from "drizzle-orm/pg-core";
var DatabaseStorage = class {
  // User operations
  async getUser(id) {
    const [user] = await db.select().from(users).where(eq(users.id, id));
    return user;
  }
  async getUserByEmail(email) {
    const [user] = await db.select().from(users).where(eq(users.email, email));
    return user;
  }
  async getAllUsers() {
    return await db.select().from(users).orderBy(users.firstName, users.lastName);
  }
  async upsertUser(userData) {
    const [user] = await db.insert(users).values(userData).onConflictDoUpdate({
      target: users.id,
      set: {
        ...userData,
        updatedAt: /* @__PURE__ */ new Date()
      }
    }).returning();
    return user;
  }
  async createManualUser(userData, password) {
    const [user] = await db.insert(users).values({
      ...userData,
      // Note: In production, hash the password with bcrypt before storing
      // For now, we'll add a comment to indicate this is a manual account
      createdAt: /* @__PURE__ */ new Date(),
      updatedAt: /* @__PURE__ */ new Date()
    }).returning();
    return user;
  }
  async updateUserRole(id, role) {
    const [user] = await db.update(users).set({
      role,
      updatedAt: /* @__PURE__ */ new Date()
    }).where(eq(users.id, id)).returning();
    return user;
  }
  // Category operations
  async getCategories() {
    const allCategories = await db.select().from(categories).orderBy(categories.name);
    const categoryMap = /* @__PURE__ */ new Map();
    const topLevelCategories = [];
    allCategories.forEach((category) => {
      categoryMap.set(category.id, {
        ...category,
        subcategories: []
      });
    });
    allCategories.forEach((category) => {
      const categoryWithSubs = categoryMap.get(category.id);
      if (category.parentId) {
        const parent = categoryMap.get(category.parentId);
        if (parent) {
          parent.subcategories.push(categoryWithSubs);
        }
      } else {
        topLevelCategories.push(categoryWithSubs);
      }
    });
    return topLevelCategories;
  }
  async createCategory(category) {
    const [newCategory] = await db.insert(categories).values(category).returning();
    return newCategory;
  }
  async updateCategory(id, category) {
    const [updatedCategory] = await db.update(categories).set({ ...category, updatedAt: /* @__PURE__ */ new Date() }).where(eq(categories.id, id)).returning();
    return updatedCategory;
  }
  async deleteCategory(id) {
    await db.delete(categories).where(eq(categories.id, id));
  }
  // Expense operations
  async getExpenses(userId, filters) {
    const submittedByAlias = alias(users, "submittedByUser");
    let query = db.select({
      id: expenses.id,
      userId: expenses.userId,
      submittedBy: expenses.submittedBy,
      categoryId: expenses.categoryId,
      description: expenses.description,
      amount: expenses.amount,
      date: expenses.date,
      status: expenses.status,
      receiptUrl: expenses.receiptUrl,
      notes: expenses.notes,
      createdAt: expenses.createdAt,
      updatedAt: expenses.updatedAt,
      category: categories,
      user: {
        firstName: users.firstName,
        lastName: users.lastName,
        email: users.email
      },
      submittedByUser: {
        firstName: submittedByAlias.firstName,
        lastName: submittedByAlias.lastName,
        email: submittedByAlias.email
      }
    }).from(expenses).leftJoin(categories, eq(expenses.categoryId, categories.id)).leftJoin(users, eq(expenses.userId, users.id)).leftJoin(submittedByAlias, eq(expenses.submittedBy, submittedByAlias.id)).orderBy(desc(expenses.createdAt));
    const conditions = [];
    if (userId) {
      conditions.push(eq(expenses.userId, userId));
    }
    if (filters?.status) {
      conditions.push(eq(expenses.status, filters.status));
    }
    if (filters?.categoryId) {
      conditions.push(eq(expenses.categoryId, filters.categoryId));
    }
    if (filters?.search) {
      conditions.push(ilike(expenses.description, `%${filters.search}%`));
    }
    if (conditions.length > 0) {
      query = query.where(and(...conditions));
    }
    const results = await query;
    return results.map((result) => ({
      ...result,
      category: result.category || { id: "", name: "Unknown", description: null, parentId: null, color: null, createdAt: null, updatedAt: null },
      user: result.user || { firstName: null, lastName: null, email: null },
      submittedByUser: result.submittedByUser?.firstName ? result.submittedByUser : void 0
    }));
  }
  async getRecentUserExpenses(userId, limit) {
    const submittedByAlias = alias(users, "submittedByUser");
    const results = await db.select({
      id: expenses.id,
      userId: expenses.userId,
      submittedBy: expenses.submittedBy,
      categoryId: expenses.categoryId,
      description: expenses.description,
      amount: expenses.amount,
      date: expenses.date,
      status: expenses.status,
      receiptUrl: expenses.receiptUrl,
      notes: expenses.notes,
      createdAt: expenses.createdAt,
      updatedAt: expenses.updatedAt,
      category: categories,
      user: {
        firstName: users.firstName,
        lastName: users.lastName,
        email: users.email
      },
      submittedByUser: {
        firstName: submittedByAlias.firstName,
        lastName: submittedByAlias.lastName,
        email: submittedByAlias.email
      }
    }).from(expenses).leftJoin(categories, eq(expenses.categoryId, categories.id)).leftJoin(users, eq(expenses.userId, users.id)).leftJoin(submittedByAlias, eq(expenses.submittedBy, submittedByAlias.id)).where(eq(expenses.userId, userId)).orderBy(desc(expenses.createdAt)).limit(limit);
    return results.map((result) => ({
      ...result,
      category: result.category || { id: "", name: "Unknown", description: null, parentId: null, color: null, createdAt: null, updatedAt: null },
      user: result.user || { firstName: null, lastName: null, email: null },
      submittedByUser: result.submittedByUser?.firstName ? result.submittedByUser : void 0
    }));
  }
  async getPendingExpenses() {
    const submittedByAlias = alias(users, "submittedByUser");
    const results = await db.select({
      id: expenses.id,
      userId: expenses.userId,
      submittedBy: expenses.submittedBy,
      categoryId: expenses.categoryId,
      description: expenses.description,
      amount: expenses.amount,
      date: expenses.date,
      status: expenses.status,
      receiptUrl: expenses.receiptUrl,
      notes: expenses.notes,
      createdAt: expenses.createdAt,
      updatedAt: expenses.updatedAt,
      category: categories,
      user: {
        firstName: users.firstName,
        lastName: users.lastName,
        email: users.email
      },
      submittedByUser: {
        firstName: submittedByAlias.firstName,
        lastName: submittedByAlias.lastName,
        email: submittedByAlias.email
      }
    }).from(expenses).leftJoin(categories, eq(expenses.categoryId, categories.id)).leftJoin(users, eq(expenses.userId, users.id)).leftJoin(submittedByAlias, eq(expenses.submittedBy, submittedByAlias.id)).where(eq(expenses.status, "pending")).orderBy(desc(expenses.createdAt));
    return results.map((result) => ({
      ...result,
      category: result.category || { id: "", name: "Unknown", description: null, parentId: null, color: null, createdAt: null, updatedAt: null },
      user: result.user || { firstName: null, lastName: null, email: null },
      submittedByUser: result.submittedByUser?.firstName ? result.submittedByUser : void 0
    }));
  }
  async getExpenseById(id) {
    const submittedByAlias = alias(users, "submittedByUser");
    const [result] = await db.select({
      id: expenses.id,
      userId: expenses.userId,
      submittedBy: expenses.submittedBy,
      categoryId: expenses.categoryId,
      description: expenses.description,
      amount: expenses.amount,
      date: expenses.date,
      status: expenses.status,
      receiptUrl: expenses.receiptUrl,
      notes: expenses.notes,
      createdAt: expenses.createdAt,
      updatedAt: expenses.updatedAt,
      category: categories,
      user: {
        firstName: users.firstName,
        lastName: users.lastName,
        email: users.email
      },
      submittedByUser: {
        firstName: submittedByAlias.firstName,
        lastName: submittedByAlias.lastName,
        email: submittedByAlias.email
      }
    }).from(expenses).leftJoin(categories, eq(expenses.categoryId, categories.id)).leftJoin(users, eq(expenses.userId, users.id)).leftJoin(submittedByAlias, eq(expenses.submittedBy, submittedByAlias.id)).where(eq(expenses.id, id));
    if (!result) return void 0;
    return {
      ...result,
      category: result.category || { id: "", name: "Unknown", description: null, parentId: null, color: null, createdAt: null, updatedAt: null },
      user: result.user || { firstName: null, lastName: null, email: null },
      submittedByUser: result.submittedByUser?.firstName ? result.submittedByUser : void 0
    };
  }
  async createExpense(expense) {
    const [newExpense] = await db.insert(expenses).values({
      ...expense,
      amount: expense.amount.toString()
    }).returning();
    return newExpense;
  }
  async updateExpense(id, expense) {
    const updateData = {
      ...expense,
      updatedAt: /* @__PURE__ */ new Date()
    };
    if (expense.amount !== void 0) {
      updateData.amount = expense.amount.toString();
    }
    const [updatedExpense] = await db.update(expenses).set(updateData).where(eq(expenses.id, id)).returning();
    return updatedExpense;
  }
  async updateExpenseStatus(id, status) {
    const [updatedExpense] = await db.update(expenses).set({
      status,
      updatedAt: /* @__PURE__ */ new Date()
    }).where(eq(expenses.id, id)).returning();
    return updatedExpense;
  }
  async deleteExpense(id) {
    await db.delete(expenses).where(eq(expenses.id, id));
  }
  // Stats operations
  async getExpensesByCategory(userId) {
    const results = await db.select({
      categoryId: expenses.categoryId,
      categoryName: categories.name,
      categoryColor: categories.color,
      totalAmount: sql2`COALESCE(SUM(CAST(${expenses.amount} AS DECIMAL)), 0)`,
      expenseCount: sql2`COUNT(*)`
    }).from(expenses).leftJoin(categories, eq(expenses.categoryId, categories.id)).where(eq(expenses.userId, userId)).groupBy(expenses.categoryId, categories.name, categories.color);
    return results.map((result) => ({
      categoryId: result.categoryId || "unknown",
      categoryName: result.categoryName || "Unknown Category",
      categoryColor: result.categoryColor,
      totalAmount: Number(result.totalAmount || 0),
      expenseCount: Number(result.expenseCount || 0)
    }));
  }
  async getMonthlyExpenses(userId) {
    const results = await db.select({
      month: sql2`TO_CHAR(${expenses.date}, 'YYYY-MM')`,
      totalAmount: sql2`COALESCE(SUM(CAST(${expenses.amount} AS DECIMAL)), 0)`,
      expenseCount: sql2`COUNT(*)`
    }).from(expenses).where(eq(expenses.userId, userId)).groupBy(sql2`TO_CHAR(${expenses.date}, 'YYYY-MM')`).orderBy(sql2`TO_CHAR(${expenses.date}, 'YYYY-MM') DESC`).limit(12);
    return results.map((result) => ({
      month: result.month || "Unknown",
      totalAmount: Number(result.totalAmount || 0),
      expenseCount: Number(result.expenseCount || 0)
    }));
  }
  async getExpenseStats(userId) {
    const now = /* @__PURE__ */ new Date();
    const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);
    const currentQuarter = Math.floor(now.getMonth() / 3);
    const startOfQuarter = new Date(now.getFullYear(), currentQuarter * 3, 1);
    const [
      quarterResult,
      pendingResult,
      approvedResult,
      thisMonthResult
    ] = await Promise.all([
      db.select({
        total: sql2`COALESCE(SUM(CAST(${expenses.amount} AS DECIMAL)), 0)`
      }).from(expenses).where(
        and(
          userId ? eq(expenses.userId, userId) : sql2`true`,
          sql2`${expenses.date} >= ${startOfQuarter}`
        )
      ),
      db.select({
        total: sql2`COALESCE(SUM(CAST(${expenses.amount} AS DECIMAL)), 0)`
      }).from(expenses).where(
        and(
          userId ? eq(expenses.userId, userId) : sql2`true`,
          eq(expenses.status, "pending")
        )
      ),
      db.select({
        total: sql2`COALESCE(SUM(CAST(${expenses.amount} AS DECIMAL)), 0)`
      }).from(expenses).where(
        and(
          userId ? eq(expenses.userId, userId) : sql2`true`,
          eq(expenses.status, "approved")
        )
      ),
      db.select({
        total: sql2`COALESCE(SUM(CAST(${expenses.amount} AS DECIMAL)), 0)`
      }).from(expenses).where(
        and(
          userId ? eq(expenses.userId, userId) : sql2`true`,
          sql2`${expenses.date} >= ${startOfMonth}`
        )
      )
    ]);
    return {
      currentQuarterExpenses: Number(quarterResult[0]?.total || 0),
      pendingExpenses: Number(pendingResult[0]?.total || 0),
      approvedExpenses: Number(approvedResult[0]?.total || 0),
      thisMonthExpenses: Number(thisMonthResult[0]?.total || 0)
    };
  }
};
var storage = new DatabaseStorage();

// server/replitAuth.ts
import * as client from "openid-client";
import { Strategy } from "openid-client/passport";
import passport from "passport";
import session from "express-session";
import memoize from "memoizee";
import connectPg from "connect-pg-simple";
if (!process.env.REPLIT_DOMAINS) {
  throw new Error("Environment variable REPLIT_DOMAINS not provided");
}
var getOidcConfig = memoize(
  async () => {
    return await client.discovery(
      new URL(process.env.ISSUER_URL ?? "https://replit.com/oidc"),
      process.env.REPL_ID
    );
  },
  { maxAge: 3600 * 1e3 }
);
function getSession() {
  const sessionTtl = 7 * 24 * 60 * 60 * 1e3;
  const pgStore = connectPg(session);
  const sessionStore = new pgStore({
    conString: process.env.DATABASE_URL,
    createTableIfMissing: false,
    ttl: sessionTtl,
    tableName: "sessions"
  });
  return session({
    secret: process.env.SESSION_SECRET,
    store: sessionStore,
    resave: false,
    saveUninitialized: false,
    cookie: {
      httpOnly: true,
      secure: true,
      maxAge: sessionTtl
    }
  });
}
function updateUserSession(user, tokens) {
  user.claims = tokens.claims();
  user.access_token = tokens.access_token;
  user.refresh_token = tokens.refresh_token;
  user.expires_at = user.claims?.exp;
}
async function upsertUser(claims) {
  await storage.upsertUser({
    id: claims["sub"],
    email: claims["email"],
    firstName: claims["first_name"],
    lastName: claims["last_name"],
    profileImageUrl: claims["profile_image_url"]
  });
}
async function setupAuth(app2) {
  app2.set("trust proxy", 1);
  app2.use(getSession());
  app2.use(passport.initialize());
  app2.use(passport.session());
  const config = await getOidcConfig();
  const verify = async (tokens, verified) => {
    const user = {};
    updateUserSession(user, tokens);
    await upsertUser(tokens.claims());
    verified(null, user);
  };
  for (const domain of process.env.REPLIT_DOMAINS.split(",")) {
    const strategy = new Strategy(
      {
        name: `replitauth:${domain}`,
        config,
        scope: "openid email profile offline_access",
        callbackURL: `https://${domain}/api/callback`
      },
      verify
    );
    passport.use(strategy);
  }
  passport.serializeUser((user, cb) => cb(null, user));
  passport.deserializeUser((user, cb) => cb(null, user));
  app2.get("/api/login", (req, res, next) => {
    const domain = process.env.REPLIT_DOMAINS.split(",")[0];
    passport.authenticate(`replitauth:${domain}`, {
      prompt: "login consent",
      scope: ["openid", "email", "profile", "offline_access"]
    })(req, res, next);
  });
  app2.get("/api/callback", (req, res, next) => {
    const domain = process.env.REPLIT_DOMAINS.split(",")[0];
    passport.authenticate(`replitauth:${domain}`, {
      successReturnToOrRedirect: "/",
      failureRedirect: "/api/login"
    })(req, res, next);
  });
  app2.get("/api/logout", (req, res) => {
    const domain = process.env.REPLIT_DOMAINS.split(",")[0];
    req.logout(() => {
      res.redirect(
        client.buildEndSessionUrl(config, {
          client_id: process.env.REPL_ID,
          post_logout_redirect_uri: `https://${domain}`
        }).href
      );
    });
  });
}
var isAuthenticated = async (req, res, next) => {
  const user = req.user;
  if (!req.isAuthenticated() || !user?.expires_at) {
    return res.status(401).json({ message: "Unauthorized" });
  }
  const now = Math.floor(Date.now() / 1e3);
  if (now <= user.expires_at) {
    return next();
  }
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

// server/middleware/permissions.ts
var requireRole = (requiredRole) => {
  return async (req, res, next) => {
    try {
      const currentUser = await storage.getUser(req.user.claims.sub);
      if (!currentUser) {
        return res.status(401).json({ message: "User not found" });
      }
      if (!hasPermission(currentUser.role, requiredRole)) {
        const roleNames = {
          user: "Basic User",
          approver: "Approver",
          admin: "Administrator"
        };
        return res.status(403).json({
          message: `${roleNames[requiredRole]} access required`
        });
      }
      req.currentUser = currentUser;
      next();
    } catch (error) {
      console.error("Error checking permissions:", error);
      res.status(500).json({ message: "Failed to verify permissions" });
    }
  };
};
var requireAdmin = requireRole(UserRole.ADMIN);
var requireApprover = requireRole(UserRole.APPROVER);

// server/routes.ts
import { ZodError } from "zod";
var upload = multer({
  dest: "uploads/",
  limits: {
    fileSize: 10 * 1024 * 1024
    // 10MB limit
  },
  fileFilter: (req, file, cb) => {
    const allowedTypes = /jpeg|jpg|png|pdf/;
    const extname = allowedTypes.test(path.extname(file.originalname).toLowerCase());
    const mimetype = allowedTypes.test(file.mimetype);
    if (mimetype && extname) {
      return cb(null, true);
    } else {
      cb(new Error("Only images (JPEG, JPG, PNG) and PDF files are allowed"));
    }
  }
});
async function registerRoutes(app2) {
  await setupAuth(app2);
  try {
    const existingCategories = await storage.getCategories();
    if (existingCategories.length === 0) {
      const defaultCategories = [
        { name: "Equipment", description: "Heavy machinery, tools, and equipment expenses", color: "#F59E0B" },
        { name: "Vehicle", description: "Fuel, maintenance, and vehicle-related costs", color: "#EF4444" },
        { name: "Utilities", description: "Utility bills and related expenses", color: "#3B82F6" },
        { name: "Materials", description: "Construction and utility materials", color: "#10B981" },
        { name: "Meals & Entertainment", description: "Business meals and entertainment", color: "#8B5CF6" },
        { name: "Travel", description: "Travel and accommodation expenses", color: "#F97316" }
      ];
      for (const category of defaultCategories) {
        await storage.createCategory(category);
      }
    }
  } catch (error) {
    console.error("Error seeding categories:", error);
  }
  app2.get("/api/auth/user", isAuthenticated, async (req, res) => {
    try {
      const userId = req.user.claims?.sub || req.user.id;
      const user = await storage.getUser(userId);
      res.json(user);
    } catch (error) {
      console.error("Error fetching user:", error);
      res.status(500).json({ message: "Failed to fetch user" });
    }
  });
  app2.post("/api/auth/impersonate", requireAdmin, async (req, res) => {
    try {
      const { userId } = req.body;
      if (!userId) {
        return res.status(400).json({ message: "User ID is required" });
      }
      const targetUser = await storage.getUser(userId);
      if (!targetUser) {
        return res.status(404).json({ message: "User not found" });
      }
      req.login({
        id: targetUser.id,
        claims: {
          sub: targetUser.id,
          email: targetUser.email,
          first_name: targetUser.firstName,
          last_name: targetUser.lastName
        },
        expires_at: Math.floor(Date.now() / 1e3) + 24 * 60 * 60
        // 24 hours
      }, (err) => {
        if (err) {
          console.error("Error creating impersonation session:", err);
          return res.status(500).json({ message: "Failed to create session" });
        }
        res.json({ message: "Successfully impersonating user", user: targetUser });
      });
    } catch (error) {
      console.error("Error during impersonation:", error);
      res.status(500).json({ message: "Failed to impersonate user" });
    }
  });
  app2.get("/api/users", requireAdmin, async (req, res) => {
    try {
      const users2 = await storage.getAllUsers();
      res.json(users2);
    } catch (error) {
      console.error("Error fetching users:", error);
      res.status(500).json({ message: "Failed to fetch users" });
    }
  });
  app2.post("/api/users", requireAdmin, async (req, res) => {
    try {
      const { email, firstName, lastName, password, role, profileImageUrl } = req.body;
      if (!email || !firstName || !lastName || !password || !role) {
        return res.status(400).json({ message: "Email, first name, last name, password, and role are required" });
      }
      if (password.length < 8) {
        return res.status(400).json({ message: "Password must be at least 8 characters long" });
      }
      if (!Object.values(UserRole).includes(role)) {
        return res.status(400).json({ message: "Invalid role" });
      }
      const existingUser = await storage.getUserByEmail(email);
      if (existingUser) {
        return res.status(400).json({ message: "User with this email already exists" });
      }
      const userData = {
        id: `manual_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
        email,
        firstName,
        lastName,
        role,
        profileImageUrl: profileImageUrl || null
      };
      const user = await storage.createManualUser(userData, password);
      res.status(201).json(user);
    } catch (error) {
      console.error("Error creating user:", error);
      res.status(500).json({ message: "Failed to create user" });
    }
  });
  app2.put("/api/users/:id/role", requireAdmin, async (req, res) => {
    try {
      const { role } = req.body;
      if (!Object.values(UserRole).includes(role)) {
        return res.status(400).json({ message: "Invalid role" });
      }
      if (role !== UserRole.ADMIN) {
        const allUsers = await storage.getAllUsers();
        const adminCount = allUsers.filter((u) => u.role === UserRole.ADMIN).length;
        if (adminCount <= 1) {
          const targetUser = await storage.getUser(req.params.id);
          if (targetUser?.role === UserRole.ADMIN) {
            return res.status(400).json({ message: "Cannot remove the last admin user" });
          }
        }
      }
      const user = await storage.updateUserRole(req.params.id, role);
      res.json(user);
    } catch (error) {
      console.error("Error updating user role:", error);
      res.status(500).json({ message: "Failed to update user role" });
    }
  });
  app2.get("/api/categories", isAuthenticated, async (req, res) => {
    try {
      const categories2 = await storage.getCategories();
      res.json(categories2);
    } catch (error) {
      console.error("Error fetching categories:", error);
      res.status(500).json({ message: "Failed to fetch categories" });
    }
  });
  app2.post("/api/categories", requireAdmin, async (req, res) => {
    try {
      const validatedData = insertCategorySchema.parse(req.body);
      const category = await storage.createCategory(validatedData);
      res.status(201).json(category);
    } catch (error) {
      if (error instanceof ZodError) {
        return res.status(400).json({ message: "Invalid data", errors: error.errors });
      }
      console.error("Error creating category:", error);
      res.status(500).json({ message: "Failed to create category" });
    }
  });
  app2.put("/api/categories/:id", requireAdmin, async (req, res) => {
    try {
      const validatedData = insertCategorySchema.partial().parse(req.body);
      const category = await storage.updateCategory(req.params.id, validatedData);
      res.json(category);
    } catch (error) {
      if (error instanceof ZodError) {
        return res.status(400).json({ message: "Invalid data", errors: error.errors });
      }
      console.error("Error updating category:", error);
      res.status(500).json({ message: "Failed to update category" });
    }
  });
  app2.delete("/api/categories/:id", requireAdmin, async (req, res) => {
    try {
      await storage.deleteCategory(req.params.id);
      res.status(204).send();
    } catch (error) {
      console.error("Error deleting category:", error);
      if (error.code === "23503") {
        return res.status(400).json({
          message: "Cannot delete category because it has associated expenses. Please reassign or delete the expenses first."
        });
      }
      res.status(500).json({ message: "Failed to delete category" });
    }
  });
  app2.put("/api/expenses/:id/approve", requireApprover, async (req, res) => {
    try {
      const { status } = req.body;
      if (!["approved", "rejected"].includes(status)) {
        return res.status(400).json({ message: "Invalid status. Must be 'approved' or 'rejected'" });
      }
      const expense = await storage.updateExpenseStatus(req.params.id, status);
      res.json(expense);
    } catch (error) {
      console.error("Error updating expense status:", error);
      res.status(500).json({ message: "Failed to update expense status" });
    }
  });
  app2.get("/api/expenses/my/recent", isAuthenticated, async (req, res) => {
    try {
      const userId = req.user.claims.sub;
      const expenses2 = await storage.getRecentUserExpenses(userId, 5);
      res.json(expenses2);
    } catch (error) {
      console.error("Error fetching recent user expenses:", error);
      res.status(500).json({ message: "Failed to fetch recent user expenses" });
    }
  });
  app2.get("/api/expenses/pending", requireAdmin, async (req, res) => {
    try {
      const expenses2 = await storage.getPendingExpenses();
      res.json(expenses2);
    } catch (error) {
      console.error("Error fetching pending expenses:", error);
      res.status(500).json({ message: "Failed to fetch pending expenses" });
    }
  });
  app2.get("/api/expenses/my", isAuthenticated, async (req, res) => {
    try {
      const userId = req.user.claims.sub;
      const filters = {
        status: req.query.status,
        categoryId: req.query.categoryId,
        search: req.query.search
      };
      const expenses2 = await storage.getExpenses(userId, filters);
      res.json(expenses2);
    } catch (error) {
      console.error("Error fetching user expenses:", error);
      res.status(500).json({ message: "Failed to fetch user expenses" });
    }
  });
  app2.get("/api/expenses", isAuthenticated, async (req, res) => {
    try {
      const userId = req.user.claims.sub;
      const user = await storage.getUser(userId);
      const filters = {
        status: req.query.status,
        categoryId: req.query.categoryId,
        search: req.query.search
      };
      const expenses2 = await storage.getExpenses(
        user?.role === "admin" || user?.role === "approver" ? void 0 : userId,
        filters
      );
      res.json(expenses2);
    } catch (error) {
      console.error("Error fetching expenses:", error);
      res.status(500).json({ message: "Failed to fetch expenses" });
    }
  });
  app2.get("/api/expenses/stats", isAuthenticated, async (req, res) => {
    try {
      const userId = req.user.claims.sub;
      const user = await storage.getUser(userId);
      const stats = await storage.getExpenseStats(
        user?.role === "admin" || user?.role === "approver" ? void 0 : userId
      );
      res.json(stats);
    } catch (error) {
      console.error("Error fetching expense stats:", error);
      res.status(500).json({ message: "Failed to fetch expense stats" });
    }
  });
  app2.get("/api/expenses/analytics/categories", isAuthenticated, async (req, res) => {
    try {
      const userId = req.user.claims.sub;
      const categoryData = await storage.getExpensesByCategory(userId);
      res.json(categoryData);
    } catch (error) {
      console.error("Error fetching category analytics:", error);
      res.status(500).json({ message: "Failed to fetch category analytics" });
    }
  });
  app2.get("/api/expenses/analytics/monthly", isAuthenticated, async (req, res) => {
    try {
      const userId = req.user.claims.sub;
      const monthlyData = await storage.getMonthlyExpenses(userId);
      res.json(monthlyData);
    } catch (error) {
      console.error("Error fetching monthly analytics:", error);
      res.status(500).json({ message: "Failed to fetch monthly analytics" });
    }
  });
  app2.post("/api/expenses", isAuthenticated, upload.single("receipt"), async (req, res) => {
    try {
      const currentUserId = req.user.claims.sub;
      const currentUser = await storage.getUser(currentUserId);
      let expenseUserId = currentUserId;
      let submittedBy = null;
      if (req.body.userId && (currentUser?.role === "admin" || currentUser?.role === "approver")) {
        expenseUserId = req.body.userId;
        submittedBy = currentUserId;
      }
      const expenseData = {
        ...req.body,
        userId: expenseUserId,
        submittedBy,
        date: new Date(req.body.date),
        receiptUrl: req.file ? `/uploads/${req.file.filename}` : void 0
      };
      const { userId: _, ...dataForValidation } = expenseData;
      const validatedData = insertExpenseSchema.parse({
        ...dataForValidation,
        userId: expenseUserId
      });
      const expense = await storage.createExpense(validatedData);
      res.status(201).json(expense);
    } catch (error) {
      if (error instanceof ZodError) {
        return res.status(400).json({ message: "Invalid data", errors: error.errors });
      }
      console.error("Error creating expense:", error);
      res.status(500).json({ message: "Failed to create expense" });
    }
  });
  app2.put("/api/expenses/:id", isAuthenticated, async (req, res) => {
    try {
      const userId = req.user.claims.sub;
      const user = await storage.getUser(userId);
      const expense = await storage.getExpenseById(req.params.id);
      if (!expense) {
        return res.status(404).json({ message: "Expense not found" });
      }
      if (!(user?.role === "admin" || user?.role === "approver") && expense.userId !== userId) {
        return res.status(403).json({ message: "You can only edit your own expenses" });
      }
      if (expense.status === "approved" && !(user?.role === "admin" || user?.role === "approver")) {
        return res.status(403).json({ message: "Cannot edit approved expenses" });
      }
      const validatedData = insertExpenseSchema.partial().parse(req.body);
      const updatedExpense = await storage.updateExpense(req.params.id, validatedData);
      res.json(updatedExpense);
    } catch (error) {
      if (error instanceof ZodError) {
        return res.status(400).json({ message: "Invalid data", errors: error.errors });
      }
      console.error("Error updating expense:", error);
      res.status(500).json({ message: "Failed to update expense" });
    }
  });
  app2.delete("/api/expenses/:id", isAuthenticated, async (req, res) => {
    try {
      const userId = req.user.claims.sub;
      const user = await storage.getUser(userId);
      const expense = await storage.getExpenseById(req.params.id);
      if (!expense) {
        return res.status(404).json({ message: "Expense not found" });
      }
      if (!(user?.role === "admin" || user?.role === "approver") && expense.userId !== userId) {
        return res.status(403).json({ message: "You can only delete your own expenses" });
      }
      if (expense.status === "approved") {
        return res.status(403).json({ message: "Cannot delete approved expenses" });
      }
      await storage.deleteExpense(req.params.id);
      res.json({ message: "Expense deleted successfully" });
    } catch (error) {
      console.error("Error deleting expense:", error);
      res.status(500).json({ message: "Failed to delete expense" });
    }
  });
  app2.use("/uploads", express.static("uploads"));
  const httpServer = createServer(app2);
  return httpServer;
}

// server/vite.ts
import express2 from "express";
import fs from "fs";
import path3 from "path";
import { createServer as createViteServer, createLogger } from "vite";

// vite.config.ts
import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import path2 from "path";
import runtimeErrorOverlay from "@replit/vite-plugin-runtime-error-modal";
var vite_config_default = defineConfig({
  plugins: [
    react(),
    runtimeErrorOverlay(),
    ...process.env.NODE_ENV !== "production" && process.env.REPL_ID !== void 0 ? [
      await import("@replit/vite-plugin-cartographer").then(
        (m) => m.cartographer()
      )
    ] : []
  ],
  resolve: {
    alias: {
      "@": path2.resolve(import.meta.dirname, "client", "src"),
      "@shared": path2.resolve(import.meta.dirname, "shared"),
      "@assets": path2.resolve(import.meta.dirname, "attached_assets")
    }
  },
  root: path2.resolve(import.meta.dirname, "client"),
  build: {
    outDir: path2.resolve(import.meta.dirname, "dist/public"),
    emptyOutDir: true
  },
  server: {
    fs: {
      strict: true,
      deny: ["**/.*"]
    }
  }
});

// server/vite.ts
import { nanoid } from "nanoid";
var viteLogger = createLogger();
function log(message, source = "express") {
  const formattedTime = (/* @__PURE__ */ new Date()).toLocaleTimeString("en-US", {
    hour: "numeric",
    minute: "2-digit",
    second: "2-digit",
    hour12: true
  });
  console.log(`${formattedTime} [${source}] ${message}`);
}
async function setupVite(app2, server) {
  const serverOptions = {
    middlewareMode: true,
    hmr: { server },
    allowedHosts: true
  };
  const vite = await createViteServer({
    ...vite_config_default,
    configFile: false,
    customLogger: {
      ...viteLogger,
      error: (msg, options) => {
        viteLogger.error(msg, options);
        process.exit(1);
      }
    },
    server: serverOptions,
    appType: "custom"
  });
  app2.use(vite.middlewares);
  app2.use("*", async (req, res, next) => {
    const url = req.originalUrl;
    try {
      const clientTemplate = path3.resolve(
        import.meta.dirname,
        "..",
        "client",
        "index.html"
      );
      let template = await fs.promises.readFile(clientTemplate, "utf-8");
      template = template.replace(
        `src="/src/main.tsx"`,
        `src="/src/main.tsx?v=${nanoid()}"`
      );
      const page = await vite.transformIndexHtml(url, template);
      res.status(200).set({ "Content-Type": "text/html" }).end(page);
    } catch (e) {
      vite.ssrFixStacktrace(e);
      next(e);
    }
  });
}
function serveStatic(app2) {
  const distPath = path3.resolve(import.meta.dirname, "public");
  if (!fs.existsSync(distPath)) {
    throw new Error(
      `Could not find the build directory: ${distPath}, make sure to build the client first`
    );
  }
  app2.use(express2.static(distPath));
  app2.use("*", (_req, res) => {
    res.sendFile(path3.resolve(distPath, "index.html"));
  });
}

// server/index.ts
var app = express3();
app.use(express3.json());
app.use(express3.urlencoded({ extended: false }));
app.use((req, res, next) => {
  const start = Date.now();
  const path4 = req.path;
  let capturedJsonResponse = void 0;
  const originalResJson = res.json;
  res.json = function(bodyJson, ...args) {
    capturedJsonResponse = bodyJson;
    return originalResJson.apply(res, [bodyJson, ...args]);
  };
  res.on("finish", () => {
    const duration = Date.now() - start;
    if (path4.startsWith("/api")) {
      let logLine = `${req.method} ${path4} ${res.statusCode} in ${duration}ms`;
      if (capturedJsonResponse) {
        logLine += ` :: ${JSON.stringify(capturedJsonResponse)}`;
      }
      if (logLine.length > 80) {
        logLine = logLine.slice(0, 79) + "\u2026";
      }
      log(logLine);
    }
  });
  next();
});
(async () => {
  const server = await registerRoutes(app);
  app.use((err, _req, res, _next) => {
    const status = err.status || err.statusCode || 500;
    const message = err.message || "Internal Server Error";
    res.status(status).json({ message });
    throw err;
  });
  if (app.get("env") === "development") {
    await setupVite(app, server);
  } else {
    serveStatic(app);
  }
  const port = parseInt(process.env.PORT || "5000", 10);
  server.listen({
    port,
    host: "0.0.0.0",
    reusePort: true
  }, () => {
    log(`serving on port ${port}`);
  });
})();
