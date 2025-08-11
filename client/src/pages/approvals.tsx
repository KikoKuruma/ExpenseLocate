import { useEffect, useState } from "react";
import { useAuth } from "@/hooks/useAuth";
import { useToast } from "@/hooks/use-toast";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { format } from "date-fns";
import Sidebar from "@/components/sidebar";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { 
  CheckCircle, 
  XCircle, 
  AlertCircle, 
  Eye, 
  Clock, 
  FileText,
  Calendar,
  DollarSign,
  User,
  Tag
} from "lucide-react";
import { isUnauthorizedError } from "@/lib/authUtils";

export default function MyApprovals() {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const { user, isAuthenticated, isLoading } = useAuth();
  const [selectedExpense, setSelectedExpense] = useState<any>(null);

  // Redirect non-approvers
  useEffect(() => {
    if (!isLoading && isAuthenticated && user?.role !== "admin" && user?.role !== "approver") {
      toast({
        title: "Access Denied",
        description: "You don't have permission to access this page.",
        variant: "destructive",
      });
      window.location.href = "/";
    }
  }, [isAuthenticated, isLoading, user, toast]);

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

  // Fetch pending expenses
  const { data: pendingExpenses, isLoading: pendingLoading } = useQuery({
    queryKey: ["/api/expenses/pending"],
    enabled: !!user && (user.role === "admin" || user.role === "approver"),
  });

  // Fetch recently approved expenses
  const { data: allExpenses } = useQuery({
    queryKey: ["/api/expenses"],
    enabled: !!user && (user.role === "admin" || user.role === "approver"),
  });

  // Filter recently approved expenses (last 10)
  const recentlyApproved = Array.isArray(allExpenses) ? allExpenses.filter((expense: any) => 
    expense.status === 'approved'
  ).slice(0, 10) : [];

  // Approve/reject expense mutation
  const updateStatusMutation = useMutation({
    mutationFn: async ({ id, status }: { id: string; status: string }) => {
      const response = await fetch(`/api/expenses/${id}/approve`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ status }),
      });
      if (!response.ok) throw new Error("Failed to update expense status");
      return response.json();
    },
    onSuccess: (_, { status }) => {
      // Invalidate all expense-related queries for real-time updates
      queryClient.invalidateQueries({ queryKey: ["/api/expenses"] });
      queryClient.invalidateQueries({ queryKey: ["/api/expenses/pending"] });
      queryClient.invalidateQueries({ queryKey: ["/api/expenses/stats"] });
      queryClient.invalidateQueries({ queryKey: ["/api/expenses/my-stats"] });
      queryClient.invalidateQueries({ queryKey: ["/api/expenses/analytics/categories"] });
      queryClient.invalidateQueries({ queryKey: ["/api/expenses/analytics/monthly"] });
      setSelectedExpense(null);
      toast({
        title: "Success",
        description: `Expense ${status === "approved" ? "approved" : "rejected"} successfully`,
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

  const handleApprove = (expenseId: string) => {
    updateStatusMutation.mutate({ id: expenseId, status: "approved" });
  };

  const handleReject = (expenseId: string) => {
    updateStatusMutation.mutate({ id: expenseId, status: "rejected" });
  };

  const handleViewDetails = (expense: any) => {
    setSelectedExpense(expense);
  };

  if (isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-ccw-bg">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-ccw-yellow"></div>
      </div>
    );
  }

  if (!isAuthenticated || (user?.role !== "admin" && user?.role !== "approver")) {
    return null;
  }

  return (
    <div className="flex h-screen bg-ccw-bg">
      <Sidebar />
      
      <main className="flex-1 overflow-auto">
        {/* Header */}
        <header className="bg-white shadow-sm border-b border-gray-200 px-6 py-4 lg:px-6 pl-20 lg:pl-6">
          <div>
            <h2 className="text-2xl font-bold text-ccw-dark">My Approvals</h2>
            <p className="text-gray-600">Review and approve expense reports</p>
          </div>
        </header>

        {/* Content */}
        <div className="p-6 space-y-6">
          {/* Summary Card */}
          <Card>
            <CardContent className="p-6">
              <div className="flex items-center space-x-3">
                <div className="w-12 h-12 bg-orange-100 rounded-lg flex items-center justify-center">
                  <AlertCircle className="w-6 h-6 text-orange-600" />
                </div>
                <div>
                  <p className="text-sm font-medium text-gray-600">Pending Approval</p>
                  <p className="text-2xl font-bold text-ccw-dark" data-testid="text-pending-count">
                    {Array.isArray(pendingExpenses) ? pendingExpenses.length : 0}
                  </p>
                  <p className="text-xs text-gray-500">
                    expense reports awaiting action
                  </p>
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Pending Expenses */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Clock className="w-5 h-5 text-ccw-yellow" />
                Expenses Awaiting Approval
              </CardTitle>
            </CardHeader>
            <CardContent>
              {pendingLoading ? (
                <div className="flex justify-center py-8">
                  <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-ccw-yellow"></div>
                </div>
              ) : !Array.isArray(pendingExpenses) || pendingExpenses.length === 0 ? (
                <div className="text-center py-8">
                  <CheckCircle className="mx-auto h-12 w-12 text-gray-400" />
                  <h3 className="mt-4 text-sm font-medium text-gray-900">All caught up!</h3>
                  <p className="mt-2 text-sm text-gray-500">
                    There are no expenses pending approval at this time.
                  </p>
                </div>
              ) : (
                <div className="space-y-4">
                  {Array.isArray(pendingExpenses) && pendingExpenses.map((expense: any) => (
                    <div
                      key={expense.id}
                      className="p-4 border border-gray-200 rounded-lg hover:bg-gray-50 transition-colors"
                    >
                      <div className="flex items-center justify-between">
                        <div className="flex items-center space-x-4">
                          <div 
                            className="w-10 h-10 rounded-lg flex items-center justify-center"
                            style={{ 
                              backgroundColor: expense.category?.color ? `${expense.category.color}20` : '#6B728020',
                              border: `2px solid ${expense.category?.color || '#6B7280'}`
                            }}
                          >
                            <div 
                              className="w-3 h-3 rounded-full"
                              style={{ backgroundColor: expense.category?.color || '#6B7280' }}
                            />
                          </div>
                          <div>
                            <h4 className="font-medium text-ccw-dark">{expense.description}</h4>
                            <p className="text-sm text-gray-600">
                              {expense.user?.firstName} {expense.user?.lastName} • {expense.category?.name}
                            </p>
                            <p className="text-xs text-gray-500">
                              {format(new Date(expense.date), 'MMM dd, yyyy')}
                            </p>
                          </div>
                        </div>
                        
                        <div className="flex items-center space-x-3">
                          <div className="text-right">
                            <p className="font-semibold text-lg text-ccw-dark">
                              ${Number(expense.amount).toFixed(2)}
                            </p>
                            <Badge variant="secondary" className="text-xs bg-yellow-100 text-yellow-800">
                              Pending
                            </Badge>
                          </div>
                          
                          <div className="flex space-x-2">
                            <Button
                              size="sm"
                              variant="outline"
                              onClick={() => handleViewDetails(expense)}
                              data-testid={`button-view-${expense.id}`}
                            >
                              <Eye className="w-4 h-4 mr-1" />
                              View
                            </Button>
                            <Button
                              size="sm"
                              className="bg-green-600 hover:bg-green-700 text-white"
                              onClick={() => handleApprove(expense.id)}
                              disabled={updateStatusMutation.isPending}
                              data-testid={`button-approve-${expense.id}`}
                            >
                              <CheckCircle className="w-4 h-4 mr-1" />
                              Approve
                            </Button>
                            <Button
                              size="sm"
                              className="bg-red-600 hover:bg-red-700 text-white"
                              onClick={() => handleReject(expense.id)}
                              disabled={updateStatusMutation.isPending}
                              data-testid={`button-reject-${expense.id}`}
                            >
                              <XCircle className="w-4 h-4 mr-1" />
                              Reject
                            </Button>
                          </div>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>

          {/* Recently Approved */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <CheckCircle className="w-5 h-5 text-green-600" />
                Recently Approved Expenses
              </CardTitle>
            </CardHeader>
            <CardContent>
              {!recentlyApproved || recentlyApproved.length === 0 ? (
                <div className="text-center py-8 text-gray-500">
                  No recently approved expenses
                </div>
              ) : (
                <div className="space-y-3">
                  {recentlyApproved.map((expense: any) => (
                    <div
                      key={expense.id}
                      className="flex items-center justify-between p-3 border border-gray-200 rounded-lg hover:bg-gray-50"
                    >
                      <div className="flex items-center space-x-3">
                        <div 
                          className="w-8 h-8 rounded flex items-center justify-center"
                          style={{ 
                            backgroundColor: expense.category?.color ? `${expense.category.color}20` : '#6B728020',
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
                            {expense.user?.firstName} {expense.user?.lastName} • {expense.category?.name}
                          </p>
                        </div>
                      </div>
                      <div className="text-right">
                        <p className="font-semibold text-sm">${Number(expense.amount).toFixed(2)}</p>
                        <Badge variant="default" className="text-xs bg-green-100 text-green-800">
                          Approved
                        </Badge>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        </div>
      </main>

      {/* Expense Details Dialog */}
      <Dialog open={!!selectedExpense} onOpenChange={() => setSelectedExpense(null)}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle className="dialog-title-enhanced">Expense Details</DialogTitle>
          </DialogHeader>
          {selectedExpense && (
            <div className="space-y-6">
              {/* Header Info */}
              <div className="flex items-center space-x-4 p-4 bg-gray-50 rounded-lg">
                <div 
                  className="w-12 h-12 rounded-lg flex items-center justify-center"
                  style={{ 
                    backgroundColor: selectedExpense.category?.color ? `${selectedExpense.category.color}20` : '#6B728020',
                    border: `2px solid ${selectedExpense.category?.color || '#6B7280'}`
                  }}
                >
                  <div 
                    className="w-4 h-4 rounded-full"
                    style={{ backgroundColor: selectedExpense.category?.color || '#6B7280' }}
                  />
                </div>
                <div>
                  <h3 className="text-lg font-semibold text-ccw-dark">{selectedExpense.description}</h3>
                  <p className="text-gray-600">{selectedExpense.category?.name}</p>
                </div>
              </div>

              {/* Details Grid */}
              <div className="grid grid-cols-2 gap-6">
                <div className="space-y-4">
                  <div className="flex items-center space-x-3">
                    <DollarSign className="w-5 h-5 text-gray-500" />
                    <div>
                      <p className="text-sm font-medium text-gray-600">Amount</p>
                      <p className="text-xl font-bold text-ccw-dark">
                        ${Number(selectedExpense.amount).toFixed(2)}
                      </p>
                    </div>
                  </div>
                  
                  <div className="flex items-center space-x-3">
                    <Calendar className="w-5 h-5 text-gray-500" />
                    <div>
                      <p className="text-sm font-medium text-gray-600">Date</p>
                      <p className="text-lg text-ccw-dark">
                        {format(new Date(selectedExpense.date), 'MMMM dd, yyyy')}
                      </p>
                    </div>
                  </div>
                </div>

                <div className="space-y-4">
                  <div className="flex items-center space-x-3">
                    <User className="w-5 h-5 text-gray-500" />
                    <div>
                      <p className="text-sm font-medium text-gray-600">Submitted By</p>
                      <p className="text-lg text-ccw-dark">
                        {selectedExpense.user?.firstName} {selectedExpense.user?.lastName}
                      </p>
                      <p className="text-sm text-gray-500">{selectedExpense.user?.email}</p>
                    </div>
                  </div>
                  
                  <div className="flex items-center space-x-3">
                    <Tag className="w-5 h-5 text-gray-500" />
                    <div>
                      <p className="text-sm font-medium text-gray-600">Status</p>
                      <Badge variant="secondary" className="bg-yellow-100 text-yellow-800">
                        {selectedExpense.status}
                      </Badge>
                    </div>
                  </div>
                </div>
              </div>

              {/* Notes */}
              {selectedExpense.notes && (
                <div>
                  <p className="text-sm font-medium text-gray-600 mb-2">Notes</p>
                  <p className="text-ccw-dark bg-gray-50 p-3 rounded-lg">
                    {selectedExpense.notes}
                  </p>
                </div>
              )}

              {/* Receipt */}
              {selectedExpense.receiptUrl && (
                <div>
                  <p className="text-sm font-medium text-gray-600 mb-2">Receipt</p>
                  <div className="border border-gray-200 rounded-lg p-4 bg-gray-50">
                    <div className="flex items-center space-x-2">
                      <FileText className="w-5 h-5 text-gray-500" />
                      <a 
                        href={selectedExpense.receiptUrl} 
                        target="_blank" 
                        rel="noopener noreferrer"
                        className="text-ccw-yellow hover:underline font-medium"
                      >
                        View Receipt
                      </a>
                    </div>
                  </div>
                </div>
              )}

              {/* Action Buttons */}
              <div className="flex justify-end space-x-3 pt-4 border-t border-gray-200">
                <Button
                  variant="outline"
                  onClick={() => setSelectedExpense(null)}
                >
                  Close
                </Button>
                <Button
                  className="bg-green-600 hover:bg-green-700 text-white"
                  onClick={() => handleApprove(selectedExpense.id)}
                  disabled={updateStatusMutation.isPending}
                >
                  <CheckCircle className="w-4 h-4 mr-2" />
                  Approve
                </Button>
                <Button
                  className="bg-red-600 hover:bg-red-700 text-white"
                  onClick={() => handleReject(selectedExpense.id)}
                  disabled={updateStatusMutation.isPending}
                >
                  <XCircle className="w-4 h-4 mr-2" />
                  Reject
                </Button>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}