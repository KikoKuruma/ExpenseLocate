import type { Express } from "express";
import express from "express";
import { createServer, type Server } from "http";
import multer from "multer";
import path from "path";
import { storage } from "./storage";
import { setupAuth, isAuthenticated } from "./replitAuth";
import { requireAdmin, requireApprover } from "./middleware/permissions";
import { insertCategorySchema, insertExpenseSchema, updateExpenseSchema, updateUserSchema, UserRole, hasPermission } from "@shared/schema";
import { ZodError } from "zod";

// Configure multer for file uploads
const upload = multer({
  dest: 'uploads/',
  limits: {
    fileSize: 10 * 1024 * 1024, // 10MB limit
  },
  fileFilter: (req, file, cb) => {
    const allowedTypes = /jpeg|jpg|png|pdf/;
    const extname = allowedTypes.test(path.extname(file.originalname).toLowerCase());
    const mimetype = allowedTypes.test(file.mimetype);
    
    if (mimetype && extname) {
      return cb(null, true);
    } else {
      cb(new Error('Only images (JPEG, JPG, PNG) and PDF files are allowed'));
    }
  },
});

export async function registerRoutes(app: Express): Promise<Server> {
  // Auth middleware
  await setupAuth(app);

  // Seed default categories
  try {
    const existingCategories = await storage.getCategories();
    if (existingCategories.length === 0) {
      const defaultCategories = [
        { name: "Equipment", description: "Heavy machinery, tools, and equipment expenses", color: "#F59E0B" },
        { name: "Vehicle", description: "Fuel, maintenance, and vehicle-related costs", color: "#EF4444" },
        { name: "Utilities", description: "Utility bills and related expenses", color: "#3B82F6" },
        { name: "Materials", description: "Construction and utility materials", color: "#10B981" },
        { name: "Meals & Entertainment", description: "Business meals and entertainment", color: "#8B5CF6" },
        { name: "Travel", description: "Travel and accommodation expenses", color: "#F97316" },
      ];
      
      for (const category of defaultCategories) {
        await storage.createCategory(category);
      }
    }
  } catch (error) {
    console.error("Error seeding categories:", error);
  }

  // Auth routes
  app.get('/api/auth/user', isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user.claims?.sub || req.user.id;
      const user = await storage.getUser(userId);
      res.json(user);
    } catch (error) {
      console.error("Error fetching user:", error);
      res.status(500).json({ message: "Failed to fetch user" });
    }
  });

  // Admin bypass for manually created users (development only)
  app.post('/api/auth/impersonate', requireAdmin, async (req: any, res) => {
    try {
      const { userId } = req.body;
      
      if (!userId) {
        return res.status(400).json({ message: "User ID is required" });
      }

      const targetUser = await storage.getUser(userId);
      if (!targetUser) {
        return res.status(404).json({ message: "User not found" });
      }

      // Create a mock session for the target user
      req.login({ 
        id: targetUser.id,
        claims: { 
          sub: targetUser.id,
          email: targetUser.email,
          first_name: targetUser.firstName,
          last_name: targetUser.lastName
        },
        expires_at: Math.floor(Date.now() / 1000) + (24 * 60 * 60) // 24 hours
      }, (err: any) => {
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

  // User routes - Admin and Approver access
  app.get('/api/users', requireApprover, async (req: any, res) => {
    try {
      const users = await storage.getAllUsers();
      res.json(users);
    } catch (error) {
      console.error("Error fetching users:", error);
      res.status(500).json({ message: "Failed to fetch users" });
    }
  });

  app.post('/api/users', requireAdmin, async (req: any, res) => {
    try {
      const { email, firstName, lastName, password, role, profileImageUrl } = req.body;
      
      // Validate required fields
      if (!email || !firstName || !lastName || !password || !role) {
        return res.status(400).json({ message: "Email, first name, last name, password, and role are required" });
      }

      if (password.length < 8) {
        return res.status(400).json({ message: "Password must be at least 8 characters long" });
      }

      if (!Object.values(UserRole).includes(role)) {
        return res.status(400).json({ message: "Invalid role" });
      }

      // Check if user already exists
      const existingUser = await storage.getUserByEmail(email);
      if (existingUser) {
        return res.status(400).json({ message: "User with this email already exists" });
      }

      // Create new user with password
      const userData = {
        id: `manual_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
        email,
        firstName,
        lastName,
        role,
        profileImageUrl: profileImageUrl || null,
      };

      const user = await storage.createManualUser(userData, password);
      res.status(201).json(user);
    } catch (error) {
      console.error("Error creating user:", error);
      res.status(500).json({ message: "Failed to create user" });
    }
  });

  app.put('/api/users/:id', requireAdmin, async (req: any, res) => {
    try {
      // Validate the request body
      const validatedData = updateUserSchema.parse(req.body);
      
      // Check if user exists
      const existingUser = await storage.getUser(req.params.id);
      if (!existingUser) {
        return res.status(404).json({ message: "User not found" });
      }

      // If email is being changed, check if new email is already in use by another user
      if (validatedData.email && validatedData.email !== existingUser.email) {
        const userWithEmail = await storage.getUserByEmail(validatedData.email);
        if (userWithEmail && userWithEmail.id !== req.params.id) {
          return res.status(400).json({ message: "Email is already in use by another user" });
        }
      }

      const user = await storage.updateUser(req.params.id, validatedData);
      res.json(user);
    } catch (error) {
      if (error instanceof ZodError) {
        return res.status(400).json({ message: "Invalid data", errors: error.errors });
      }
      console.error("Error updating user:", error);
      res.status(500).json({ message: "Failed to update user" });
    }
  });

  app.put('/api/users/:id/role', requireAdmin, async (req: any, res) => {
    try {
      const { role } = req.body;
      if (!Object.values(UserRole).includes(role)) {
        return res.status(400).json({ message: "Invalid role" });
      }

      // Prevent demoting the last admin
      if (role !== UserRole.ADMIN) {
        const allUsers = await storage.getAllUsers();
        const adminCount = allUsers.filter(u => u.role === UserRole.ADMIN).length;
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

  // Category routes
  app.get('/api/categories', isAuthenticated, async (req, res) => {
    try {
      const categories = await storage.getCategories();
      res.json(categories);
    } catch (error) {
      console.error("Error fetching categories:", error);
      res.status(500).json({ message: "Failed to fetch categories" });
    }
  });

  app.post('/api/categories', requireAdmin, async (req: any, res) => {
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

  app.put('/api/categories/:id', requireAdmin, async (req: any, res) => {
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

  app.delete('/api/categories/:id', requireAdmin, async (req: any, res) => {
    try {
      await storage.deleteCategory(req.params.id);
      res.status(204).send();
    } catch (error: any) {
      console.error("Error deleting category:", error);
      
      // Handle foreign key constraint violation
      if (error.code === '23503') {
        return res.status(400).json({ 
          message: "Cannot delete category because it has associated expenses. Please reassign or delete the expenses first." 
        });
      }
      
      res.status(500).json({ message: "Failed to delete category" });
    }
  });

  // Expense approval routes - Approver and Admin access
  app.put('/api/expenses/:id/approve', requireApprover, async (req: any, res) => {
    try {
      const { status } = req.body;
      if (!['approved', 'rejected'].includes(status)) {
        return res.status(400).json({ message: "Invalid status. Must be 'approved' or 'rejected'" });
      }

      const expense = await storage.updateExpenseStatus(req.params.id, status);
      res.json(expense);
    } catch (error) {
      console.error("Error updating expense status:", error);
      res.status(500).json({ message: "Failed to update expense status" });
    }
  });

  app.put('/api/expenses/:id/resubmit', isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user.claims.sub;
      const user = await storage.getUser(userId);
      const expense = await storage.getExpenseById(req.params.id);
      
      if (!expense) {
        return res.status(404).json({ message: "Expense not found" });
      }

      // Users can only resubmit their own expenses, admins and approvers can resubmit any
      if (!(user?.role === "admin" || user?.role === "approver") && expense.userId !== userId) {
        return res.status(403).json({ message: "You can only resubmit your own expenses" });
      }

      // Only allow resubmitting if expense is rejected
      if (expense.status !== 'rejected') {
        return res.status(403).json({ message: "Only rejected expenses can be resubmitted" });
      }

      const resubmittedExpense = await storage.updateExpenseStatus(req.params.id, 'pending');
      res.json(resubmittedExpense);
    } catch (error) {
      console.error("Error resubmitting expense:", error);
      res.status(500).json({ message: "Failed to resubmit expense" });
    }
  });

  // Expense routes
  app.get('/api/expenses/my/recent', isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user.claims.sub;
      
      // Get user's 5 most recent expenses regardless of status
      const expenses = await storage.getRecentUserExpenses(userId, 5);
      
      res.json(expenses);
    } catch (error) {
      console.error("Error fetching recent user expenses:", error);
      res.status(500).json({ message: "Failed to fetch recent user expenses" });
    }
  });

  app.get('/api/expenses/pending', requireApprover, async (req: any, res) => {
    try {
      // Get all pending expenses for approver/admin approval
      const expenses = await storage.getPendingExpenses();
      
      res.json(expenses);
    } catch (error) {
      console.error("Error fetching pending expenses:", error);
      res.status(500).json({ message: "Failed to fetch pending expenses" });
    }
  });

  app.get('/api/expenses/my', isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user.claims.sub;
      
      const filters = {
        status: req.query.status as string,
        categoryId: req.query.categoryId as string,
        search: req.query.search as string,
      };

      // Always get only current user's expenses for this endpoint
      const expenses = await storage.getExpenses(userId, filters);
      
      res.json(expenses);
    } catch (error) {
      console.error("Error fetching user expenses:", error);
      res.status(500).json({ message: "Failed to fetch user expenses" });
    }
  });

  app.get('/api/expenses', isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user.claims.sub;
      const user = await storage.getUser(userId);
      
      const filters = {
        status: req.query.status as string,
        categoryId: req.query.categoryId as string,
        search: req.query.search as string,
      };

      // Admins and approvers can see all expenses, basic users only see their own
      const expenses = await storage.getExpenses(
        (user?.role === "admin" || user?.role === "approver") ? undefined : userId,
        filters
      );
      
      res.json(expenses);
    } catch (error) {
      console.error("Error fetching expenses:", error);
      res.status(500).json({ message: "Failed to fetch expenses" });
    }
  });

  app.get('/api/expenses/stats', isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user.claims.sub;
      const user = await storage.getUser(userId);
      
      // Admins and approvers get stats for all expenses, basic users only for their own
      const stats = await storage.getExpenseStats(
        (user?.role === "admin" || user?.role === "approver") ? undefined : userId
      );
      
      res.json(stats);
    } catch (error) {
      console.error("Error fetching expense stats:", error);
      res.status(500).json({ message: "Failed to fetch expense stats" });
    }
  });

  // New endpoint for user-specific stats (always filters by current user)
  app.get('/api/expenses/my-stats', isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user.claims.sub;
      
      // Always filter by current user regardless of role
      const stats = await storage.getExpenseStats(userId);
      
      res.json(stats);
    } catch (error) {
      console.error("Error fetching user expense stats:", error);
      res.status(500).json({ message: "Failed to fetch user expense stats" });
    }
  });

  app.get('/api/expenses/analytics/categories', isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user.claims.sub;
      
      // Always show only current user's expenses for dashboard analytics
      const categoryData = await storage.getExpensesByCategory(userId);
      
      res.json(categoryData);
    } catch (error) {
      console.error("Error fetching category analytics:", error);
      res.status(500).json({ message: "Failed to fetch category analytics" });
    }
  });

  app.get('/api/expenses/analytics/monthly', isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user.claims.sub;
      
      // Always show only current user's expenses for dashboard analytics
      const monthlyData = await storage.getMonthlyExpenses(userId);
      
      res.json(monthlyData);
    } catch (error) {
      console.error("Error fetching monthly analytics:", error);
      res.status(500).json({ message: "Failed to fetch monthly analytics" });
    }
  });

  // Time period specific analytics
  app.get('/api/expenses/analytics/period/:period', isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user.claims.sub;
      const { period } = req.params;
      
      if (!['day', 'month', 'quarter'].includes(period)) {
        return res.status(400).json({ message: "Invalid period. Must be 'day', 'month', or 'quarter'" });
      }
      
      const categoryData = await storage.getExpensesByPeriod(userId, period as 'day' | 'month' | 'quarter');
      res.json(categoryData);
    } catch (error) {
      console.error("Error fetching period analytics:", error);
      res.status(500).json({ message: "Failed to fetch period analytics" });
    }
  });

  app.get('/api/expenses/analytics/daily', isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user.claims.sub;
      const year = parseInt(req.query.year as string) || new Date().getFullYear();
      const month = parseInt(req.query.month as string) || (new Date().getMonth() + 1);
      
      const dailyData = await storage.getDailyExpenses(userId, year, month);
      res.json(dailyData);
    } catch (error) {
      console.error("Error fetching daily analytics:", error);
      res.status(500).json({ message: "Failed to fetch daily analytics" });
    }
  });

  app.get('/api/expenses/analytics/quarterly', isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user.claims.sub;
      const year = parseInt(req.query.year as string) || new Date().getFullYear();
      
      const quarterlyData = await storage.getQuarterlyExpenses(userId, year);
      res.json(quarterlyData);
    } catch (error) {
      console.error("Error fetching quarterly analytics:", error);
      res.status(500).json({ message: "Failed to fetch quarterly analytics" });
    }
  });

  app.post('/api/expenses', isAuthenticated, upload.single('receipt'), async (req: any, res) => {
    try {
      const currentUserId = req.user.claims.sub;
      const currentUser = await storage.getUser(currentUserId);
      
      // Determine who the expense is for
      let expenseUserId = currentUserId;
      let submittedBy = null;
      
      // If userId is provided in request body and current user is admin or approver
      if (req.body.userId && (currentUser?.role === "admin" || currentUser?.role === "approver")) {
        expenseUserId = req.body.userId;
        submittedBy = currentUserId; // Manager is submitting for someone else
      }
      
      // Handle date properly to avoid timezone issues
      // If date is in YYYY-MM-DD format, append time to maintain local date
      const dateValue = req.body.date;
      let processedDate;
      
      if (typeof dateValue === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(dateValue)) {
        // For YYYY-MM-DD format, append noon time to avoid timezone shifts
        processedDate = new Date(`${dateValue}T12:00:00`);
      } else {
        processedDate = new Date(dateValue);
      }

      const expenseData = {
        ...req.body,
        userId: expenseUserId,
        submittedBy,
        date: processedDate,
        receiptUrl: req.file ? `/uploads/${req.file.filename}` : undefined,
      };
      
      // Remove the userId from body to avoid duplication in validation
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

  app.put('/api/expenses/:id', isAuthenticated, async (req: any, res) => {
    try {
      const currentUserId = req.user.claims.sub;
      const user = await storage.getUser(currentUserId);
      const expense = await storage.getExpenseById(req.params.id);
      
      if (!expense) {
        return res.status(404).json({ message: "Expense not found" });
      }

      // Users can only edit their own expenses, admins and approvers can edit any
      if (!(user?.role === "admin" || user?.role === "approver") && expense.userId !== currentUserId) {
        return res.status(403).json({ message: "You can only edit your own expenses" });
      }

      // Users can edit their own pending or rejected expenses
      // Admins and approvers can edit any expense regardless of status
      if (!(user?.role === "admin" || user?.role === "approver")) {
        if (expense.status === 'approved') {
          return res.status(403).json({ message: "Cannot edit approved expenses" });
        }
        // Allow editing of pending and rejected expenses for the owner
        if (!(['pending', 'rejected'].includes(expense.status))) {
          return res.status(403).json({ message: "Can only edit pending or rejected expenses" });
        }
      }

      console.log("Updating expense with data:", JSON.stringify(req.body, null, 2));
      console.log("Current expense status:", expense.status);
      console.log("User role:", user?.role);
      
      // Handle date properly to avoid timezone issues in updates
      let processedUpdateData = { ...req.body };
      if (req.body.date) {
        const dateValue = req.body.date;
        if (typeof dateValue === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(dateValue)) {
          // For YYYY-MM-DD format, append noon time to avoid timezone shifts
          processedUpdateData.date = new Date(`${dateValue}T12:00:00`);
        } else if (typeof dateValue === 'string') {
          processedUpdateData.date = new Date(dateValue);
        }
      }
      
      const validatedData = updateExpenseSchema.parse(processedUpdateData);
      console.log("Validated data:", JSON.stringify(validatedData, null, 2));
      
      const updatedExpense = await storage.updateExpense(req.params.id, validatedData);
      res.json(updatedExpense);
    } catch (error) {
      if (error instanceof ZodError) {
        console.error("Zod validation error:", JSON.stringify(error.errors, null, 2));
        return res.status(400).json({ message: "Invalid data", errors: error.errors });
      }
      console.error("Error updating expense:", error);
      res.status(500).json({ message: "Failed to update expense" });
    }
  });

  app.delete('/api/expenses/:id', isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user.claims.sub;
      const user = await storage.getUser(userId);
      const expense = await storage.getExpenseById(req.params.id);
      
      if (!expense) {
        return res.status(404).json({ message: "Expense not found" });
      }

      // Permission logic:
      // 1. Admin/Approver can delete any expense regardless of status (for Entry Management)
      // 2. Regular users can only delete their own non-approved expenses
      if (user?.role === "admin" || user?.role === "approver") {
        // Administrators and approvers can delete any expense
        console.log(`Admin/Approver ${userId} deleting expense ${req.params.id} with status ${expense.status}`);
      } else {
        // Regular users can only delete their own expenses
        if (expense.userId !== userId) {
          return res.status(403).json({ message: "You can only delete your own expenses" });
        }
        
        // Regular users cannot delete approved expenses
        if (expense.status === 'approved') {
          return res.status(403).json({ message: "Cannot delete approved expenses" });
        }
      }

      await storage.deleteExpense(req.params.id);
      res.json({ message: "Expense deleted successfully" });
    } catch (error) {
      console.error("Error deleting expense:", error);
      res.status(500).json({ message: "Failed to delete expense" });
    }
  });

  // Reports endpoint for approvers and administrators
  app.get('/api/reports/expenses', requireApprover, async (req: any, res) => {
    try {
      const { startDate, endDate, status, categoryId, userId } = req.query;
      
      // Build filter criteria
      const filters: any = {};
      
      if (startDate) {
        filters.startDate = new Date(startDate);
      }
      
      if (endDate) {
        filters.endDate = new Date(endDate);
      }
      
      if (status && status !== 'all') {
        filters.status = status;
      }
      
      if (categoryId && categoryId !== 'all') {
        filters.categoryId = categoryId;
      }
      
      if (userId && userId !== 'all') {
        filters.userId = userId;
      }
      
      const reportData = await storage.getExpenseReport(filters);
      res.json(reportData);
    } catch (error) {
      console.error("Error generating expense report:", error);
      res.status(500).json({ message: "Failed to generate expense report" });
    }
  });

  // Database Management Routes - Admin only
  app.get('/api/admin/export/expenses', requireAdmin, async (req: any, res) => {
    try {
      const expenses = await storage.getAllExpensesForExport();
      res.json({
        data: expenses,
        exportDate: new Date().toISOString(),
        recordCount: expenses.length
      });
    } catch (error) {
      console.error("Error exporting expenses:", error);
      res.status(500).json({ message: "Failed to export expenses" });
    }
  });

  app.post('/api/admin/import/expenses', requireAdmin, async (req: any, res) => {
    try {
      const { expenses } = req.body;
      
      if (!Array.isArray(expenses)) {
        return res.status(400).json({ message: "Invalid import data format" });
      }

      // Validate and import expenses
      const importResults = await storage.importExpenses(expenses);
      
      res.json({
        message: "Import completed",
        imported: importResults.imported,
        errors: importResults.errors
      });
    } catch (error) {
      console.error("Error importing expenses:", error);
      res.status(500).json({ message: "Failed to import expenses" });
    }
  });

  app.delete('/api/admin/purge/expenses', requireAdmin, async (req: any, res) => {
    try {
      const deletedCount = await storage.purgeAllExpenses();
      
      res.json({
        message: "All expense records have been purged",
        deletedCount
      });
    } catch (error) {
      console.error("Error purging expenses:", error);
      res.status(500).json({ message: "Failed to purge expenses" });
    }
  });

  app.get('/api/admin/database/stats', requireAdmin, async (req: any, res) => {
    try {
      const stats = await storage.getDatabaseStats();
      res.json(stats);
    } catch (error) {
      console.error("Error fetching database stats:", error);
      res.status(500).json({ message: "Failed to fetch database statistics" });
    }
  });

  // Serve uploaded files
  app.use('/uploads', express.static('uploads'));

  const httpServer = createServer(app);
  return httpServer;
}
