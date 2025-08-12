import { useState, useEffect } from "react";
import { useAuth } from "@/hooks/useAuth";
import { useToast } from "@/hooks/use-toast";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { format, startOfMonth, endOfMonth, subMonths } from "date-fns";
import Sidebar from "@/components/sidebar";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger } from "@/components/ui/alert-dialog";
import { 
  FileBarChart, 
  Calendar,
  DollarSign,
  Filter,
  Download,
  Eye,
  Edit,
  Trash2,
  TrendingUp,
  Users,
  Receipt
} from "lucide-react";
import * as XLSX from 'xlsx';
import ExpenseForm from "@/components/expense-form";
import { apiRequest } from "@/lib/queryClient";
import type { Expense, Category, User } from "@shared/schema";

interface ReportFilters {
  startDate: string;
  endDate: string;
  status: string;
  categoryId: string;
  userId: string;
}

interface ReportData {
  expenses: Expense[];
  totalAmount: number;
  expenseCount: number;
}

const statusColors = {
  pending: "bg-yellow-100 text-yellow-800 border-yellow-200",
  approved: "bg-green-100 text-green-800 border-green-200",
  rejected: "bg-red-100 text-red-800 border-red-200",
};

export default function EntryManagement() {
  const { toast } = useToast();
  const { user, isAuthenticated, isLoading } = useAuth();
  const queryClient = useQueryClient();
  
  const [selectedExpense, setSelectedExpense] = useState<Expense | null>(null);
  const [showEditDialog, setShowEditDialog] = useState(false);
  const [showDetailsDialog, setShowDetailsDialog] = useState(false);
  
  // Initialize filters with current month
  const now = new Date();
  const [filters, setFilters] = useState<ReportFilters>({
    startDate: format(startOfMonth(now), 'yyyy-MM-dd'),
    endDate: format(endOfMonth(now), 'yyyy-MM-dd'),
    status: 'all',
    categoryId: 'all',
    userId: 'all'
  });

  // Redirect to login if not authenticated
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
  }, [isAuthenticated, isLoading, toast]);

  // Check authorization - only approvers and admins
  useEffect(() => {
    if (user && user.role !== 'approver' && user.role !== 'admin') {
      toast({
        title: "Access Denied",
        description: "You don't have permission to access reports.",
        variant: "destructive",
      });
      window.location.href = "/dashboard";
      return;
    }
  }, [user, toast]);

  // Fetch categories for filter dropdown
  const { data: categories = [] } = useQuery<Category[]>({
    queryKey: ["/api/categories"],
    enabled: !!user,
  });

  // Fetch all users for user filter dropdown
  const { data: allUsers = [] } = useQuery<User[]>({
    queryKey: ["/api/users"],
    enabled: !!user && (user.role === 'approver' || user.role === 'admin'),
  });

  // Fetch report data based on filters
  const { data: reportData, isLoading: reportLoading, refetch } = useQuery<ReportData>({
    queryKey: ["/api/reports/expenses", filters],
    queryFn: async () => {
      const params = new URLSearchParams();
      if (filters.startDate) params.append('startDate', filters.startDate);
      if (filters.endDate) params.append('endDate', filters.endDate);
      if (filters.status && filters.status !== 'all') params.append('status', filters.status);
      if (filters.categoryId && filters.categoryId !== 'all') params.append('categoryId', filters.categoryId);
      if (filters.userId && filters.userId !== 'all') params.append('userId', filters.userId);
      
      const url = `/api/reports/expenses?${params.toString()}`;
      console.log('Fetching reports with URL:', url);
      
      const response = await fetch(url, {
        credentials: 'include'
      });
      
      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }
      
      const data = await response.json();
      console.log('Report data received:', data);
      return data;
    },
    enabled: !!user && (user.role === 'approver' || user.role === 'admin'),
  });

  const handleFilterChange = (field: keyof ReportFilters, value: string) => {
    setFilters(prev => ({
      ...prev,
      [field]: value
    }));
  };

  const setQuickDateRange = (range: 'thisMonth' | 'lastMonth' | 'thisQuarter' | 'thisYear') => {
    const now = new Date();
    let startDate: Date;
    let endDate: Date;

    switch (range) {
      case 'thisMonth':
        startDate = startOfMonth(now);
        endDate = endOfMonth(now);
        break;
      case 'lastMonth':
        const lastMonth = subMonths(now, 1);
        startDate = startOfMonth(lastMonth);
        endDate = endOfMonth(lastMonth);
        break;
      case 'thisQuarter':
        const quarterStart = Math.floor(now.getMonth() / 3) * 3;
        startDate = new Date(now.getFullYear(), quarterStart, 1);
        endDate = new Date(now.getFullYear(), quarterStart + 3, 0);
        break;
      case 'thisYear':
        startDate = new Date(now.getFullYear(), 0, 1);
        endDate = new Date(now.getFullYear(), 11, 31);
        break;
    }

    setFilters(prev => ({
      ...prev,
      startDate: format(startDate, 'yyyy-MM-dd'),
      endDate: format(endDate, 'yyyy-MM-dd')
    }));
  };

  const getCategoryName = (categoryId: string) => {
    const category = categories.find(c => c.id === categoryId);
    return category?.name || 'Unknown Category';
  };

  const getUserName = (userId: string) => {
    const user = allUsers.find(u => u.id === userId);
    return user ? `${user.firstName} ${user.lastName}` : 'Unknown User';
  };

  // Delete expense mutation
  const deleteExpenseMutation = useMutation({
    mutationFn: async (expenseId: string) => {
      const response = await apiRequest("DELETE", `/api/expenses/${expenseId}`);
      if (!response.ok) {
        throw new Error("Failed to delete expense");
      }
      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/reports/expenses"] });
      toast({
        title: "Success",
        description: "Expense deleted successfully",
      });
    },
    onError: (error: Error) => {
      toast({
        title: "Error",
        description: error.message,
        variant: "destructive",
      });
    },
  });

  const handleEdit = (expense: Expense) => {
    setSelectedExpense(expense);
    setShowEditDialog(true);
  };

  const handleViewDetails = (expense: Expense) => {
    setSelectedExpense(expense);
    setShowDetailsDialog(true);
  };

  const handleDelete = async (expenseId: string) => {
    deleteExpenseMutation.mutate(expenseId);
  };

  const exportToExcel = () => {
    if (!reportData?.expenses || reportData.expenses.length === 0) {
      toast({
        title: "No Data",
        description: "No expense data to export",
        variant: "destructive",
      });
      return;
    }

    // Prepare data for Excel export with database import compatibility
    const exportData = reportData.expenses.map((expense: any) => ({
      'User ID': expense.userId,
      'Category ID': expense.categoryId,
      'Description': expense.description,
      'Amount': expense.amount,
      'Date': format(new Date(expense.date), 'yyyy-MM-dd'),
      'Status': expense.status,
      'Notes': expense.notes || '',
      'Receipt URL': expense.receiptUrl || '',
      'Submitted By ID': expense.submittedBy || expense.userId,
      // User-friendly columns for reference
      'User Name': expense.user ? `${expense.user.firstName} ${expense.user.lastName}` : 'Unknown',
      'User Email': expense.user?.email || '',
      'Category Name': expense.category?.name || 'Unknown Category'
    }));

    // Create workbook and worksheet
    const workbook = XLSX.utils.book_new();
    const worksheet = XLSX.utils.json_to_sheet(exportData);

    // Set column widths
    const columnWidths = [
      { wch: 15 }, // User ID
      { wch: 15 }, // Category ID
      { wch: 30 }, // Description
      { wch: 12 }, // Amount
      { wch: 12 }, // Date
      { wch: 12 }, // Status
      { wch: 30 }, // Notes
      { wch: 30 }, // Receipt URL
      { wch: 15 }, // Submitted By ID
      { wch: 20 }, // User Name
      { wch: 25 }, // User Email
      { wch: 20 }, // Category Name
    ];
    worksheet['!cols'] = columnWidths;

    // Add the worksheet to the workbook
    XLSX.utils.book_append_sheet(workbook, worksheet, 'Expense Report');

    // Generate filename with current date and filter info
    const dateRange = `${filters.startDate}_to_${filters.endDate}`;
    const filename = `expense_report_${dateRange}.xlsx`;

    // Export the file
    XLSX.writeFile(workbook, filename);

    toast({
      title: "Export Successful",
      description: `Expense report exported as ${filename}`,
    });
  };

  const formatCurrency = (amount: number) => {
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: 'USD'
    }).format(amount);
  };

  if (isLoading) {
    return <div className="flex items-center justify-center min-h-screen">Loading...</div>;
  }

  if (!isAuthenticated || !user) {
    return null;
  }

  if (user.role !== 'approver' && user.role !== 'admin') {
    return null;
  }

  return (
    <div className="flex h-screen bg-gray-50 dark:bg-gray-900">
      <Sidebar />
      
      <div className="flex-1 flex flex-col overflow-hidden">
        <main className="flex-1 overflow-x-hidden overflow-y-auto bg-gray-50 dark:bg-gray-900">
          <div className="container mx-auto px-6 py-8 lg:px-6 pl-20 lg:pl-6">
            {/* Header */}
            <div className="mb-8">
              <div className="flex items-center mb-4">
                <Edit className="w-8 h-8 text-ccw-yellow mr-3" />
                <h1 className="text-3xl font-bold text-gray-900 dark:text-white">
                  Entry Management
                </h1>
              </div>
              <p className="text-gray-600 dark:text-gray-400">
                View, edit, and manage expense entries with advanced filtering and export capabilities
              </p>
            </div>

            {/* Essential Stats Callouts */}
            {reportData && (
              <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mb-6">
                <Card className="border-l-4 border-l-blue-500">
                  <CardContent className="p-4">
                    <div className="flex items-center justify-between">
                      <div>
                        <p className="text-sm text-gray-600 dark:text-gray-400">Total Entries</p>
                        <p className="text-2xl font-bold text-gray-900 dark:text-white">
                          {reportData.expenseCount}
                        </p>
                      </div>
                      <Receipt className="w-8 h-8 text-blue-500" />
                    </div>
                  </CardContent>
                </Card>
                
                <Card className="border-l-4 border-l-green-500">
                  <CardContent className="p-4">
                    <div className="flex items-center justify-between">
                      <div>
                        <p className="text-sm text-gray-600 dark:text-gray-400">Total Amount</p>
                        <p className="text-2xl font-bold text-gray-900 dark:text-white">
                          {formatCurrency(reportData.totalAmount)}
                        </p>
                      </div>
                      <DollarSign className="w-8 h-8 text-green-500" />
                    </div>
                  </CardContent>
                </Card>
                
                <Card className="border-l-4 border-l-yellow-500">
                  <CardContent className="p-4">
                    <div className="flex items-center justify-between">
                      <div>
                        <p className="text-sm text-gray-600 dark:text-gray-400">Pending</p>
                        <p className="text-2xl font-bold text-gray-900 dark:text-white">
                          {reportData.expenses.filter(e => e.status === 'pending').length}
                        </p>
                      </div>
                      <TrendingUp className="w-8 h-8 text-yellow-500" />
                    </div>
                  </CardContent>
                </Card>
                
                <Card className="border-l-4 border-l-purple-500">
                  <CardContent className="p-4">
                    <div className="flex items-center justify-between">
                      <div>
                        <p className="text-sm text-gray-600 dark:text-gray-400">Unique Users</p>
                        <p className="text-2xl font-bold text-gray-900 dark:text-white">
                          {new Set(reportData.expenses.map(e => e.userId)).size}
                        </p>
                      </div>
                      <Users className="w-8 h-8 text-purple-500" />
                    </div>
                  </CardContent>
                </Card>
              </div>
            )}

            {/* Filters Card */}
            <Card className="mb-6">
              <CardHeader>
                <CardTitle className="dialog-title-enhanced flex items-center gap-2">
                  <Filter className="w-5 h-5 text-ccw-yellow" />
                  Report Filters
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-6">
                {/* Quick Date Range Buttons */}
                <div>
                  <Label className="form-label-enhanced">Quick Date Ranges</Label>
                  <div className="flex flex-wrap gap-2 mt-2">
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => setQuickDateRange('thisMonth')}
                      data-testid="button-this-month"
                    >
                      This Month
                    </Button>
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => setQuickDateRange('lastMonth')}
                      data-testid="button-last-month"
                    >
                      Last Month
                    </Button>
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => setQuickDateRange('thisQuarter')}
                      data-testid="button-this-quarter"
                    >
                      This Quarter
                    </Button>
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => setQuickDateRange('thisYear')}
                      data-testid="button-this-year"
                    >
                      This Year
                    </Button>
                  </div>
                </div>

                {/* Custom Date Range */}
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div>
                    <Label htmlFor="startDate" className="form-label-enhanced">Start Date</Label>
                    <Input
                      id="startDate"
                      type="date"
                      value={filters.startDate}
                      onChange={(e) => handleFilterChange('startDate', e.target.value)}
                      data-testid="input-start-date"
                    />
                  </div>
                  <div>
                    <Label htmlFor="endDate" className="form-label-enhanced">End Date</Label>
                    <Input
                      id="endDate"
                      type="date"
                      value={filters.endDate}
                      onChange={(e) => handleFilterChange('endDate', e.target.value)}
                      data-testid="input-end-date"
                    />
                  </div>
                </div>

                {/* Status, Category, and User Filters */}
                <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                  <div>
                    <Label className="form-label-enhanced">Status Filter</Label>
                    <Select 
                      value={filters.status} 
                      onValueChange={(value) => handleFilterChange('status', value)}
                    >
                      <SelectTrigger data-testid="select-status-filter">
                        <SelectValue placeholder="All Statuses" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="all">All Statuses</SelectItem>
                        <SelectItem value="pending">Pending</SelectItem>
                        <SelectItem value="approved">Approved</SelectItem>
                        <SelectItem value="rejected">Rejected</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  <div>
                    <Label className="form-label-enhanced">Category Filter</Label>
                    <Select 
                      value={filters.categoryId} 
                      onValueChange={(value) => handleFilterChange('categoryId', value)}
                    >
                      <SelectTrigger data-testid="select-category-filter">
                        <SelectValue placeholder="All Categories" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="all">All Categories</SelectItem>
                        {categories
                          .filter(category => !category.parentId) // Show parent categories first
                          .map((parentCategory) => (
                            <div key={parentCategory.id}>
                              <SelectItem value={parentCategory.id}>
                                <div className="flex items-center space-x-2">
                                  <div 
                                    className="w-3 h-3 rounded border"
                                    style={{ 
                                      backgroundColor: parentCategory.color || '#6B7280',
                                      borderColor: parentCategory.color || '#6B7280'
                                    }}
                                  />
                                  <span className="font-medium">{parentCategory.name}</span>
                                </div>
                              </SelectItem>
                              {/* Show subcategories */}
                              {categories
                                .filter(subcat => subcat.parentId === parentCategory.id)
                                .map((subcategory) => (
                                  <SelectItem key={subcategory.id} value={subcategory.id}>
                                    <div className="flex items-center space-x-2 ml-4">
                                      <div 
                                        className="w-3 h-3 rounded border"
                                        style={{ 
                                          backgroundColor: subcategory.color || '#6B7280',
                                          borderColor: subcategory.color || '#6B7280'
                                        }}
                                      />
                                      <span className="text-sm">↳ {subcategory.name}</span>
                                    </div>
                                  </SelectItem>
                                ))}
                            </div>
                          ))}
                        {/* Show categories without parents that aren't already shown */}
                        {categories
                          .filter(category => category.parentId && !categories.find(p => p.id === category.parentId))
                          .map((orphanCategory) => (
                            <SelectItem key={orphanCategory.id} value={orphanCategory.id}>
                              <div className="flex items-center space-x-2">
                                <div 
                                  className="w-3 h-3 rounded border"
                                  style={{ 
                                    backgroundColor: orphanCategory.color || '#6B7280',
                                    borderColor: orphanCategory.color || '#6B7280'
                                  }}
                                />
                                <span>{orphanCategory.name}</span>
                              </div>
                            </SelectItem>
                          ))}
                      </SelectContent>
                    </Select>
                  </div>
                  <div>
                    <Label className="form-label-enhanced">User Filter</Label>
                    <Select 
                      value={filters.userId} 
                      onValueChange={(value) => handleFilterChange('userId', value)}
                    >
                      <SelectTrigger data-testid="select-user-filter">
                        <SelectValue placeholder="All Users" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="all">All Users</SelectItem>
                        {allUsers.map((user) => (
                          <SelectItem key={user.id} value={user.id}>
                            <div className="flex items-center space-x-2">
                              <div className="w-6 h-6 bg-ccw-yellow rounded-full flex items-center justify-center">
                                <span className="text-xs font-medium text-ccw-dark">
                                  {user.firstName?.[0]}{user.lastName?.[0]}
                                </span>
                              </div>
                              <span>{user.firstName} {user.lastName}</span>
                              {user.role === "admin" && (
                                <span className="px-1 py-0.5 text-xs bg-red-100 text-red-800 rounded font-medium">
                                  Admin
                                </span>
                              )}
                              {user.role === "approver" && (
                                <span className="px-1 py-0.5 text-xs bg-green-100 text-green-800 rounded font-medium">
                                  Approver
                                </span>
                              )}
                            </div>
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                </div>
              </CardContent>
            </Card>

            {/* Report Summary */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-6">
              <Card>
                <CardContent className="p-6">
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="text-sm font-medium text-gray-600 dark:text-gray-400">
                        Total Amount
                      </p>
                      <p className="text-2xl font-bold text-ccw-dark" data-testid="text-total-amount">
                        {formatCurrency(reportData?.totalAmount || 0)}
                      </p>
                    </div>
                    <DollarSign className="w-8 h-8 text-ccw-green" />
                  </div>
                </CardContent>
              </Card>

              <Card>
                <CardContent className="p-6">
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="text-sm font-medium text-gray-600 dark:text-gray-400">
                        Expense Count
                      </p>
                      <p className="text-2xl font-bold text-ccw-dark" data-testid="text-expense-count">
                        {reportData?.expenseCount || 0}
                      </p>
                    </div>
                    <FileBarChart className="w-8 h-8 text-ccw-yellow" />
                  </div>
                </CardContent>
              </Card>

              <Card>
                <CardContent className="p-6">
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="text-sm font-medium text-gray-600 dark:text-gray-400">
                        Average Amount
                      </p>
                      <p className="text-2xl font-bold text-ccw-dark" data-testid="text-average-amount">
                        {formatCurrency(
                          reportData?.expenseCount && reportData?.expenseCount > 0 
                            ? reportData.totalAmount / reportData.expenseCount 
                            : 0
                        )}
                      </p>
                    </div>
                    <Calendar className="w-8 h-8 text-ccw-brown" />
                  </div>
                </CardContent>
              </Card>
            </div>

            {/* Expenses Table */}
            {reportLoading ? (
              <Card>
                <CardContent className="p-6">
                  <div className="text-center">Loading report data...</div>
                </CardContent>
              </Card>
            ) : (
              <Card>
                <CardHeader>
                  <CardTitle className="dialog-title-enhanced flex items-center justify-between">
                    <span className="flex items-center gap-2">
                      <Eye className="w-5 h-5 text-ccw-yellow" />
                      Expense Details
                    </span>
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={exportToExcel}
                      data-testid="button-export"
                      disabled={!reportData?.expenses || reportData.expenses.length === 0}
                    >
                      <Download className="w-4 h-4 mr-2" />
                      Export to Excel
                    </Button>
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  {reportData?.expenses && reportData.expenses.length > 0 ? (
                    <div className="overflow-x-auto">
                      <table className="min-w-full divide-y divide-gray-200 dark:divide-gray-700">
                        <thead className="bg-gray-50 dark:bg-gray-800">
                          <tr>
                            <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                              Date
                            </th>
                            <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                              Description
                            </th>
                            <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                              Category
                            </th>
                            <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                              Amount
                            </th>
                            <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                              Status
                            </th>
                            <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                              Submitted By
                            </th>
                            <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                              Actions
                            </th>
                          </tr>
                        </thead>
                        <tbody className="bg-white dark:bg-gray-900 divide-y divide-gray-200 dark:divide-gray-700">
                          {reportData.expenses.map((expense: any) => (
                            <tr key={expense.id} className="hover:bg-gray-50 dark:hover:bg-gray-800">
                              <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900 dark:text-gray-100">
                                {format(new Date(expense.date), 'MMM dd, yyyy')}
                              </td>
                              <td className="px-6 py-4 text-sm text-gray-900 dark:text-gray-100">
                                {expense.description}
                              </td>
                              <td className="px-6 py-4 whitespace-nowrap text-sm">
                                <div className="flex items-center space-x-2">
                                  <div 
                                    className="w-3 h-3 rounded border"
                                    style={{ 
                                      backgroundColor: expense.category?.color || '#6B7280',
                                      borderColor: expense.category?.color || '#6B7280'
                                    }}
                                  />
                                  <span className="text-gray-900 dark:text-gray-100">
                                    {expense.category?.name || 'Unknown'}
                                  </span>
                                </div>
                              </td>
                              <td className="px-6 py-4 whitespace-nowrap text-sm font-medium text-gray-900 dark:text-gray-100">
                                {formatCurrency(parseFloat(expense.amount))}
                              </td>
                              <td className="px-6 py-4 whitespace-nowrap">
                                <Badge 
                                  className={statusColors[expense.status as keyof typeof statusColors]}
                                >
                                  {expense.status}
                                </Badge>
                              </td>
                              <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900 dark:text-gray-100">
                                {expense.user?.firstName && expense.user?.lastName 
                                  ? `${expense.user.firstName} ${expense.user.lastName}`
                                  : expense.user?.email || 'Unknown User'}
                              </td>
                              <td className="px-6 py-4 whitespace-nowrap text-sm font-medium">
                                <div className="flex items-center space-x-2">
                                  <Button
                                    variant="ghost"
                                    size="sm"
                                    onClick={() => handleViewDetails(expense)}
                                    data-testid={`button-view-${expense.id}`}
                                    className="text-blue-600 hover:text-blue-900"
                                  >
                                    <Eye className="w-4 h-4" />
                                  </Button>
                                  <Button
                                    variant="ghost"
                                    size="sm"
                                    onClick={() => handleEdit(expense)}
                                    data-testid={`button-edit-${expense.id}`}
                                    className="text-green-600 hover:text-green-900"
                                  >
                                    <Edit className="w-4 h-4" />
                                  </Button>
                                  <AlertDialog>
                                    <AlertDialogTrigger asChild>
                                      <Button
                                        variant="ghost"
                                        size="sm"
                                        data-testid={`button-delete-${expense.id}`}
                                        className="text-red-600 hover:text-red-900"
                                      >
                                        <Trash2 className="w-4 h-4" />
                                      </Button>
                                    </AlertDialogTrigger>
                                    <AlertDialogContent>
                                      <AlertDialogHeader>
                                        <AlertDialogTitle>Delete Expense</AlertDialogTitle>
                                        <AlertDialogDescription>
                                          Are you sure you want to delete this expense? This action cannot be undone.
                                        </AlertDialogDescription>
                                      </AlertDialogHeader>
                                      <AlertDialogFooter>
                                        <AlertDialogCancel>Cancel</AlertDialogCancel>
                                        <AlertDialogAction
                                          onClick={() => handleDelete(expense.id)}
                                          className="bg-red-600 hover:bg-red-700"
                                        >
                                          Delete
                                        </AlertDialogAction>
                                      </AlertDialogFooter>
                                    </AlertDialogContent>
                                  </AlertDialog>
                                </div>
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  ) : (
                    <div className="text-center py-8">
                      <FileBarChart className="w-16 h-16 text-gray-400 mx-auto mb-4" />
                      <p className="text-gray-500 dark:text-gray-400">
                        No expenses found for the selected criteria
                      </p>
                    </div>
                  )}
                </CardContent>
              </Card>
            )}
          </div>
        </main>
      </div>

      {/* Expense Details Dialog */}
      <Dialog open={showDetailsDialog} onOpenChange={setShowDetailsDialog}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>Expense Details</DialogTitle>
          </DialogHeader>
          {selectedExpense && (
            <div className="space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <p className="text-sm font-medium text-gray-600">Description</p>
                  <p className="text-gray-900">{selectedExpense.description}</p>
                </div>
                <div>
                  <p className="text-sm font-medium text-gray-600">Amount</p>
                  <p className="text-gray-900 font-semibold">{formatCurrency(parseFloat(selectedExpense.amount.toString()))}</p>
                </div>
                <div>
                  <p className="text-sm font-medium text-gray-600">Date</p>
                  <p className="text-gray-900">{format(new Date(selectedExpense.date), 'PPP')}</p>
                </div>
                <div>
                  <p className="text-sm font-medium text-gray-600">Status</p>
                  <Badge className={statusColors[selectedExpense.status as keyof typeof statusColors]}>
                    {selectedExpense.status}
                  </Badge>
                </div>
                <div>
                  <p className="text-sm font-medium text-gray-600">Category</p>
                  <div className="flex items-center space-x-2">
                    <div 
                      className="w-3 h-3 rounded border"
                      style={{ 
                        backgroundColor: (selectedExpense as any).category?.color || '#6B7280',
                        borderColor: (selectedExpense as any).category?.color || '#6B7280'
                      }}
                    />
                    <span className="text-gray-900">{(selectedExpense as any).category?.name || 'Unknown'}</span>
                  </div>
                </div>
                <div>
                  <p className="text-sm font-medium text-gray-600">Submitted By</p>
                  <p className="text-gray-900">
                    {(selectedExpense as any).user?.firstName && (selectedExpense as any).user?.lastName 
                      ? `${(selectedExpense as any).user.firstName} ${(selectedExpense as any).user.lastName}`
                      : (selectedExpense as any).user?.email || 'Unknown User'}
                  </p>
                </div>
              </div>
              
              {selectedExpense.notes && (
                <div>
                  <p className="text-sm font-medium text-gray-600">Notes</p>
                  <p className="text-gray-900">{selectedExpense.notes}</p>
                </div>
              )}
              
              {selectedExpense.receiptUrl && (
                <div>
                  <p className="text-sm font-medium text-gray-600">Receipt</p>
                  <a 
                    href={selectedExpense.receiptUrl} 
                    target="_blank" 
                    rel="noopener noreferrer"
                    className="text-blue-600 hover:text-blue-800 underline"
                  >
                    View Receipt
                  </a>
                </div>
              )}
            </div>
          )}
        </DialogContent>
      </Dialog>

      {/* Edit Expense Dialog */}
      <Dialog open={showEditDialog} onOpenChange={setShowEditDialog}>
        <DialogContent className="max-w-4xl">
          <DialogHeader>
            <DialogTitle>Edit Expense</DialogTitle>
          </DialogHeader>
          {selectedExpense && (
            <ExpenseForm
              initialData={{
                ...selectedExpense,
                date: new Date(selectedExpense.date).toISOString().split('T')[0],
                amount: selectedExpense.amount.toString(),
                id: selectedExpense.id
              }}
              isEditing={true}
              onClose={() => {
                setShowEditDialog(false);
                setSelectedExpense(null);
              }}
              onSuccess={() => {
                queryClient.invalidateQueries({ queryKey: ["/api/reports/expenses"] });
                setShowEditDialog(false);
                setSelectedExpense(null);
                toast({
                  title: "Success",
                  description: "Expense updated successfully and sent for re-approval",
                });
              }}
              submitButtonText="Update Expense"
            />
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}