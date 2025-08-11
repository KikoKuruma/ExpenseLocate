import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { useToast } from "@/hooks/use-toast";
import { apiRequest } from "@/lib/queryClient";
import { ChevronRight, FileText, Truck, Zap, HardHat } from "lucide-react";
import { format } from "date-fns";
import type { ExpenseWithCategory } from "@shared/schema";

interface ExpenseListProps {
  filters?: {
    status?: string;
    categoryId?: string;
    search?: string;
  };
}

const categoryIcons = {
  Equipment: HardHat,
  Vehicle: Truck,
  Utilities: Zap,
  Materials: FileText,
  "Meals & Entertainment": FileText,
  Travel: FileText,
};

const statusColors = {
  pending: "bg-orange-100 text-orange-800",
  approved: "bg-green-100 text-green-800",
  rejected: "bg-red-100 text-red-800",
};

export default function ExpenseList({ filters }: ExpenseListProps) {
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const queryParams = new URLSearchParams();
  if (filters?.status) queryParams.set('status', filters.status);
  if (filters?.categoryId) queryParams.set('categoryId', filters.categoryId);
  if (filters?.search) queryParams.set('search', filters.search);

  const { data: expenses, isLoading } = useQuery<ExpenseWithCategory[]>({
    queryKey: ["/api/expenses", filters],
    queryFn: async () => {
      const url = queryParams.toString() 
        ? `/api/expenses?${queryParams.toString()}`
        : "/api/expenses";
      const response = await fetch(url, { credentials: "include" });
      if (!response.ok) throw new Error("Failed to fetch expenses");
      return response.json();
    },
  });

  const updateStatusMutation = useMutation({
    mutationFn: async ({ id, status }: { id: string; status: string }) => {
      await apiRequest("PUT", `/api/expenses/${id}`, { status });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/expenses"] });
      queryClient.invalidateQueries({ queryKey: ["/api/expenses/stats"] });
      queryClient.invalidateQueries({ queryKey: ["/api/expenses/my-stats"] });
      toast({
        title: "Success",
        description: "Expense status updated successfully",
      });
    },
    onError: (error) => {
      toast({
        title: "Error",
        description: error.message,
        variant: "destructive",
      });
    },
  });

  if (isLoading) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>Expenses</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="space-y-4">
            {[...Array(3)].map((_, i) => (
              <div key={i} className="animate-pulse flex items-center space-x-4 p-4">
                <div className="w-12 h-12 bg-gray-200 rounded-lg"></div>
                <div className="flex-1">
                  <div className="h-4 bg-gray-200 rounded w-1/2 mb-2"></div>
                  <div className="h-3 bg-gray-200 rounded w-1/3"></div>
                </div>
                <div className="w-20 h-6 bg-gray-200 rounded"></div>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>
    );
  }

  if (!expenses?.length) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>Expenses</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="text-center py-8">
            <FileText className="w-12 h-12 text-gray-400 mx-auto mb-4" />
            <p className="text-gray-500">No expenses found</p>
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Recent Expenses</CardTitle>
      </CardHeader>
      <CardContent className="p-0">
        <div className="divide-y divide-gray-200">
          {expenses.map((expense) => {
            const IconComponent = categoryIcons[expense.category?.name as keyof typeof categoryIcons] || FileText;
            
            return (
              <div key={expense.id} className="p-6 hover:bg-gray-50 transition-colors">
                <div className="flex items-center justify-between">
                  <div className="flex items-center space-x-4">
                    <div 
                      className="w-12 h-12 rounded-lg flex items-center justify-center"
                      style={{ 
                        backgroundColor: expense.category?.color ? `${expense.category.color}20` : '#6B7280',
                        border: `2px solid ${expense.category?.color || '#6B7280'}`
                      }}
                    >
                      <IconComponent 
                        className="w-6 h-6" 
                        style={{ color: expense.category?.color || '#6B7280' }}
                      />
                    </div>
                    <div>
                      <h4 className="font-medium text-ccw-dark" data-testid={`expense-description-${expense.id}`}>
                        {expense.description}
                      </h4>
                      <p className="text-sm text-gray-500">
                        {expense.category?.name} • Filed on {format(new Date(expense.date), 'MMM dd, yyyy')}
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
                      <p className="font-semibold text-ccw-dark" data-testid={`expense-amount-${expense.id}`}>
                        ${Number(expense.amount).toFixed(2)}
                      </p>
                      <Badge 
                        className={statusColors[expense.status as keyof typeof statusColors]}
                        data-testid={`expense-status-${expense.id}`}
                      >
                        {expense.status.charAt(0).toUpperCase() + expense.status.slice(1)}
                      </Badge>
                    </div>
                    
                    {expense.status === 'pending' && (
                      <div className="flex space-x-2">
                        <Button
                          size="sm"
                          variant="outline"
                          className="text-ccw-green border-ccw-green hover:bg-ccw-green hover:text-white"
                          onClick={() => updateStatusMutation.mutate({ id: expense.id, status: 'approved' })}
                          disabled={updateStatusMutation.isPending}
                          data-testid={`button-approve-${expense.id}`}
                        >
                          Approve
                        </Button>
                        <Button
                          size="sm"
                          variant="outline"
                          className="text-ccw-red border-ccw-red hover:bg-ccw-red hover:text-white"
                          onClick={() => updateStatusMutation.mutate({ id: expense.id, status: 'rejected' })}
                          disabled={updateStatusMutation.isPending}
                          data-testid={`button-reject-${expense.id}`}
                        >
                          Reject
                        </Button>
                      </div>
                    )}
                    
                    <Button variant="ghost" size="sm" data-testid={`button-view-${expense.id}`}>
                      <ChevronRight className="w-5 h-5 text-gray-400" />
                    </Button>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      </CardContent>
    </Card>
  );
}
