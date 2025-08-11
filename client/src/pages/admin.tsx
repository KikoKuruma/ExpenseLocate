import { useEffect, useState } from "react";
import { useAuth } from "@/hooks/useAuth";
import { useToast } from "@/hooks/use-toast";
import { useQuery } from "@tanstack/react-query";
import Sidebar from "@/components/sidebar";
import AdminCategories from "@/components/admin-categories";
import AdminUsers from "@/components/admin-users";
import AdminDatabase from "@/components/admin-database";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Users, Tags, Database } from "lucide-react";
import type { User } from "@shared/schema";

export default function Admin() {
  const { toast } = useToast();
  const { isAuthenticated, isLoading } = useAuth();

  const { data: user } = useQuery<User>({
    queryKey: ["/api/auth/user"],
    enabled: isAuthenticated,
  });

  useEffect(() => {
    if (!isLoading && !isAuthenticated) {
      toast({
        title: "Unauthorized",
        description: "You are logged out. Logging in again...",
        variant: "destructive",
      });
      setTimeout(() => {
        window.location.href = "/api/login";
      }, 500);
      return;
    }
    
    if (user && user.role !== "admin") {
      toast({
        title: "Access Denied",
        description: "Administrator privileges required",
        variant: "destructive",
      });
      window.location.href = "/";
      return;
    }
  }, [isAuthenticated, isLoading, user, toast]);

  if (isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-ccw-bg">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-ccw-yellow"></div>
      </div>
    );
  }

  if (!isAuthenticated || user?.role !== "admin") {
    return null;
  }

  return (
    <div className="flex h-screen bg-ccw-bg">
      <Sidebar />
      
      <main className="flex-1 overflow-auto">
        {/* Top Bar */}
        <header className="bg-white shadow-sm border-b border-gray-200 px-6 py-4 lg:px-6 pl-20 lg:pl-6">
          <div className="flex items-center justify-between">
            <div>
              <h2 className="text-2xl font-bold text-ccw-dark">Admin Panel</h2>
              <p className="text-gray-600">Manage system settings and categories</p>
            </div>
          </div>
        </header>

        {/* Content */}
        <div className="p-6">
          <Tabs defaultValue="users" className="w-full">
            <TabsList className="grid w-full grid-cols-3">
              <TabsTrigger value="users" className="flex items-center gap-2">
                <Users className="w-4 h-4" />
                User Management
              </TabsTrigger>
              <TabsTrigger value="categories" className="flex items-center gap-2">
                <Tags className="w-4 h-4" />
                Category Management
              </TabsTrigger>
              <TabsTrigger value="database" className="flex items-center gap-2">
                <Database className="w-4 h-4" />
                Database Management
              </TabsTrigger>
            </TabsList>
            
            <TabsContent value="users" className="mt-6">
              <AdminUsers />
            </TabsContent>
            
            <TabsContent value="categories" className="mt-6">
              <AdminCategories />
            </TabsContent>
            
            <TabsContent value="database" className="mt-6">
              <AdminDatabase />
            </TabsContent>
          </Tabs>
        </div>
      </main>
    </div>
  );
}
