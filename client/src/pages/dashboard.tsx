import { useEffect } from "react";
import { useAuth } from "@/hooks/useAuth";
import { useToast } from "@/hooks/use-toast";
import Sidebar from "@/components/sidebar";
import StatsCards from "@/components/stats-cards";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Plus, Clock, CheckCircle, XCircle, AlertCircle, Calendar, DollarSign, TrendingUp, BarChart3, Eye, Filter } from "lucide-react";
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
        <header className="bg-white shadow-sm border-b border-gray-200 px-6 py-4 lg:px-6 pl-20 lg:pl-6">
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
            <AllSubmittedReports />
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

// Expense Charts Component with Time Period Filtering
function ExpenseCharts() {
  const [selectedPeriod, setSelectedPeriod] = useState<'day' | 'month' | 'quarter'>('month');
  const currentDate = new Date();
  
  // Period-specific category data
  const { data: categoryData, isLoading: isCategoryLoading } = useQuery({
    queryKey: ['/api/expenses/analytics/period', selectedPeriod],
    queryFn: async () => {
      const response = await fetch(`/api/expenses/analytics/period/${selectedPeriod}`, { credentials: 'include' });
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

  // Time-based data (daily, monthly, quarterly)
  const { data: timeData, isLoading: isTimeLoading } = useQuery({
    queryKey: ['/api/expenses/analytics', selectedPeriod, currentDate.getFullYear(), currentDate.getMonth() + 1],
    queryFn: async () => {
      let url = '';
      switch (selectedPeriod) {
        case 'day':
        case 'month':
          // For both day and month views, show daily data for current month
          url = `/api/expenses/analytics/daily?year=${currentDate.getFullYear()}&month=${currentDate.getMonth() + 1}`;
          break;
        case 'quarter':
          url = `/api/expenses/analytics/quarterly?year=${currentDate.getFullYear()}`;
          break;
      }
      
      const response = await fetch(url, { credentials: 'include' });
      if (!response.ok) {
        if (response.status === 401) {
          throw new Error('401: Unauthorized');
        }
        throw new Error('Failed to fetch time analytics');
      }
      return response.json();
    },
    retry: false,
  });

  const isLoading = isCategoryLoading || isTimeLoading;

  // Helper functions
  const getPeriodLabel = () => {
    switch (selectedPeriod) {
      case 'day': return `Today's Expenses`;
      case 'month': return `This Month's Expenses`;
      case 'quarter': return `This Quarter's Expenses`;
      default: return 'Your Expenses';
    }
  };

  const getTimeChartTitle = () => {
    switch (selectedPeriod) {
      case 'day': return `Daily Expenses (${currentDate.toLocaleDateString('en-US', { month: 'long', year: 'numeric' })})`;
      case 'month': return 'Daily Expenses This Month';
      case 'quarter': return `Quarterly Expenses (${currentDate.getFullYear()})`;
      default: return 'Expense Trends';
    }
  };

  // Process data for time-based chart (daily, monthly, quarterly)
  const processTimeData = () => {
    if (!timeData) return [];
    
    switch (selectedPeriod) {
      case 'day':
        // For today view, show only today's data
        const today = currentDate.toISOString().split('T')[0];
        const todayData = timeData.filter((day: any) => day.date === today);
        return todayData.map((day: any) => ({
          label: 'Today',
          amount: day.totalAmount,
          count: day.expenseCount
        }));
      case 'month':
        // For month view, show daily data for the current month
        return timeData.map((day: any) => ({
          label: new Date(day.date).toLocaleDateString('en-US', { month: 'short', day: 'numeric' }),
          amount: day.totalAmount,
          count: day.expenseCount
        }));
      case 'quarter':
        return timeData.map((quarter: any) => ({
          label: quarter.quarter,
          amount: quarter.totalAmount,
          count: quarter.expenseCount
        }));
      default:
        return [];
    }
  };

  const barChartData = processTimeData();
  const pieChartData = categoryData?.map((category: any, index: number) => ({
    name: category.categoryName,
    value: category.totalAmount,
    count: category.expenseCount,
    color: category.categoryColor || `hsl(${(index * 360) / categoryData.length}, 70%, 50%)`
  })) || [];

  // Filter controls component
  const FilterControls = () => (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between">
          <CardTitle className="flex items-center gap-2">
            <Filter className="w-5 h-5 text-ccw-yellow" />
            Chart View Options
          </CardTitle>
          <Select value={selectedPeriod} onValueChange={(value: 'day' | 'month' | 'quarter') => setSelectedPeriod(value)}>
            <SelectTrigger className="w-48" data-testid="select-period-filter">
              <SelectValue placeholder="Select time period" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="day" data-testid="option-day">Today</SelectItem>
              <SelectItem value="month" data-testid="option-month">This Month</SelectItem>
              <SelectItem value="quarter" data-testid="option-quarter">This Quarter</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </CardHeader>
    </Card>
  );

  if (isLoading) {
    return (
      <div className="space-y-6">
        <FilterControls />
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <TrendingUp className="w-5 h-5 text-ccw-yellow" />
                {getPeriodLabel()} by Category
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
                {getTimeChartTitle()}
              </CardTitle>
            </CardHeader>
            <CardContent className="flex items-center justify-center h-64">
              <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-ccw-yellow"></div>
            </CardContent>
          </Card>
        </div>
      </div>
    );
  }

  if (!categoryData || (categoryData.length === 0 && barChartData.length === 0)) {
    return (
      <div className="space-y-6">
        <FilterControls />
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <TrendingUp className="w-5 h-5 text-ccw-yellow" />
                {getPeriodLabel()} by Category
              </CardTitle>
            </CardHeader>
            <CardContent className="flex items-center justify-center h-64 text-gray-500">
              No expenses for selected period
            </CardContent>
          </Card>
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <BarChart3 className="w-5 h-5 text-ccw-yellow" />
                {getTimeChartTitle()}
              </CardTitle>
            </CardHeader>
            <CardContent className="flex items-center justify-center h-64 text-gray-500">
              No data to display
            </CardContent>
          </Card>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <FilterControls />
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Category Pie Chart */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <TrendingUp className="w-5 h-5 text-ccw-yellow" />
              {getPeriodLabel()} by Category
            </CardTitle>
          </CardHeader>
          <CardContent>
            <ResponsiveContainer width="100%" height={250}>
              <PieChart>
                <Pie
                  data={pieChartData}
                  cx="50%"
                  cy="50%"
                  labelLine={false}
                  label={({ name, value, percent }: any) => 
                    `${name}: $${value.toFixed(2)} (${(percent * 100).toFixed(0)}%)`
                  }
                  outerRadius={80}
                  fill="#8884d8"
                  dataKey="value"
                >
                  {pieChartData.map((entry: any, index: number) => (
                    <Cell key={`cell-${index}`} fill={entry.color} />
                  ))}
                </Pie>
                <Tooltip formatter={(value: any) => [`$${value.toFixed(2)}`, 'Amount']} />
              </PieChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>

        {/* Time-Based Bar Chart */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <BarChart3 className="w-5 h-5 text-ccw-yellow" />
              {getTimeChartTitle()}
            </CardTitle>
          </CardHeader>
          <CardContent>
            <ResponsiveContainer width="100%" height={250}>
              <BarChart data={barChartData}>
                <CartesianGrid strokeDasharray="3 3" />
                <XAxis dataKey="label" />
                <YAxis />
                <Tooltip formatter={(value: any) => [`$${value.toFixed(2)}`, 'Amount']} />
                <Bar dataKey="amount" fill="#ECCD37" />
              </BarChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

// Recent Expenses Component  
function RecentExpenses() {
  const { data: recentExpenses, isLoading } = useQuery({
    queryKey: ['/api/expenses/my/recent'],
    queryFn: async () => {
      const response = await fetch('/api/expenses/my/recent', { credentials: 'include' });
      if (!response.ok) throw new Error('Failed to fetch recent expenses');
      return response.json();
    },
    retry: false,
  });

  if (isLoading) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Clock className="w-5 h-5 text-ccw-yellow" />
            Recent Expenses
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="space-y-3">
            {[...Array(3)].map((_, i) => (
              <div key={i} className="animate-pulse flex items-center justify-between p-3 border rounded">
                <div className="flex items-center space-x-3">
                  <div className="w-8 h-8 bg-gray-200 rounded"></div>
                  <div className="space-y-1">
                    <div className="h-4 bg-gray-200 rounded w-20"></div>
                    <div className="h-3 bg-gray-200 rounded w-16"></div>
                  </div>
                </div>
                <div className="h-4 bg-gray-200 rounded w-12"></div>
              </div>
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
          <Clock className="w-5 h-5 text-ccw-yellow" />
          Recent Expenses
        </CardTitle>
      </CardHeader>
      <CardContent>
        {!recentExpenses || recentExpenses.length === 0 ? (
          <div className="text-center py-8 text-gray-500">
            No recent expenses found
          </div>
        ) : (
          <div className="space-y-3">
            {recentExpenses.map((expense: any) => (
              <div key={expense.id} className="flex items-center justify-between p-3 border border-gray-200 rounded-lg hover:bg-gray-50">
                <div className="flex items-center space-x-3">
                  <div 
                    className="w-8 h-8 rounded flex items-center justify-center"
                    style={{ 
                      backgroundColor: expense.category?.color ? `${expense.category.color}20` : '#6B7280',
                      border: `2px solid ${expense.category?.color || '#6B7280'}`
                    }}
                  >
                    <div 
                      className="w-2 h-2 rounded-full"
                      style={{ backgroundColor: expense.category?.color || '#6B7280' }}
                    />
                  </div>
                  <div>
                    <p className="font-medium text-sm">{expense.description}</p>
                    <p className="text-xs text-gray-500">
                      {expense.category?.name} • {format(new Date(expense.date), 'MMM dd, yyyy')}
                    </p>
                  </div>
                </div>
                <div className="text-right">
                  <p className="font-semibold text-sm">${Number(expense.amount).toFixed(2)}</p>
                  <Badge 
                    variant={expense.status === 'approved' ? 'default' : expense.status === 'rejected' ? 'destructive' : 'secondary'}
                    className="text-xs"
                  >
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

// All Submitted Reports Component (for Admins/Approvers)
function AllSubmittedReports() {
  const { data: allExpenses, isLoading } = useQuery({
    queryKey: ['/api/expenses'],
    queryFn: async () => {
      const response = await fetch('/api/expenses', { credentials: 'include' });
      if (!response.ok) throw new Error('Failed to fetch expenses');
      return response.json();
    },
    retry: false,
  });

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
          <div className="animate-pulse space-y-3">
            {[...Array(5)].map((_, i) => (
              <div key={i} className="h-16 bg-gray-200 rounded"></div>
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
          <Eye className="w-5 h-5 text-ccw-yellow" />
          All Submitted Reports
        </CardTitle>
      </CardHeader>
      <CardContent>
        {!allExpenses || allExpenses.length === 0 ? (
          <div className="text-center py-8 text-gray-500">
            No expenses submitted yet
          </div>
        ) : (
          <div className="space-y-3 max-h-96 overflow-y-auto">
            {allExpenses.slice(0, 10).map((expense: any) => (
              <div key={expense.id} className="flex items-center justify-between p-3 border border-gray-200 rounded-lg hover:bg-gray-50">
                <div className="flex items-center space-x-3">
                  <div 
                    className="w-8 h-8 rounded flex items-center justify-center"
                    style={{ 
                      backgroundColor: expense.category?.color ? `${expense.category.color}20` : '#6B7280',
                      border: `2px solid ${expense.category?.color || '#6B7280'}`
                    }}
                  >
                    <div 
                      className="w-2 h-2 rounded-full"
                      style={{ backgroundColor: expense.category?.color || '#6B7280' }}
                    />
                  </div>
                  <div>
                    <p className="font-medium text-sm">{expense.description}</p>
                    <p className="text-xs text-gray-500">
                      {expense.user?.firstName} {expense.user?.lastName} • {expense.category?.name} • {format(new Date(expense.date), 'MMM dd, yyyy')}
                    </p>
                  </div>
                </div>
                <div className="text-right">
                  <p className="font-semibold text-sm">${Number(expense.amount).toFixed(2)}</p>
                  <Badge 
                    variant={expense.status === 'approved' ? 'default' : expense.status === 'rejected' ? 'destructive' : 'secondary'}
                    className="text-xs"
                  >
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

