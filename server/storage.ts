import {
  users,
  categories,
  expenses,
  type User,
  type UpsertUser,
  type Category,
  type InsertCategory,
  type CategoryWithSubcategories,
  type Expense,
  type InsertExpense,
  type ExpenseWithCategory,
  UserRole,
  hasPermission,
} from "@shared/schema";
import { db } from "./db";
import { eq, desc, and, sql, ilike } from "drizzle-orm";
import { alias } from "drizzle-orm/pg-core";

export interface IStorage {
  // User operations - mandatory for Replit Auth
  getUser(id: string): Promise<User | undefined>;
  getUserByEmail(email: string): Promise<User | undefined>;
  getAllUsers(): Promise<User[]>;
  upsertUser(user: UpsertUser): Promise<User>;
  createManualUser(user: UpsertUser, password: string): Promise<User>;
  updateUser(id: string, userData: Partial<UpsertUser>): Promise<User>;
  updateUserRole(id: string, role: string): Promise<User>;
  
  // Category operations
  getCategories(): Promise<CategoryWithSubcategories[]>;
  createCategory(category: InsertCategory): Promise<Category>;
  updateCategory(id: string, category: Partial<InsertCategory>): Promise<Category>;
  deleteCategory(id: string): Promise<void>;
  
  // Expense operations
  getExpenses(userId?: string, filters?: { status?: string; categoryId?: string; search?: string }): Promise<ExpenseWithCategory[]>;
  getRecentUserExpenses(userId: string, limit: number): Promise<ExpenseWithCategory[]>;
  getPendingExpenses(): Promise<ExpenseWithCategory[]>;
  getExpenseById(id: string): Promise<ExpenseWithCategory | undefined>;
  createExpense(expense: InsertExpense): Promise<Expense>;
  updateExpense(id: string, expense: Partial<InsertExpense>): Promise<Expense>;
  updateExpenseStatus(id: string, status: string): Promise<Expense>;
  deleteExpense(id: string): Promise<void>;
  
  // Stats operations
  getExpenseStats(userId?: string): Promise<{
    currentQuarterExpenses: number;
    pendingExpenses: number;
    approvedExpenses: number;
    thisMonthExpenses: number;
  }>;
  
  // Analytics operations
  getExpensesByCategory(userId: string): Promise<Array<{
    categoryId: string;
    categoryName: string;
    categoryColor: string | null;
    totalAmount: number;
    expenseCount: number;
  }>>;
  getMonthlyExpenses(userId: string): Promise<Array<{
    month: string;
    totalAmount: number;
    expenseCount: number;
  }>>;
  
  // Time period specific analytics
  getExpensesByPeriod(userId: string, period: 'day' | 'month' | 'quarter'): Promise<Array<{
    categoryId: string;
    categoryName: string;
    categoryColor: string | null;
    totalAmount: number;
    expenseCount: number;
  }>>;
  getDailyExpenses(userId: string, year: number, month: number): Promise<Array<{
    date: string;
    totalAmount: number;
    expenseCount: number;
  }>>;
  getQuarterlyExpenses(userId: string, year: number): Promise<Array<{
    quarter: string;
    totalAmount: number;
    expenseCount: number;
  }>>;
  
  // Reports operations
  getExpenseReport(filters: {
    startDate?: Date;
    endDate?: Date;
    status?: string;
    categoryId?: string;
    userId?: string;
  }): Promise<{
    expenses: ExpenseWithCategory[];
    totalAmount: number;
    expenseCount: number;
  }>;
  
  // Database Management operations
  getAllExpensesForExport(): Promise<ExpenseWithCategory[]>;
  importExpenses(expenses: any[]): Promise<{
    imported: number;
    errors: string[];
  }>;
  purgeAllExpenses(): Promise<number>;
  getDatabaseStats(): Promise<{
    totalExpenses: number;
    totalUsers: number;
    totalCategories: number;
    expensesByStatus: Array<{ status: string; count: number }>;
    recentActivity: Array<{ date: string; action: string; count: number }>;
  }>;
}

export class DatabaseStorage implements IStorage {
  // User operations
  async getUser(id: string): Promise<User | undefined> {
    const [user] = await db.select().from(users).where(eq(users.id, id));
    return user;
  }

  async getUserByEmail(email: string): Promise<User | undefined> {
    const [user] = await db.select().from(users).where(eq(users.email, email));
    return user;
  }

  async getAllUsers(): Promise<User[]> {
    return await db.select().from(users).orderBy(users.firstName, users.lastName);
  }

  async upsertUser(userData: UpsertUser): Promise<User> {
    const [user] = await db
      .insert(users)
      .values({
        ...userData,
        role: userData.role || "user", // Ensure new users get basic user role
      })
      .onConflictDoUpdate({
        target: users.id,
        set: {
          email: userData.email,
          firstName: userData.firstName,
          lastName: userData.lastName,
          profileImageUrl: userData.profileImageUrl,
          // Don't update role on existing users during OAuth login
          updatedAt: new Date(),
        },
      })
      .returning();
    return user;
  }

  async createManualUser(userData: UpsertUser, password: string): Promise<User> {
    // For now, we'll store the user data and note that this is a manual account
    // In a real implementation, you would hash the password with bcrypt
    const [user] = await db
      .insert(users)
      .values({
        ...userData,
        // Note: In production, hash the password with bcrypt before storing
        // For now, we'll add a comment to indicate this is a manual account
        createdAt: new Date(),
        updatedAt: new Date(),
      })
      .returning();
    
    // TODO: In production, also store the hashed password in a separate passwords table
    // and implement proper authentication flow for manual accounts
    
    return user;
  }

  async updateUser(id: string, userData: Partial<UpsertUser>): Promise<User> {
    const [user] = await db
      .update(users)
      .set({ 
        ...userData,
        updatedAt: new Date(),
      })
      .where(eq(users.id, id))
      .returning();
    return user;
  }

  async updateUserRole(id: string, role: string): Promise<User> {
    const [user] = await db
      .update(users)
      .set({ 
        role,
        updatedAt: new Date(),
      })
      .where(eq(users.id, id))
      .returning();
    return user;
  }

  // Category operations
  async getCategories(): Promise<CategoryWithSubcategories[]> {
    const allCategories = await db.select().from(categories).orderBy(categories.name);
    
    // Build the nested structure without circular references
    const categoryMap = new Map<string, CategoryWithSubcategories>();
    const topLevelCategories: CategoryWithSubcategories[] = [];
    
    // First pass: create all category objects
    allCategories.forEach(category => {
      categoryMap.set(category.id, { 
        ...category, 
        subcategories: []
      });
    });
    
    // Second pass: build parent-child relationships (only subcategories, no parent refs)
    allCategories.forEach(category => {
      const categoryWithSubs = categoryMap.get(category.id)!;
      
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

  async createCategory(category: InsertCategory): Promise<Category> {
    const [newCategory] = await db
      .insert(categories)
      .values(category)
      .returning();
    return newCategory;
  }

  async updateCategory(id: string, category: Partial<InsertCategory>): Promise<Category> {
    const [updatedCategory] = await db
      .update(categories)
      .set({ ...category, updatedAt: new Date() })
      .where(eq(categories.id, id))
      .returning();
    return updatedCategory;
  }

  async deleteCategory(id: string): Promise<void> {
    await db.delete(categories).where(eq(categories.id, id));
  }

  // Expense operations
  async getExpenses(userId?: string, filters?: { status?: string; categoryId?: string; search?: string }): Promise<ExpenseWithCategory[]> {
    const submittedByAlias = alias(users, 'submittedByUser');
    
    let query = db
      .select({
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
          email: users.email,
        },
        submittedByUser: {
          firstName: submittedByAlias.firstName,
          lastName: submittedByAlias.lastName,
          email: submittedByAlias.email,
        },
      })
      .from(expenses)
      .leftJoin(categories, eq(expenses.categoryId, categories.id))
      .leftJoin(users, eq(expenses.userId, users.id))
      .leftJoin(submittedByAlias, eq(expenses.submittedBy, submittedByAlias.id))
      .orderBy(desc(expenses.createdAt));

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
      query = query.where(and(...conditions)) as any;
    }

    const results = await query;
    return results.map(result => ({
      ...result,
      category: result.category || { id: '', name: 'Unknown', description: null, parentId: null, color: null, createdAt: null, updatedAt: null },
      user: result.user || { firstName: null, lastName: null, email: null },
      submittedByUser: result.submittedByUser?.firstName ? result.submittedByUser : undefined
    }));
  }

  async getRecentUserExpenses(userId: string, limit: number): Promise<ExpenseWithCategory[]> {
    const submittedByAlias = alias(users, 'submittedByUser');
    
    const results = await db
      .select({
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
          email: users.email,
        },
        submittedByUser: {
          firstName: submittedByAlias.firstName,
          lastName: submittedByAlias.lastName,
          email: submittedByAlias.email,
        },
      })
      .from(expenses)
      .leftJoin(categories, eq(expenses.categoryId, categories.id))
      .leftJoin(users, eq(expenses.userId, users.id))
      .leftJoin(submittedByAlias, eq(expenses.submittedBy, submittedByAlias.id))
      .where(eq(expenses.userId, userId))
      .orderBy(desc(expenses.createdAt))
      .limit(limit);

    return results.map(result => ({
      ...result,
      category: result.category || { id: '', name: 'Unknown', description: null, parentId: null, color: null, createdAt: null, updatedAt: null },
      user: result.user || { firstName: null, lastName: null, email: null },
      submittedByUser: result.submittedByUser?.firstName ? result.submittedByUser : undefined
    }));
  }

  async getPendingExpenses(): Promise<ExpenseWithCategory[]> {
    const submittedByAlias = alias(users, 'submittedByUser');
    
    const results = await db
      .select({
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
          email: users.email,
        },
        submittedByUser: {
          firstName: submittedByAlias.firstName,
          lastName: submittedByAlias.lastName,
          email: submittedByAlias.email,
        },
      })
      .from(expenses)
      .leftJoin(categories, eq(expenses.categoryId, categories.id))
      .leftJoin(users, eq(expenses.userId, users.id))
      .leftJoin(submittedByAlias, eq(expenses.submittedBy, submittedByAlias.id))
      .where(eq(expenses.status, 'pending'))
      .orderBy(desc(expenses.createdAt));

    return results.map(result => ({
      ...result,
      category: result.category || { id: '', name: 'Unknown', description: null, parentId: null, color: null, createdAt: null, updatedAt: null },
      user: result.user || { firstName: null, lastName: null, email: null },
      submittedByUser: result.submittedByUser?.firstName ? result.submittedByUser : undefined
    }));
  }

  async getExpenseById(id: string): Promise<ExpenseWithCategory | undefined> {
    const submittedByAlias = alias(users, 'submittedByUser');
    
    const [result] = await db
      .select({
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
          email: users.email,
        },
        submittedByUser: {
          firstName: submittedByAlias.firstName,
          lastName: submittedByAlias.lastName,
          email: submittedByAlias.email,
        },
      })
      .from(expenses)
      .leftJoin(categories, eq(expenses.categoryId, categories.id))
      .leftJoin(users, eq(expenses.userId, users.id))
      .leftJoin(submittedByAlias, eq(expenses.submittedBy, submittedByAlias.id))
      .where(eq(expenses.id, id));
    
    if (!result) return undefined;
    
    return {
      ...result,
      category: result.category || { id: '', name: 'Unknown', description: null, parentId: null, color: null, createdAt: null, updatedAt: null },
      user: result.user || { firstName: null, lastName: null, email: null },
      submittedByUser: result.submittedByUser?.firstName ? result.submittedByUser : undefined
    };
  }

  async createExpense(expense: InsertExpense): Promise<Expense> {
    const [newExpense] = await db
      .insert(expenses)
      .values({
        ...expense,
        amount: expense.amount.toString()
      })
      .returning();
    return newExpense;
  }

  async updateExpense(id: string, expense: Partial<InsertExpense>): Promise<Expense> {
    const updateData: Record<string, any> = { 
      ...expense, 
      updatedAt: new Date()
    };
    
    if (expense.amount !== undefined) {
      updateData.amount = expense.amount.toString();
    }
    
    const [updatedExpense] = await db
      .update(expenses)
      .set(updateData)
      .where(eq(expenses.id, id))
      .returning();
    return updatedExpense;
  }

  async updateExpenseStatus(id: string, status: string): Promise<Expense> {
    const [updatedExpense] = await db
      .update(expenses)
      .set({ 
        status,
        updatedAt: new Date(),
      })
      .where(eq(expenses.id, id))
      .returning();
    return updatedExpense;
  }

  async deleteExpense(id: string): Promise<void> {
    await db.delete(expenses).where(eq(expenses.id, id));
  }

  // Stats operations
  async getExpensesByCategory(userId: string): Promise<Array<{
    categoryId: string;
    categoryName: string;
    categoryColor: string | null;
    totalAmount: number;
    expenseCount: number;
  }>> {
    const results = await db
      .select({
        categoryId: expenses.categoryId,
        categoryName: categories.name,
        categoryColor: categories.color,
        totalAmount: sql<number>`COALESCE(SUM(CAST(${expenses.amount} AS DECIMAL)), 0)`,
        expenseCount: sql<number>`COUNT(*)`,
      })
      .from(expenses)
      .leftJoin(categories, eq(expenses.categoryId, categories.id))
      .where(eq(expenses.userId, userId))
      .groupBy(expenses.categoryId, categories.name, categories.color);

    return results.map(result => ({
      categoryId: result.categoryId || 'unknown',
      categoryName: result.categoryName || 'Unknown Category',
      categoryColor: result.categoryColor,
      totalAmount: Number(result.totalAmount || 0),
      expenseCount: Number(result.expenseCount || 0),
    }));
  }

  async getMonthlyExpenses(userId: string): Promise<Array<{
    month: string;
    totalAmount: number;
    expenseCount: number;
  }>> {
    const results = await db
      .select({
        month: sql<string>`TO_CHAR(${expenses.date}, 'YYYY-MM')`,
        totalAmount: sql<number>`COALESCE(SUM(CAST(${expenses.amount} AS DECIMAL)), 0)`,
        expenseCount: sql<number>`COUNT(*)`,
      })
      .from(expenses)
      .where(eq(expenses.userId, userId))
      .groupBy(sql`TO_CHAR(${expenses.date}, 'YYYY-MM')`)
      .orderBy(sql`TO_CHAR(${expenses.date}, 'YYYY-MM') DESC`)
      .limit(12);

    return results.map(result => ({
      month: result.month || 'Unknown',
      totalAmount: Number(result.totalAmount || 0),
      expenseCount: Number(result.expenseCount || 0),
    }));
  }

  // New time period specific analytics methods
  async getExpensesByPeriod(userId: string, period: 'day' | 'month' | 'quarter'): Promise<Array<{
    categoryId: string;
    categoryName: string;
    categoryColor: string | null;
    totalAmount: number;
    expenseCount: number;
  }>> {
    const now = new Date();
    let startDate: Date;
    
    switch (period) {
      case 'day':
        startDate = new Date(now.getFullYear(), now.getMonth(), now.getDate());
        break;
      case 'month':
        startDate = new Date(now.getFullYear(), now.getMonth(), 1);
        break;
      case 'quarter':
        const currentQuarter = Math.floor(now.getMonth() / 3);
        startDate = new Date(now.getFullYear(), currentQuarter * 3, 1);
        break;
    }

    const results = await db
      .select({
        categoryId: expenses.categoryId,
        categoryName: categories.name,
        categoryColor: categories.color,
        totalAmount: sql<number>`COALESCE(SUM(CAST(${expenses.amount} AS DECIMAL)), 0)`,
        expenseCount: sql<number>`COUNT(*)`,
      })
      .from(expenses)
      .leftJoin(categories, eq(expenses.categoryId, categories.id))
      .where(
        and(
          eq(expenses.userId, userId),
          sql`${expenses.date} >= ${startDate}`
        )
      )
      .groupBy(expenses.categoryId, categories.name, categories.color);

    return results.map(result => ({
      categoryId: result.categoryId || 'unknown',
      categoryName: result.categoryName || 'Unknown Category',
      categoryColor: result.categoryColor,
      totalAmount: Number(result.totalAmount || 0),
      expenseCount: Number(result.expenseCount || 0),
    }));
  }

  async getDailyExpenses(userId: string, year: number, month: number): Promise<Array<{
    date: string;
    totalAmount: number;
    expenseCount: number;
  }>> {
    const startDate = new Date(year, month - 1, 1);
    const endDate = new Date(year, month, 0); // Last day of the month

    const results = await db
      .select({
        date: sql<string>`TO_CHAR(${expenses.date}, 'YYYY-MM-DD')`,
        totalAmount: sql<number>`COALESCE(SUM(CAST(${expenses.amount} AS DECIMAL)), 0)`,
        expenseCount: sql<number>`COUNT(*)`,
      })
      .from(expenses)
      .where(
        and(
          eq(expenses.userId, userId),
          sql`${expenses.date} >= ${startDate}`,
          sql`${expenses.date} <= ${endDate}`
        )
      )
      .groupBy(sql`TO_CHAR(${expenses.date}, 'YYYY-MM-DD')`)
      .orderBy(sql`TO_CHAR(${expenses.date}, 'YYYY-MM-DD')`);

    return results.map(result => ({
      date: result.date || 'Unknown',
      totalAmount: Number(result.totalAmount || 0),
      expenseCount: Number(result.expenseCount || 0),
    }));
  }

  async getQuarterlyExpenses(userId: string, year: number): Promise<Array<{
    quarter: string;
    totalAmount: number;
    expenseCount: number;
  }>> {
    const results = await db
      .select({
        quarter: sql<string>`CONCAT('Q', CAST(CEILING(CAST(EXTRACT(MONTH FROM ${expenses.date}) AS DECIMAL) / 3) AS INT))`,
        totalAmount: sql<number>`COALESCE(SUM(CAST(${expenses.amount} AS DECIMAL)), 0)`,
        expenseCount: sql<number>`COUNT(*)`,
      })
      .from(expenses)
      .where(
        and(
          eq(expenses.userId, userId),
          sql`EXTRACT(YEAR FROM ${expenses.date}) = ${year}`
        )
      )
      .groupBy(sql`CEILING(CAST(EXTRACT(MONTH FROM ${expenses.date}) AS DECIMAL) / 3)`)
      .orderBy(sql`CEILING(CAST(EXTRACT(MONTH FROM ${expenses.date}) AS DECIMAL) / 3)`);

    return results.map(result => ({
      quarter: result.quarter || 'Q1',
      totalAmount: Number(result.totalAmount || 0),
      expenseCount: Number(result.expenseCount || 0),
    }));
  }

  async getExpenseStats(userId?: string): Promise<{
    currentQuarterExpenses: number;
    pendingExpenses: number;
    approvedExpenses: number;
    thisMonthExpenses: number;
  }> {
    const now = new Date();
    const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);
    
    // Calculate current quarter start date
    const currentQuarter = Math.floor(now.getMonth() / 3);
    const startOfQuarter = new Date(now.getFullYear(), currentQuarter * 3, 1);

    const [
      quarterResult,
      pendingResult,
      approvedResult,
      thisMonthResult
    ] = await Promise.all([
      db.select({
        total: sql<number>`COALESCE(SUM(CAST(${expenses.amount} AS DECIMAL)), 0)`
      }).from(expenses).where(
        and(
          userId ? eq(expenses.userId, userId) : sql`true`,
          sql`${expenses.date} >= ${startOfQuarter}`
        )
      ),
      
      db.select({
        total: sql<number>`COALESCE(SUM(CAST(${expenses.amount} AS DECIMAL)), 0)`
      }).from(expenses).where(
        and(
          userId ? eq(expenses.userId, userId) : sql`true`,
          eq(expenses.status, 'pending')
        )
      ),
      
      db.select({
        total: sql<number>`COALESCE(SUM(CAST(${expenses.amount} AS DECIMAL)), 0)`
      }).from(expenses).where(
        and(
          userId ? eq(expenses.userId, userId) : sql`true`,
          eq(expenses.status, 'approved')
        )
      ),
      
      db.select({
        total: sql<number>`COALESCE(SUM(CAST(${expenses.amount} AS DECIMAL)), 0)`
      }).from(expenses).where(
        and(
          userId ? eq(expenses.userId, userId) : sql`true`,
          sql`${expenses.date} >= ${startOfMonth}`
        )
      )
    ]);

    return {
      currentQuarterExpenses: Number(quarterResult[0]?.total || 0),
      pendingExpenses: Number(pendingResult[0]?.total || 0),
      approvedExpenses: Number(approvedResult[0]?.total || 0),
      thisMonthExpenses: Number(thisMonthResult[0]?.total || 0),
    };
  }



  // Reports operations
  async getExpenseReport(filters: {
    startDate?: Date;
    endDate?: Date;
    status?: string;
    categoryId?: string;
    userId?: string;
  }): Promise<{
    expenses: ExpenseWithCategory[];
    totalAmount: number;
    expenseCount: number;
  }> {
    const submittedByAlias = alias(users, 'submittedByUser');
    
    // Build where conditions
    const conditions = [];
    
    if (filters.startDate) {
      conditions.push(sql`${expenses.date} >= ${filters.startDate}`);
    }
    
    if (filters.endDate) {
      conditions.push(sql`${expenses.date} <= ${filters.endDate}`);
    }
    
    if (filters.status) {
      conditions.push(eq(expenses.status, filters.status));
    }
    
    if (filters.categoryId) {
      conditions.push(eq(expenses.categoryId, filters.categoryId));
    }
    
    if (filters.userId) {
      conditions.push(eq(expenses.userId, filters.userId));
    }
    
    const whereClause = conditions.length > 0 ? and(...conditions) : undefined;
    
    // Get filtered expenses
    const expenseResults = await db
      .select({
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
          email: users.email,
        },
        submittedByUser: {
          firstName: submittedByAlias.firstName,
          lastName: submittedByAlias.lastName,
          email: submittedByAlias.email,
        },
      })
      .from(expenses)
      .leftJoin(categories, eq(expenses.categoryId, categories.id))
      .leftJoin(users, eq(expenses.userId, users.id))
      .leftJoin(submittedByAlias, eq(expenses.submittedBy, submittedByAlias.id))
      .where(whereClause)
      .orderBy(desc(expenses.date));
    
    // Calculate totals
    const [totals] = await db
      .select({
        totalAmount: sql<number>`COALESCE(SUM(CAST(${expenses.amount} AS DECIMAL)), 0)`,
        expenseCount: sql<number>`COUNT(*)`,
      })
      .from(expenses)
      .where(whereClause);
    
    const formattedExpenses = expenseResults.map(result => ({
      ...result,
      category: result.category || { 
        id: '', 
        name: 'Unknown', 
        description: null, 
        parentId: null, 
        color: null, 
        createdAt: null, 
        updatedAt: null 
      },
      user: result.user || { firstName: null, lastName: null, email: null },
      submittedByUser: result.submittedByUser?.firstName ? result.submittedByUser : undefined
    }));
    
    return {
      expenses: formattedExpenses,
      totalAmount: Number(totals?.totalAmount || 0),
      expenseCount: Number(totals?.expenseCount || 0),
    };
  }

  // Database Management operations
  async getAllExpensesForExport(): Promise<ExpenseWithCategory[]> {
    const submittedByAlias = alias(users, 'submittedByUser');
    
    const expenseResults = await db
      .select({
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
          email: users.email,
        },
        submittedByUser: {
          firstName: submittedByAlias.firstName,
          lastName: submittedByAlias.lastName,
          email: submittedByAlias.email,
        },
      })
      .from(expenses)
      .leftJoin(categories, eq(expenses.categoryId, categories.id))
      .leftJoin(users, eq(expenses.userId, users.id))
      .leftJoin(submittedByAlias, eq(expenses.submittedBy, submittedByAlias.id))
      .orderBy(desc(expenses.date));

    return expenseResults.map(result => ({
      ...result,
      category: result.category || { 
        id: '', 
        name: 'Unknown', 
        description: null, 
        parentId: null, 
        color: null, 
        createdAt: null, 
        updatedAt: null 
      },
      user: result.user || { firstName: null, lastName: null, email: null },
      submittedByUser: result.submittedByUser?.firstName ? result.submittedByUser : undefined
    }));
  }

  async importExpenses(expenseData: any[]): Promise<{ imported: number; errors: string[] }> {
    const errors: string[] = [];
    let imported = 0;

    for (let index = 0; index < expenseData.length; index++) {
      const expense = expenseData[index];
      try {
        // Skip completely empty rows
        const hasAnyData = Object.values(expense).some(value => 
          value !== null && value !== undefined && value !== ''
        );
        
        if (!hasAnyData) {
          continue; // Skip empty rows silently
        }

        // Map field names from Excel export format (no defaults to avoid wrong assignments)
        const mappedExpense = {
          userId: expense.userId || expense['User ID'],
          categoryId: expense.categoryId || expense['Category ID'],
          description: expense.description || expense['Description'],
          amount: expense.amount || expense['Amount'],
          date: expense.date || expense['Date'],
          status: expense.status || expense['Status'],
          notes: expense.notes || expense['Notes'],
          submittedBy: expense.submittedBy || expense['Submitted By ID'],
          receiptUrl: expense.receiptUrl || expense['Receipt URL']
        };

        // Validate required fields with specific missing field details
        const missingFields = [];
        if (!mappedExpense.userId) missingFields.push('User ID');
        if (!mappedExpense.categoryId) missingFields.push('Category ID');
        if (!mappedExpense.description) missingFields.push('Description');
        if (!mappedExpense.amount) missingFields.push('Amount');
        
        if (missingFields.length > 0) {
          const rowDesc = mappedExpense.description || `Row ${index + 1}`;
          errors.push(`Skipping expense "${rowDesc}": Missing required fields: ${missingFields.join(', ')}`);
          continue;
        }

        // Convert and validate date
        let expenseDate: Date;
        if (typeof mappedExpense.date === 'string') {
          expenseDate = new Date(mappedExpense.date);
          if (isNaN(expenseDate.getTime())) {
            errors.push(`Skipping expense: Invalid date format for "${mappedExpense.description}"`);
            continue;
          }
        } else if (mappedExpense.date instanceof Date) {
          expenseDate = mappedExpense.date;
        } else {
          // Default to current date if no date provided
          expenseDate = new Date();
        }

        // Convert amount to number
        const amount = typeof mappedExpense.amount === 'string' ? parseFloat(mappedExpense.amount) : mappedExpense.amount;
        if (isNaN(amount) || amount <= 0) {
          errors.push(`Skipping expense: Invalid amount for "${mappedExpense.description}"`);
          continue;
        }

        // Validate user exists
        const userExists = await db.select().from(users).where(eq(users.id, mappedExpense.userId)).limit(1);
        if (!userExists.length) {
          errors.push(`Skipping expense: User ID "${mappedExpense.userId}" not found for "${mappedExpense.description}"`);
          continue;
        }

        // Auto-create category if it doesn't exist (for category name imports)
        let finalCategoryId = mappedExpense.categoryId;
        
        // Check if we have a category name instead of ID
        const categoryName = expense['Category Name'] || expense['Category'];
        if (categoryName && !mappedExpense.categoryId) {
          // Try to find existing category by name
          const existingCategory = await db.select().from(categories).where(eq(categories.name, categoryName)).limit(1);
          if (existingCategory.length) {
            finalCategoryId = existingCategory[0].id;
          } else {
            // Create new category
            const [newCategory] = await db.insert(categories).values({
              name: categoryName,
              description: `Auto-created from import: ${categoryName}`,
              color: '#6366F1' // Default color
            }).returning();
            finalCategoryId = newCategory.id;
            // Log for audit trail without cluttering console
            // console.log(`Created new category: ${categoryName} (${finalCategoryId})`);
          }
        } else {
          // Validate category ID exists
          const categoryExists = await db.select().from(categories).where(eq(categories.id, finalCategoryId)).limit(1);
          if (!categoryExists.length) {
            errors.push(`Skipping expense: Category ID "${finalCategoryId}" not found for "${mappedExpense.description}"`);
            continue;
          }
        }

        // Insert the expense with the resolved category ID
        await db.insert(expenses).values({
          userId: mappedExpense.userId,
          submittedBy: mappedExpense.submittedBy || mappedExpense.userId, // Default to self-submitted
          categoryId: finalCategoryId,
          description: mappedExpense.description,
          amount: amount.toString(),
          date: expenseDate,
          status: mappedExpense.status || 'pending',
          receiptUrl: mappedExpense.receiptUrl || null,
          notes: mappedExpense.notes || null,
        });

        imported++;
      } catch (error) {
        const rowDesc = expense.description || expense['Description'] || `Row ${index + 1}`;
        errors.push(`Failed to import expense "${rowDesc}": ${error instanceof Error ? error.message : 'Unknown error'}`);
      }
    }

    return { imported, errors };
  }

  async purgeAllExpenses(): Promise<number> {
    const result = await db.delete(expenses);
    return result.rowCount || 0;
  }

  async getDatabaseStats(): Promise<{
    totalExpenses: number;
    totalUsers: number;
    totalCategories: number;
    expensesByStatus: Array<{ status: string; count: number }>;
    recentActivity: Array<{ date: string; action: string; count: number }>;
  }> {
    // Get total counts
    const [expenseCount] = await db
      .select({ count: sql<number>`COUNT(*)` })
      .from(expenses);
    
    const [userCount] = await db
      .select({ count: sql<number>`COUNT(*)` })
      .from(users);
    
    const [categoryCount] = await db
      .select({ count: sql<number>`COUNT(*)` })
      .from(categories);

    // Get expenses by status
    const statusCounts = await db
      .select({
        status: expenses.status,
        count: sql<number>`COUNT(*)`,
      })
      .from(expenses)
      .groupBy(expenses.status);

    // Get recent activity (last 7 days)
    const sevenDaysAgo = new Date();
    sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);
    
    const recentActivity = await db
      .select({
        date: sql<string>`DATE(${expenses.createdAt})`,
        count: sql<number>`COUNT(*)`,
      })
      .from(expenses)
      .where(sql`${expenses.createdAt} >= ${sevenDaysAgo}`)
      .groupBy(sql`DATE(${expenses.createdAt})`)
      .orderBy(sql`DATE(${expenses.createdAt}) DESC`);

    return {
      totalExpenses: Number(expenseCount.count),
      totalUsers: Number(userCount.count),
      totalCategories: Number(categoryCount.count),
      expensesByStatus: statusCounts.map(s => ({
        status: s.status,
        count: Number(s.count)
      })),
      recentActivity: recentActivity.map(r => ({
        date: r.date,
        action: 'expense_created',
        count: Number(r.count)
      }))
    };
  }
}

export const storage = new DatabaseStorage();
