import { Link, useLocation } from "wouter";
import { useQuery } from "@tanstack/react-query";
import { CheckCircle, LayoutDashboard, Receipt, Plus, Settings, LogOut, FileBarChart, ClipboardCheck, Menu, X, Edit } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Sheet, SheetContent, SheetTrigger, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { cn } from "@/lib/utils";
import { useState } from "react";
import type { User } from "@shared/schema";

export default function Sidebar() {
  const [location] = useLocation();
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);
  
  const { data: user } = useQuery<User>({
    queryKey: ["/api/auth/user"],
  });

  const navigation = [
    {
      name: "Dashboard",
      href: "/",
      icon: LayoutDashboard,
      current: location === "/",
    },
    {
      name: "My Expenses",
      href: "/expenses",
      icon: Receipt,
      current: location === "/expenses",
    },
  ];

  // Add My Approvals for approvers and administrators
  if (user?.role === "approver" || user?.role === "admin") {
    navigation.push({
      name: "My Approvals",
      href: "/approvals",
      icon: ClipboardCheck,
      current: location === "/approvals",
    });
  }

  // Add Entry Management for approvers and administrators
  if (user?.role === "approver" || user?.role === "admin") {
    navigation.push({
      name: "Entry Management",
      href: "/reports",
      icon: Edit,
      current: location === "/reports",
    });
  }

  if (user?.role === "admin") {
    navigation.push({
      name: "Admin Panel",
      href: "/admin",
      icon: Settings,
      current: location === "/admin",
    });
  }

  // Create the navigation content component to reuse in both desktop and mobile
  const NavigationContent = ({ onLinkClick }: { onLinkClick?: () => void }) => (
    <>
      <div className="px-6 mb-6">
        <div className="flex items-center space-x-3 p-3 bg-ccw-yellow bg-opacity-10 rounded-lg border-l-4 border-ccw-yellow">
          <div className="w-8 h-8 bg-ccw-yellow rounded-full flex items-center justify-center">
            <span className="text-sm font-medium text-ccw-dark">
              {user?.firstName?.[0]}{user?.lastName?.[0]}
            </span>
          </div>
          <div className="flex-1">
            <div className="flex items-center gap-2 flex-wrap">
              <span className="font-medium text-ccw-dark" data-testid="text-user-name">
                {user?.firstName} {user?.lastName}
              </span>
              {user?.role === "admin" && (
                <span className="px-2 py-1 text-xs bg-red-100 text-red-800 rounded-full font-medium">
                  Administrator
                </span>
              )}
              {user?.role === "approver" && (
                <span className="px-2 py-1 text-xs bg-green-100 text-green-800 rounded-full font-medium">
                  Approver
                </span>
              )}
            </div>
          </div>
        </div>
        <p className="text-xs text-gray-500 mt-2" data-testid="text-user-email">
          {user?.email}
        </p>
      </div>

      <div className="px-3">
        {navigation.map((item) => (
          <Link key={item.name} href={item.href}>
            <div
              className={cn(
                "flex items-center space-x-3 px-3 py-2 rounded-lg mb-1 transition-colors cursor-pointer",
                item.current
                  ? "bg-ccw-yellow bg-opacity-10 text-ccw-dark font-medium"
                  : "text-gray-600 hover:bg-gray-100"
              )}
              data-testid={`link-${item.name.toLowerCase().replace(/\s+/g, '-')}`}
              onClick={onLinkClick}
            >
              <div className="flex items-center space-x-3">
                <item.icon className="w-5 h-5" />
                <span>{item.name}</span>
              </div>
            </div>
          </Link>
        ))}
        
        <div className="border-t border-gray-200 my-4"></div>
        
        <Button
          onClick={() => window.location.href = "/api/logout"}
          variant="ghost"
          className="w-full justify-start text-gray-600 hover:bg-gray-100"
          data-testid="button-logout"
        >
          <LogOut className="w-5 h-5 mr-3" />
          Log Out
        </Button>
      </div>
    </>
  );

  return (
    <>
      {/* Desktop Sidebar */}
      <aside className="w-64 bg-white shadow-lg border-r border-gray-200 hidden lg:block">
        <div className="p-6 border-b border-gray-200">
          <div className="flex items-center space-x-3">
            <div className="w-10 h-10 bg-ccw-yellow rounded-lg flex items-center justify-center">
              <CheckCircle className="w-6 h-6 text-ccw-dark" />
            </div>
            <div>
              <h1 className="text-lg font-bold text-ccw-dark">ExpenseLocator</h1>
              <p className="text-sm text-gray-500">Expense Tracker</p>
            </div>
          </div>
        </div>
        
        <nav className="mt-6">
          <NavigationContent />
        </nav>
      </aside>

      {/* Mobile Menu Button */}
      <div className="lg:hidden fixed top-4 left-4 z-50">
        <Sheet open={isMobileMenuOpen} onOpenChange={setIsMobileMenuOpen}>
          <SheetTrigger asChild>
            <Button
              variant="outline"
              size="sm"
              className="bg-white/90 backdrop-blur-sm shadow-lg border-gray-200"
              data-testid="button-mobile-menu"
            >
              <Menu className="w-5 h-5" />
            </Button>
          </SheetTrigger>
          <SheetContent side="left" className="w-64 p-0">
            <div className="p-6 border-b border-gray-200">
              <SheetHeader>
                <SheetTitle className="flex items-center space-x-3">
                  <div className="w-10 h-10 bg-ccw-yellow rounded-lg flex items-center justify-center">
                    <CheckCircle className="w-6 h-6 text-ccw-dark" />
                  </div>
                  <div className="text-left">
                    <h1 className="text-lg font-bold text-ccw-dark">ExpenseLocator</h1>
                    <p className="text-sm text-gray-500 font-normal">Expense Tracker</p>
                  </div>
                </SheetTitle>
              </SheetHeader>
            </div>
            
            <nav className="mt-6">
              <NavigationContent onLinkClick={() => setIsMobileMenuOpen(false)} />
            </nav>
          </SheetContent>
        </Sheet>
      </div>
    </>
  );
}
