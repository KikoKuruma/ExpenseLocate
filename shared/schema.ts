import { sql } from 'drizzle-orm';
import {
  index,
  jsonb,
  pgTable,
  timestamp,
  varchar,
  text,
  decimal,
  boolean,
} from "drizzle-orm/pg-core";
import { relations } from "drizzle-orm";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod";

// Session storage table - mandatory for Replit Auth
export const sessions = pgTable(
  "sessions",
  {
    sid: varchar("sid").primaryKey(),
    sess: jsonb("sess").notNull(),
    expire: timestamp("expire").notNull(),
  },
  (table) => [index("IDX_session_expire").on(table.expire)],
);

// User storage table - mandatory for Replit Auth
export const users = pgTable("users", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  email: varchar("email").unique(),
  firstName: varchar("first_name"),
  lastName: varchar("last_name"),
  profileImageUrl: varchar("profile_image_url"),
  role: varchar("role", { length: 20 }).notNull().default("user"), // user, approver, admin
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
});

export const categories = pgTable("categories", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  name: varchar("name", { length: 100 }).notNull(),
  description: text("description"),
  parentId: varchar("parent_id"),
  color: varchar("color", { length: 7 }).default("#6366F1"), // Default to indigo color
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
});

export const expenses = pgTable("expenses", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  userId: varchar("user_id").notNull().references(() => users.id),
  submittedBy: varchar("submitted_by").references(() => users.id), // null if self-submitted, otherwise the manager who submitted it
  categoryId: varchar("category_id").notNull().references(() => categories.id),
  description: text("description").notNull(),
  amount: decimal("amount", { precision: 10, scale: 2 }).notNull(),
  date: timestamp("date").notNull(),
  status: varchar("status", { length: 20 }).notNull().default("pending"), // pending, approved, rejected
  receiptUrl: varchar("receipt_url"),
  notes: text("notes"),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
});

// Insert schemas
export const insertUserSchema = createInsertSchema(users).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});

export const updateUserSchema = createInsertSchema(users).omit({
  id: true,
  role: true,
  createdAt: true,
  updatedAt: true,
}).partial();

export const insertCategorySchema = createInsertSchema(categories).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});

export const insertExpenseSchema = createInsertSchema(expenses).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
}).extend({
  amount: z.coerce.number(),
  date: z.coerce.date(),
});

export const updateExpenseSchema = createInsertSchema(expenses).omit({
  id: true,
  userId: true,
  submittedBy: true,
  createdAt: true,
  updatedAt: true,
}).extend({
  amount: z.coerce.number(),
  date: z.coerce.date(),
}).partial();

// Types
export type UpsertUser = typeof users.$inferInsert;
export type User = typeof users.$inferSelect;
export type UpdateUser = z.infer<typeof updateUserSchema>;

// Role-based permission helpers
export const UserRole = {
  USER: "user",
  APPROVER: "approver", 
  ADMIN: "admin"
} as const;

export type UserRole = typeof UserRole[keyof typeof UserRole];

export const hasPermission = (userRole: string, requiredRole: UserRole): boolean => {
  const roleHierarchy = { user: 0, approver: 1, admin: 2 };
  return roleHierarchy[userRole as keyof typeof roleHierarchy] >= roleHierarchy[requiredRole];
};
export type InsertCategory = z.infer<typeof insertCategorySchema>;
export type Category = typeof categories.$inferSelect;
export type InsertExpense = z.infer<typeof insertExpenseSchema>;
export type Expense = typeof expenses.$inferSelect;

// Category relations
export const categoryRelations = relations(categories, ({ one, many }) => ({
  parent: one(categories, { 
    fields: [categories.parentId], 
    references: [categories.id],
    relationName: "subcategories"
  }),
  subcategories: many(categories, { relationName: "subcategories" }),
}));

// Extended types for joined data
export type CategoryWithSubcategories = Category & {
  subcategories: CategoryWithSubcategories[];
};

export type ExpenseWithCategory = Expense & {
  category: Category;
  user: Pick<User, 'firstName' | 'lastName' | 'email'>;
  submittedByUser?: Pick<User, 'firstName' | 'lastName' | 'email'>;
};
