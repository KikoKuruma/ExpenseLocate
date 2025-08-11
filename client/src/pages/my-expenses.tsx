import { useEffect, useState } from "react";
import { useAuth } from "@/hooks/useAuth";
import { useToast } from "@/hooks/use-toast";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { format, startOfMonth, endOfMonth } from "date-fns";
import Sidebar from "@/components/sidebar";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import ExpenseForm from "@/components/expense-form";
import { 
  FileText, 
  Car, 
  Wrench, 
  Zap, 
  Building, 
  Fuel, 
  Phone,
  Calendar,
  DollarSign,
  Clock,
  Eye,
  Trash2,
  Edit,
  Plus,
  RotateCcw,
  X
} from "lucide-react";
import { apiRequest } from "@/lib/queryClient";
import { isUnauthorizedError } from "@/lib/authUtils";
import type { Expense } from "@shared/schema";

interface ExpenseStats {
  currentQuarterExpenses: number;
  pendingExpenses: number;
  approvedExpenses: number;
  thisMonthExpenses: number;
}

const categoryIcons = {
  "Equipment": Wrench,
  "Vehicle": Car,
  "Utilities": Zap,
  "Office Supplies": Building,
  "Fuel": Fuel,
  "Communications": Phone,
};

const statusColors = {
  pending: "bg-yellow-100 text-yellow-800 border-yellow-200",
  approved: "bg-green-100 text-green-800 border-green-200",
  rejected: "bg-red-100 text-red-800 border-red-200",
};

// Helper function to get current quarter name
function getCurrentQuarterName(): string {
  const now = new Date();
  const quarter = Math.floor(now.getMonth() / 3) + 1;
  return `Q${quarter} ${now.getFullYear()}`;
}

export default function MyExpenses() {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const { user, isAuthenticated, isLoading } = useAuth();
  const [editingExpense, setEditingExpense] = useState<any>(null);
  const [showExpenseForm, setShowExpenseForm] = useState(false);

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

  // Fetch user's expenses
  const { data: expenses, isLoading: expensesLoading } = useQuery({
    queryKey: ["/api/expenses/my"],
    enabled: !!user,
  });

  // Fetch user-specific expense stats including quarterly data
  const { data: stats, isLoading: statsLoading } = useQuery<ExpenseStats>({
    queryKey: ["/api/expenses/my-stats"],
    enabled: !!user,
  });

  // Delete expense mutation
  const deleteExpenseMutation = useMutation({
    mutationFn: async (expenseId: string) => {
      await apiRequest("DELETE", `/api/expenses/${expenseId}`);
    },
    onSuccess: () => {
      // Invalidate all expense-related queries for real-time updates
      queryClient.invalidateQueries({ queryKey: ["/api/expenses"] });
      queryClient.invalidateQueries({ queryKey: ["/api/expenses/my"] });
      queryClient.invalidateQueries({ queryKey: ["/api/expenses/my/recent"] });
      queryClient.invalidateQueries({ queryKey: ["/api/expenses/pending"] });
      queryClient.invalidateQueries({ queryKey: ["/api/expenses/stats"] });
      queryClient.invalidateQueries({ queryKey: ["/api/expenses/my-stats"] });
      queryClient.invalidateQueries({ queryKey: ["/api/expenses/analytics/categories"] });
      queryClient.invalidateQueries({ queryKey: ["/api/expenses/analytics/monthly"] });
      toast({
        title: "Success",
        description: "Expense deleted successfully",
      });
    },
    onError: (error) => {
      if (isUnauthorizedError(error)) {
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
      toast({
        title: "Error",
        description: error.message,
        variant: "destructive",
      });
    },
  });

  // Resubmit expense mutation
  const resubmitExpenseMutation = useMutation({
    mutationFn: async (expenseId: string) => {
      await apiRequest("PUT", `/api/expenses/${expenseId}/resubmit`);
    },
    onSuccess: () => {
      // Invalidate all expense-related queries for real-time updates
      queryClient.invalidateQueries({ queryKey: ["/api/expenses"] });
      queryClient.invalidateQueries({ queryKey: ["/api/expenses/my"] });
      queryClient.invalidateQueries({ queryKey: ["/api/expenses/my/recent"] });
      queryClient.invalidateQueries({ queryKey: ["/api/expenses/pending"] });
      queryClient.invalidateQueries({ queryKey: ["/api/expenses/stats"] });
      queryClient.invalidateQueries({ queryKey: ["/api/expenses/my-stats"] });
      queryClient.invalidateQueries({ queryKey: ["/api/expenses/analytics/categories"] });
      queryClient.invalidateQueries({ queryKey: ["/api/expenses/analytics/monthly"] });
      toast({
        title: "Success",
        description: "Expense resubmitted for approval",
      });
    },
    onError: (error) => {
      if (isUnauthorizedError(error)) {
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
      toast({
        title: "Error",
        description: error.message,
        variant: "destructive",
      });
    },
  });

  // Update expense mutation
  const updateExpenseMutation = useMutation({
    mutationFn: async (data: { id: string; updateData: any }) => {
      await apiRequest("PUT", `/api/expenses/${data.id}`, data.updateData);
    },
    onSuccess: () => {
      // Invalidate all expense-related queries for real-time updates
      queryClient.invalidateQueries({ queryKey: ["/api/expenses"] });
      queryClient.invalidateQueries({ queryKey: ["/api/expenses/my"] });
      queryClient.invalidateQueries({ queryKey: ["/api/expenses/my/recent"] });
      queryClient.invalidateQueries({ queryKey: ["/api/expenses/pending"] });
      queryClient.invalidateQueries({ queryKey: ["/api/expenses/stats"] });
      queryClient.invalidateQueries({ queryKey: ["/api/expenses/my-stats"] });
      queryClient.invalidateQueries({ queryKey: ["/api/expenses/analytics/categories"] });
      queryClient.invalidateQueries({ queryKey: ["/api/expenses/analytics/monthly"] });
      setEditingExpense(null);
      toast({
        title: "Success",
        description: "Expense updated successfully",
      });
    },
    onError: (error) => {
      if (isUnauthorizedError(error)) {
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
      toast({
        title: "Error",
        description: error.message,
        variant: "destructive",
      });
    },
  });

  const handleDeleteExpense = (expenseId: string) => {
    if (confirm("Are you sure you want to delete this expense? This action cannot be undone.")) {
      deleteExpenseMutation.mutate(expenseId);
    }
  };

  const handleEditExpense = (expense: any) => {
    setEditingExpense(expense);
  };

  const handleExpenseUpdate = (data: any) => {
    if (editingExpense) {
      updateExpenseMutation.mutate({
        id: editingExpense.id,
        updateData: data
      });
    }
  };

  const handleCloseEditDialog = () => {
    setEditingExpense(null);
  };

  const handleResubmitExpense = (expenseId: string) => {
    if (confirm("Are you sure you want to resubmit this expense for approval?")) {
      resubmitExpenseMutation.mutate(expenseId);
    }
  };

  if (isLoading || !isAuthenticated) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-ccw-bg">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-ccw-yellow"></div>
      </div>
    );
  }

  // Get current month date range
  const now = new Date();
  const monthStart = startOfMonth(now);
  const monthEnd = endOfMonth(now);

  // Filter expenses for current month (approved only)
  const currentMonthExpenses = (expenses as any[])?.filter((expense: any) => {
    const expenseDate = new Date(expense.date);
    return expenseDate >= monthStart && expenseDate <= monthEnd && expense.status === 'approved';
  }) || [];

  // Filter pending expenses (all time)
  const pendingExpenses = (expenses as any[])?.filter((expense: any) => expense.status === 'pending') || [];
  
  // Filter rejected expenses (all time)
  const rejectedExpenses = (expenses as any[])?.filter((expense: any) => expense.status === 'rejected') || [];

  // Calculate totals
  const currentMonthTotal = currentMonthExpenses.reduce((sum: number, expense: any) => sum + Number(expense.amount), 0);
  const pendingTotal = pendingExpenses.reduce((sum: number, expense: any) => sum + Number(expense.amount), 0);

  const renderExpenseCard = (expense: any) => {
    const IconComponent = categoryIcons[expense.category?.name as keyof typeof categoryIcons] || FileText;
    
    // Check if expense can be edited/deleted
    // Users can edit/delete their own non-approved expenses
    // Admins and approvers can edit/delete any expenses
    const isAdmin = user?.role === 'admin';
    const isApprover = user?.role === 'approver';
    const ownsExpense = expense.userId === user?.id;
    const isApproved = expense.status === 'approved';
    
    const canEdit = (ownsExpense && !isApproved) || isAdmin || isApprover;
    const canDelete = (ownsExpense && !isApproved) || isAdmin || isApprover;
    
    return (
      <div key={expense.id} className="p-4 border border-gray-200 rounded-lg hover:bg-gray-50 transition-colors">
        <div className="flex items-center justify-between">
          <div className="flex items-center space-x-3">
            <div 
              className="w-10 h-10 rounded-lg flex items-center justify-center"
              style={{ 
                backgroundColor: expense.category?.color ? `${expense.category.color}20` : '#6B7280',
                border: `2px solid ${expense.category?.color || '#6B7280'}`
              }}
            >
              <IconComponent 
                className="w-5 h-5" 
                style={{ color: expense.category?.color || '#6B7280' }}
              />
            </div>
            <div>
              <h4 className="font-medium text-ccw-dark" data-testid={`my-expense-description-${expense.id}`}>
                {expense.description}
              </h4>
              <p className="text-sm text-gray-500">
                {expense.category?.name} • {format(new Date(expense.date), 'MMM dd, yyyy')}
                {expense.submittedByUser && (
                  <span className="text-ccw-brown font-medium">
                    {" "}• Submitted by {expense.submittedByUser.firstName} {expense.submittedByUser.lastName}
                  </span>
                )}
              </p>
            </div>
          </div>
          
          <div className="flex items-center space-x-3">
            <div className="text-right">
              <p className="font-semibold text-ccw-dark" data-testid={`my-expense-amount-${expense.id}`}>
                ${Number(expense.amount).toFixed(2)}
              </p>
              <Badge 
                className={statusColors[expense.status as keyof typeof statusColors]}
                data-testid={`my-expense-status-${expense.id}`}
              >
                {expense.status.charAt(0).toUpperCase() + expense.status.slice(1)}
              </Badge>
            </div>
            
            <div className="flex items-center space-x-2">
              {expense.receiptUrl && (
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => window.open(`/api/expenses/${expense.id}/receipt`, '_blank')}
                  data-testid={`button-view-receipt-${expense.id}`}
                >
                  <Eye className="w-4 h-4" />
                </Button>
              )}
              
              {canEdit && (
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => handleEditExpense(expense)}
                  disabled={updateExpenseMutation.isPending}
                  className="text-blue-600 border-blue-600 hover:bg-blue-50 hover:text-blue-700"
                  data-testid={`button-edit-expense-${expense.id}`}
                >
                  <Edit className="w-4 h-4" />
                </Button>
              )}
              
              {canDelete && (
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => handleDeleteExpense(expense.id)}
                  disabled={deleteExpenseMutation.isPending}
                  className="text-red-600 border-red-600 hover:bg-red-50 hover:text-red-700"
                  data-testid={`button-delete-expense-${expense.id}`}
                >
                  <Trash2 className="w-4 h-4" />
                </Button>
              )}
            </div>
          </div>
        </div>
      </div>
    );
  };

  const renderRejectedExpenseCard = (expense: any) => {
    const IconComponent = categoryIcons[expense.category?.name as keyof typeof categoryIcons] || FileText;
    
    return (
      <div key={expense.id} className="p-4 border border-red-200 rounded-lg bg-red-50 hover:bg-red-100 transition-colors">
        <div className="flex items-center justify-between">
          <div className="flex items-center space-x-3">
            <div 
              className="w-10 h-10 rounded-lg flex items-center justify-center"
              style={{ 
                backgroundColor: expense.category?.color ? `${expense.category.color}20` : '#6B7280',
                border: `2px solid ${expense.category?.color || '#6B7280'}`
              }}
            >
              <IconComponent 
                className="w-5 h-5" 
                style={{ color: expense.category?.color || '#6B7280' }}
              />
            </div>
            <div>
              <h4 className="font-medium text-ccw-dark" data-testid={`rejected-expense-description-${expense.id}`}>
                {expense.description}
              </h4>
              <p className="text-sm text-gray-500">
                {expense.category?.name} • {format(new Date(expense.date), 'MMM dd, yyyy')}
                {expense.submittedByUser && (
                  <span className="text-ccw-brown font-medium">
                    {" "}• Submitted by {expense.submittedByUser.firstName} {expense.submittedByUser.lastName}
                  </span>
                )}
              </p>
            </div>
          </div>
          
          <div className="flex items-center space-x-4">
            <div className="text-right">
              <p className="text-lg font-semibold text-ccw-dark" data-testid={`rejected-expense-amount-${expense.id}`}>
                ${Number(expense.amount).toFixed(2)}
              </p>
              <Badge 
                className={statusColors[expense.status as keyof typeof statusColors]}
                data-testid={`rejected-expense-status-${expense.id}`}
              >
                {expense.status.charAt(0).toUpperCase() + expense.status.slice(1)}
              </Badge>
            </div>
            
            <div className="flex items-center space-x-2">
              {expense.receiptUrl && (
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => window.open(`/api/expenses/${expense.id}/receipt`, '_blank')}
                  data-testid={`button-view-receipt-rejected-${expense.id}`}
                >
                  <Eye className="w-4 h-4" />
                </Button>
              )}
              
              <Button
                size="sm"
                variant="outline"
                onClick={() => handleEditExpense(expense)}
                disabled={updateExpenseMutation.isPending}
                className="text-blue-600 border-blue-600 hover:bg-blue-50 hover:text-blue-700"
                data-testid={`button-edit-rejected-${expense.id}`}
              >
                <Edit className="w-4 h-4" />
                <span className="ml-1 hidden sm:inline">Edit</span>
              </Button>
              
              <Button
                size="sm"
                variant="outline"
                onClick={() => handleResubmitExpense(expense.id)}
                disabled={resubmitExpenseMutation.isPending}
                className="text-green-600 border-green-600 hover:bg-green-50 hover:text-green-700"
                data-testid={`button-resubmit-${expense.id}`}
              >
                <RotateCcw className="w-4 h-4" />
                <span className="ml-1 hidden sm:inline">Resubmit</span>
              </Button>
              
              <Button
                size="sm"
                variant="outline"
                onClick={() => handleDeleteExpense(expense.id)}
                disabled={deleteExpenseMutation.isPending}
                className="text-red-600 border-red-600 hover:bg-red-50 hover:text-red-700"
                data-testid={`button-delete-rejected-${expense.id}`}
              >
                <Trash2 className="w-4 h-4" />
                <span className="ml-1 hidden sm:inline">Delete</span>
              </Button>
            </div>
          </div>
        </div>
      </div>
    );
  };

  return (
    <div className="flex h-screen bg-ccw-bg">
      <Sidebar />
      
      <main className="flex-1 overflow-auto">
        {/* Header */}
        <header className="bg-white shadow-sm border-b border-gray-200 px-6 py-4 lg:px-6 pl-20 lg:pl-6">
          <div className="flex items-center justify-between">
            <div>
              <h2 className="text-2xl font-bold text-ccw-dark">My Expenses</h2>
              <p className="text-gray-600">Track your personal expenses and approvals</p>
            </div>
            
            <Button 
              onClick={() => setShowExpenseForm(true)}
              className="bg-ccw-yellow hover:bg-ccw-yellow/90 text-ccw-dark"
              data-testid="button-new-expense"
            >
              <Plus className="w-5 h-5 mr-2" />
              New Expense
            </Button>
          </div>
        </header>

        {/* Content */}
        <div className="p-6 space-y-6">
          {/* Summary Cards */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            <Card>
              <CardContent className="p-6">
                <div className="flex items-center space-x-3">
                  <div className="w-12 h-12 bg-blue-100 rounded-lg flex items-center justify-center">
                    <Calendar className="w-6 h-6 text-blue-600" />
                  </div>
                  <div>
                    <p className="text-sm font-medium text-gray-600">This Month</p>
                    <p className="text-2xl font-bold text-ccw-dark" data-testid="text-month-total">
                      ${currentMonthTotal.toFixed(2)}
                    </p>
                    <p className="text-xs text-gray-500">
                      {currentMonthExpenses.length} expenses
                    </p>
                  </div>
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardContent className="p-6">
                <div className="flex items-center space-x-3">
                  <div className="w-12 h-12 bg-yellow-100 rounded-lg flex items-center justify-center">
                    <Clock className="w-6 h-6 text-yellow-600" />
                  </div>
                  <div>
                    <p className="text-sm font-medium text-gray-600">Pending Approval</p>
                    <p className="text-2xl font-bold text-ccw-dark" data-testid="text-pending-total">
                      ${pendingTotal.toFixed(2)}
                    </p>
                    <p className="text-xs text-gray-500">
                      {pendingExpenses.length} expenses
                    </p>
                  </div>
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardContent className="p-6">
                <div className="flex items-center space-x-3">
                  <div className="w-12 h-12 bg-ccw-yellow bg-opacity-10 rounded-lg flex items-center justify-center">
                    <DollarSign className="w-6 h-6 text-ccw-yellow" />
                  </div>
                  <div>
                    <p className="text-sm font-medium text-gray-600">{getCurrentQuarterName()}</p>
                    <p className="text-2xl font-bold text-ccw-dark" data-testid="text-quarter-expenses">
                      ${stats?.currentQuarterExpenses?.toFixed(2) || '0.00'}
                    </p>
                    <p className="text-xs text-gray-500">
                      current quarter
                    </p>
                  </div>
                </div>
              </CardContent>
            </Card>
          </div>

          {/* Pending Expenses */}
          {pendingExpenses.length > 0 && (
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Clock className="w-5 h-5 text-yellow-600" />
                  Awaiting Approval
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="space-y-3">
                  {pendingExpenses.map(renderExpenseCard)}
                </div>
              </CardContent>
            </Card>
          )}

          {/* Current Month Approved Expenses */}
          <Card>
            <CardHeader>
              <CardTitle>
                {format(now, 'MMMM yyyy')} Approved Expenses
              </CardTitle>
            </CardHeader>
            <CardContent>
              {expensesLoading ? (
                <div className="flex justify-center py-8">
                  <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-ccw-yellow"></div>
                </div>
              ) : currentMonthExpenses.length === 0 ? (
                <div className="text-center py-8">
                  <FileText className="mx-auto h-12 w-12 text-gray-400" />
                  <h3 className="mt-4 text-sm font-medium text-gray-900">No approved expenses this month</h3>
                  <p className="mt-2 text-sm text-gray-500">
                    You haven't had any expenses approved for {format(now, 'MMMM yyyy')} yet.
                  </p>
                </div>
              ) : (
                <div className="space-y-3">
                  {currentMonthExpenses.map(renderExpenseCard)}
                </div>
              )}
            </CardContent>
          </Card>

          {/* Rejected Expenses */}
          {rejectedExpenses.length > 0 && (
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <X className="w-5 h-5 text-red-600" />
                  Rejected Expenses
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="space-y-3">
                  {rejectedExpenses.map(renderRejectedExpenseCard)}
                </div>
              </CardContent>
            </Card>
          )}
        </div>
      </main>

      {/* New Expense Dialog */}
      <Dialog open={showExpenseForm} onOpenChange={setShowExpenseForm}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle className="dialog-title-enhanced">Add New Expense</DialogTitle>
          </DialogHeader>
          <ExpenseForm
            onClose={() => setShowExpenseForm(false)}
            onSuccess={() => {
              // Close the dialog after successful submission
              setShowExpenseForm(false);
              toast({
                title: "Success",
                description: "Expense created successfully",
              });
            }}
          />
        </DialogContent>
      </Dialog>

      {/* Edit Expense Dialog */}
      <Dialog open={!!editingExpense} onOpenChange={handleCloseEditDialog}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>Edit Expense</DialogTitle>
          </DialogHeader>
          {editingExpense && (
            <ExpenseForm
              initialData={{
                description: editingExpense.description,
                amount: editingExpense.amount,
                date: editingExpense.date,
                categoryId: editingExpense.categoryId,
                notes: editingExpense.notes || '',
                userId: editingExpense.userId
              }}
              onClose={handleCloseEditDialog}
              onSubmit={handleExpenseUpdate}
              isLoading={updateExpenseMutation.isPending}
              submitButtonText="Update Expense"
            />
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}