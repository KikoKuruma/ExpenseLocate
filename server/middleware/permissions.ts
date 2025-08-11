import type { RequestHandler } from "express";
import { storage } from "../storage";
import { UserRole, hasPermission } from "@shared/schema";

export const requireRole = (requiredRole: UserRole): RequestHandler => {
  return async (req: any, res, next) => {
    try {
      // Check if user is authenticated
      if (!req.user || !req.user.claims) {
        return res.status(401).json({ message: "Authentication required" });
      }
      
      // Get user ID from claims
      const userId = req.user.claims.sub;
      console.log('Checking permissions for user:', userId);
      
      const currentUser = await storage.getUser(userId);
      
      if (!currentUser) {
        return res.status(401).json({ message: "User not found" });
      }
      
      console.log('User role:', currentUser.role, 'Required role:', requiredRole);
      
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
      
      // Attach user to request for convenience
      req.currentUser = currentUser;
      next();
    } catch (error) {
      console.error("Error checking permissions:", error);
      res.status(500).json({ message: "Failed to verify permissions" });
    }
  };
};

export const requireAdmin = requireRole(UserRole.ADMIN);
export const requireApprover = requireRole(UserRole.APPROVER);