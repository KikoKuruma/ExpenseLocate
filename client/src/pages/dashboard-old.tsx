import { useEffect } from "react";
import { useAuth } from "@/hooks/useAuth";
import { useToast } from "@/hooks/use-toast";
import Sidebar from "@/components/sidebar";
import StatsCards from "@/components/stats-cards";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Plus, Clock, CheckCircle, XCircle, AlertCircle, Calendar, DollarSign, TrendingUp, BarChart3, Eye } from "lucide-react";
import { PieChart, Pie, Cell, BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, LineChart, Line } from "recharts";
import { useState } from "react";
import ExpenseForm from "@/components/expense-form";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { isUnauthorizedError } from "@/lib/authUtils";
import { format } from "date-fns";
import type { Expense, User } from "@shared/schema";
import { UserRole } from "@shared/schema";

export default function Dashboard() {
  const { toast } = useToast();
  const { isAuthenticated, isLoading, user } = useAuth();
  const [showExpenseForm, setShowExpenseForm] = useState(false);
  const queryClient = useQueryClient();

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

  if (isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-ccw-bg">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-ccw-yellow"></div>
      </div>
    );
  }

  if (!isAuthenticated) {
    return null;
  }

  return (
    <div className="flex h-screen bg-ccw-bg">
      <Sidebar />
      
      <main className="flex-1 overflow-auto">
        {/* Top Bar */}
        <header className="bg-white shadow-sm border-b border-gray-200 px-6 py-4">
          <div className="flex items-center justify-between">
            <div>
              <h2 className="text-2xl font-bold text-ccw-dark">Expense Dashboard</h2>
              <p className="text-gray-600">Manage your business expenses</p>
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

        {/* Dashboard Content */}
        <div className="p-6 space-y-6">
          <StatsCards />
          
          {/* Charts Section */}
          <ExpenseCharts />
          
          {/* Recent Expenses */}
          <RecentExpenses />
          
          {/* Admin/Approver Sections */}
          {user && (user.role === 'admin' || user.role === 'approver') && (
            <>
              <AllSubmittedReports />
              {user.role === 'admin' && <PendingApprovals />}
            </>
          )}
        </div>
      </main>

      {/* Expense Form Modal */}
      {showExpenseForm && (
        <ExpenseForm 
          onClose={() => setShowExpenseForm(false)} 
          onSuccess={() => {
            setShowExpenseForm(false);
            toast({
              title: "Success",
              description: "Expense submitted successfully",
            });
          }}
        />
      )}
    </div>
  );
}

// Expense Charts Component
function ExpenseCharts() {
  const { user } = useAuth();
  const { toast } = useToast();

  const { data: categoryData, isLoading: isCategoryLoading } = useQuery({
    queryKey: ['/api/expenses/analytics/categories'],
    queryFn: async () => {
      const response = await fetch('/api/expenses/analytics/categories', { credentials: 'include' });
      if (!response.ok) {
        if (response.status === 401) {
          throw new Error('401: Unauthorized');
        }
        throw new Error('Failed to fetch category analytics');
      }
      return response.json();
    },
    retry: false,
  });

  const { data: monthlyData, isLoading: isMonthlyLoading } = useQuery({
    queryKey: ['/api/expenses/analytics/monthly'],
    queryFn: async () => {
      const response = await fetch('/api/expenses/analytics/monthly', { credentials: 'include' });
      if (!response.ok) {
        if (response.status === 401) {
          throw new Error('401: Unauthorized');
        }
        throw new Error('Failed to fetch monthly analytics');
      }
      return response.json();
    },
    retry: false,
  });

  const isLoading = isCategoryLoading || isMonthlyLoading;

  if (isLoading) {
    return (
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <TrendingUp className="w-5 h-5 text-ccw-yellow" />
              Expense by Status
            </CardTitle>
          </CardHeader>
          <CardContent className="flex items-center justify-center h-64">
            <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-ccw-yellow"></div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <BarChart3 className="w-5 h-5 text-ccw-yellow" />
              Monthly Expenses
            </CardTitle>
          </CardHeader>
          <CardContent className="flex items-center justify-center h-64">
            <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-ccw-yellow"></div>
          </CardContent>
        </Card>
      </div>
    );
  }

  if (!userExpenses || userExpenses.length === 0) {
    return (
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <TrendingUp className="w-5 h-5 text-ccw-yellow" />
              Expense by Status
            </CardTitle>
          </CardHeader>
          <CardContent className="flex items-center justify-center h-64 text-gray-500">
            No expenses submitted yet
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <BarChart3 className="w-5 h-5 text-ccw-yellow" />
              Monthly Expenses
            </CardTitle>
          </CardHeader>
          <CardContent className="flex items-center justify-center h-64 text-gray-500">
            No expenses to display
          </CardContent>
        </Card>
      </div>
    );
  }

  // Process data for status pie chart
  const statusData = userExpenses.reduce((acc: any, expense: any) => {
    const status = expense.status;
    acc[status] = (acc[status] || 0) + parseFloat(expense.amount);
    return acc;
  }, {});

  const pieChartData = Object.entries(statusData).map(([status, amount]) => ({
    name: status.charAt(0).toUpperCase() + status.slice(1),
    value: amount as number,
    count: userExpenses.filter((e: any) => e.status === status).length
  }));

  // Process data for monthly bar chart (last 6 months)
  const monthlyData = userExpenses.reduce((acc: any, expense: any) => {
    const month = new Date(expense.createdAt).toLocaleString('default', { month: 'short', year: '2-digit' });
    acc[month] = (acc[month] || 0) + parseFloat(expense.amount);
    return acc;
  }, {});

  const barChartData = Object.entries(monthlyData)
    .map(([month, amount]) => ({ month, amount: amount as number }))
    .slice(-6); // Last 6 months

  const COLORS = {
    'Pending': '#ECCD37', // CCW yellow
    'Approved': '#10B981', // Green
    'Rejected': '#EF4444', // Red
  };

  return (
    <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
      {/* Status Pie Chart */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <TrendingUp className="w-5 h-5 text-ccw-yellow" />
            Your Expenses by Status
          </CardTitle>
        </CardHeader>
        <CardContent>
          <ResponsiveContainer width="100%" height={300}>
            <PieChart>
              <Pie
                data={pieChartData}
                cx="50%"
                cy="50%"
                labelLine={false}
                label={({ name, value, count }) => `${name}: $${value.toFixed(2)} (${count})`}
                outerRadius={80}
                fill="#8884d8"
                dataKey="value"
              >
                {pieChartData.map((entry, index) => (
                  <Cell key={`cell-${index}`} fill={COLORS[entry.name as keyof typeof COLORS] || '#99976E'} />
                ))}
              </Pie>
              <Tooltip formatter={(value: any) => [`$${value.toFixed(2)}`, 'Amount']} />
            </PieChart>
          </ResponsiveContainer>
        </CardContent>
      </Card>

      {/* Monthly Bar Chart */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <BarChart3 className="w-5 h-5 text-ccw-yellow" />
            Your Monthly Expenses
          </CardTitle>
        </CardHeader>
        <CardContent>
          <ResponsiveContainer width="100%" height={300}>
            <BarChart data={barChartData}>
              <CartesianGrid strokeDasharray="3 3" />
              <XAxis dataKey="month" />
              <YAxis tickFormatter={(value) => `$${value}`} />
              <Tooltip formatter={(value: any) => [`$${value.toFixed(2)}`, 'Amount']} />
              <Bar dataKey="amount" fill="#ECCD37" />
            </BarChart>
          </ResponsiveContainer>
        </CardContent>
      </Card>
    </div>
  );
}

// All Submitted Reports Component for Approvers/Administrators
function AllSubmittedReports() {
  const { toast } = useToast();
  const { user } = useAuth();
  
  const { data: allExpenses, isLoading } = useQuery({
    queryKey: ['/api/expenses'],
    queryFn: async () => {
      const response = await fetch('/api/expenses', { credentials: 'include' });
      if (!response.ok) {
        if (response.status === 401) {
          throw new Error('401: Unauthorized');
        }
        throw new Error('Failed to fetch all expenses');
      }
      return response.json();
    },
    retry: false,
  });

  const getStatusIcon = (status: string) => {
    switch (status) {
      case 'pending':
        return <Clock className="w-4 h-4 text-orange-500" />;
      case 'approved':
        return <CheckCircle className="w-4 h-4 text-green-500" />;
      case 'rejected':
        return <XCircle className="w-4 h-4 text-red-500" />;
      default:
        return <AlertCircle className="w-4 h-4 text-gray-500" />;
    }
  };

  const getStatusBadge = (status: string) => {
    const variants = {
      pending: 'bg-orange-100 text-orange-800 hover:bg-orange-200',
      approved: 'bg-green-100 text-green-800 hover:bg-green-200',
      rejected: 'bg-red-100 text-red-800 hover:bg-red-200',
    };
    
    return (
      <Badge className={variants[status as keyof typeof variants] || 'bg-gray-100 text-gray-800'}>
        <span className="flex items-center gap-1">
          {getStatusIcon(status)}
          {status.charAt(0).toUpperCase() + status.slice(1)}
        </span>
      </Badge>
    );
  };

  if (isLoading) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Eye className="w-5 h-5 text-ccw-yellow" />
            All Submitted Reports
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="animate-pulse space-y-4">
            {[1, 2, 3, 4, 5].map(i => (
              <div key={i} className="h-16 bg-gray-200 rounded"></div>
            ))}
          </div>
        </CardContent>
      </Card>
    );
  }

  if (!allExpenses || allExpenses.length === 0) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Eye className="w-5 h-5 text-ccw-yellow" />
            All Submitted Reports
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="text-center py-12">
            <Eye className="w-12 h-12 text-gray-400 mx-auto mb-4" />
            <p className="text-gray-500 mb-2">No expense reports found</p>
            <p className="text-sm text-gray-400">Reports will appear here once users submit expenses</p>
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center justify-between">
          <span className="flex items-center gap-2">
            <Eye className="w-5 h-5 text-ccw-yellow" />
            All Submitted Reports
          </span>
          <span className="text-sm font-normal text-gray-500">
            {allExpenses.length} total reports
          </span>
        </CardTitle>
      </CardHeader>
      <CardContent>
        <div className="space-y-4 max-h-96 overflow-y-auto">
          {allExpenses.map((expense: any) => (
            <div 
              key={expense.id} 
              className="flex items-center justify-between p-4 border border-gray-200 rounded-lg hover:bg-gray-50 transition-colors"
            >
              <div className="flex-1">
                <div className="flex items-center gap-3 mb-1">
                  <p className="font-medium text-gray-900">{expense.description}</p>
                  {getStatusBadge(expense.status)}
                </div>
                <div className="flex items-center gap-4 text-sm text-gray-600">
                  <span>
                    By: {expense.user?.firstName && expense.user?.lastName 
                      ? `${expense.user.firstName} ${expense.user.lastName}`
                      : expense.user?.email || 'Unknown User'}
                  </span>
                  <span>{format(new Date(expense.date), 'MMM dd, yyyy')}</span>
                  <span>{expense.category?.name || 'No Category'}</span>
                </div>
              </div>
              <div className="text-right">
                <p className="text-lg font-semibold text-gray-900">${parseFloat(expense.amount).toFixed(2)}</p>
                <p className="text-xs text-gray-500">
                  Submitted {format(new Date(expense.createdAt), 'MM/dd/yy')}
                </p>
              </div>
            </div>
          ))}
        </div>
      </CardContent>
    </Card>
  );
}

// Recent Expenses Component for Users
function RecentExpenses() {
  const { toast } = useToast();

  const { data: recentExpenses, isLoading } = useQuery({
    queryKey: ['/api/expenses/my/recent'],
    queryFn: async () => {
      const response = await fetch('/api/expenses/my/recent', { credentials: 'include' });
      if (!response.ok) {
        if (response.status === 401) {
          throw new Error('401: Unauthorized');
        }
        throw new Error('Failed to fetch recent expenses');
      }
      return response.json();
    },
    retry: false,
  });

  if (isLoading) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Calendar className="w-5 h-5 text-ccw-yellow" />
            Your Recent Expenses
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="animate-pulse space-y-4">
            {[1, 2, 3].map(i => (
              <div key={i} className="h-16 bg-gray-200 rounded"></div>
            ))}
          </div>
        </CardContent>
      </Card>
    );
  }

  const getStatusIcon = (status: string) => {
    switch (status) {
      case 'approved': return <CheckCircle className="w-4 h-4 text-green-600" />;
      case 'rejected': return <XCircle className="w-4 h-4 text-red-600" />;
      default: return <Clock className="w-4 h-4 text-orange-600" />;
    }
  };

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'approved': return 'bg-green-100 text-green-800';
      case 'rejected': return 'bg-red-100 text-red-800';
      default: return 'bg-orange-100 text-orange-800';
    }
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Calendar className="w-5 h-5 text-ccw-yellow" />
          Your Recent Expenses
        </CardTitle>
      </CardHeader>
      <CardContent>
        {!recentExpenses || recentExpenses.length === 0 ? (
          <div className="text-center py-8 text-gray-500">
            <Calendar className="w-12 h-12 mx-auto mb-2 opacity-50" />
            <p>No recent expenses found</p>
            <p className="text-sm">Submit your first expense to see it here</p>
          </div>
        ) : (
          <div className="space-y-4">
            {recentExpenses.map((expense: any) => (
              <div 
                key={expense.id} 
                className="flex items-center justify-between p-4 bg-gray-50 rounded-lg hover:bg-gray-100 transition-colors"
                data-testid={`expense-item-${expense.id}`}
              >
                <div className="flex items-center gap-4">
                  <div className="flex items-center gap-2">
                    {getStatusIcon(expense.status)}
                    <div>
                      <p className="font-medium text-ccw-dark">{expense.description}</p>
                      <div className="flex items-center gap-2 text-sm text-gray-600">
                        <span>{format(new Date(expense.date), 'MMM dd, yyyy')}</span>
                        {expense.category && (
                          <>
                            <span>•</span>
                            <span>{expense.category.name}</span>
                          </>
                        )}
                      </div>
                    </div>
                  </div>
                </div>
                <div className="flex items-center gap-3">
                  <span className="font-semibold text-ccw-dark">
                    ${parseFloat(expense.amount).toFixed(2)}
                  </span>
                  <Badge className={getStatusColor(expense.status)}>
                    {expense.status}
                  </Badge>
                </div>
              </div>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
}

// Pending Approvals Component for Administrators
function PendingApprovals() {
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const { data: pendingExpenses, isLoading } = useQuery({
    queryKey: ['/api/expenses/pending'],
    queryFn: async () => {
      const response = await fetch('/api/expenses/pending', { credentials: 'include' });
      if (!response.ok) {
        if (response.status === 401) {
          throw new Error('401: Unauthorized');
        }
        throw new Error('Failed to fetch pending expenses');
      }
      return response.json();
    },
    retry: false,
  });

  const approveMutation = useMutation({
    mutationFn: async ({ id, status }: { id: string; status: 'approved' | 'rejected' }) => {
      const response = await fetch(`/api/expenses/${id}/approve`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ status }),
      });
      if (!response.ok) throw new Error('Failed to update expense status');
      return response.json();
    },
    onSuccess: (_, { status }) => {
      // Invalidate relevant queries
      queryClient.invalidateQueries({ queryKey: ['/api/expenses/pending'] });
      queryClient.invalidateQueries({ queryKey: ['/api/expenses/stats'] });
      toast({
        title: "Success",
        description: `Expense ${status === 'approved' ? 'approved' : 'rejected'} successfully`,
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
        description: error.message || "Failed to update expense status",
        variant: "destructive",
      });
    },
  });

  if (isLoading) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <AlertCircle className="w-5 h-5 text-ccw-yellow" />
            Pending Approvals
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="animate-pulse space-y-4">
            {[1, 2].map(i => (
              <div key={i} className="h-20 bg-gray-200 rounded"></div>
            ))}
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <AlertCircle className="w-5 h-5 text-ccw-yellow" />
          Pending Approvals
        </CardTitle>
      </CardHeader>
      <CardContent>
        {!pendingExpenses || pendingExpenses.length === 0 ? (
          <div className="text-center py-8 text-gray-500">
            <CheckCircle className="w-12 h-12 mx-auto mb-2 opacity-50" />
            <p>No pending approvals</p>
            <p className="text-sm">All expenses have been reviewed</p>
          </div>
        ) : (
          <div className="space-y-4">
            {pendingExpenses.map((expense: any) => (
              <div 
                key={expense.id} 
                className="flex items-center justify-between p-4 bg-orange-50 rounded-lg border border-orange-200"
                data-testid={`pending-expense-${expense.id}`}
              >
                <div className="flex items-center gap-4">
                  <AlertCircle className="w-5 h-5 text-orange-600" />
                  <div>
                    <p className="font-medium text-ccw-dark">{expense.description}</p>
                    <div className="flex items-center gap-2 text-sm text-gray-600">
                      <span>Submitted by {expense.user?.firstName} {expense.user?.lastName}</span>
                      <span>•</span>
                      <span>{format(new Date(expense.date), 'MMM dd, yyyy')}</span>
                      {expense.category && (
                        <>
                          <span>•</span>
                          <span>{expense.category.name}</span>
                        </>
                      )}
                    </div>
                  </div>
                </div>
                <div className="flex items-center gap-3">
                  <span className="font-semibold text-ccw-dark">
                    ${parseFloat(expense.amount).toFixed(2)}
                  </span>
                  <div className="flex gap-2">
                    <Button
                      size="sm"
                      onClick={() => approveMutation.mutate({ id: expense.id, status: 'rejected' })}
                      disabled={approveMutation.isPending}
                      variant="outline"
                      className="text-red-600 hover:bg-red-50 hover:border-red-200"
                      data-testid={`button-reject-${expense.id}`}
                    >
                      <XCircle className="w-4 h-4 mr-1" />
                      Reject
                    </Button>
                    <Button
                      size="sm"
                      onClick={() => approveMutation.mutate({ id: expense.id, status: 'approved' })}
                      disabled={approveMutation.isPending}
                      className="bg-green-600 hover:bg-green-700 text-white"
                      data-testid={`button-approve-${expense.id}`}
                    >
                      <CheckCircle className="w-4 h-4 mr-1" />
                      Approve
                    </Button>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
