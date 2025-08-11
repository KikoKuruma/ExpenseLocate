import { useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useToast } from "@/hooks/use-toast";
import { useAuth } from "@/hooks/useAuth";
import { insertExpenseSchema, type Category, type User } from "@shared/schema";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { X, Upload, Users } from "lucide-react";
import { z } from "zod";

const formSchema = insertExpenseSchema.extend({
  date: z.string().min(1, "Date is required"),
  amount: z.string()
    .min(1, "Amount is required")
    .refine((val) => !isNaN(parseFloat(val)) && parseFloat(val) > 0, "Amount must be a positive number")
    .refine((val) => parseFloat(val) <= 10000, "Amount cannot exceed $10,000 per expense"),
  userId: z.string().min(1, "User is required"), // Always required now
  description: z.string()
    .min(3, "Description must be at least 3 characters")
    .max(200, "Description cannot exceed 200 characters"),
});

type FormData = z.infer<typeof formSchema>;

interface ExpenseFormProps {
  onClose?: () => void;
  onSuccess?: () => void;
  onSubmit?: (data: any) => void;
  initialData?: Partial<FormData>;
  isLoading?: boolean;
  submitButtonText?: string;
}

export default function ExpenseForm({ 
  onClose, 
  onSuccess, 
  onSubmit,
  initialData,
  isLoading = false,
  submitButtonText = "Submit Expense"
}: ExpenseFormProps) {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const { user } = useAuth();

  const { data: categoriesData = [] } = useQuery({
    queryKey: ["/api/categories"],
  });
  
  // Flatten categories for the select dropdown
  const flattenCategories = (cats: any[]): any[] => {
    const result: any[] = [];
    cats.forEach((cat: any) => {
      result.push({ ...cat, level: 0 });
      if (cat.subcategories?.length) {
        cat.subcategories.forEach((subcat: any) => {
          result.push({ ...subcat, level: 1, parentName: cat.name });
        });
      }
    });
    return result;
  };
  
  const categories = flattenCategories(Array.isArray(categoriesData) ? categoriesData : []);

  // Only fetch users if current user is admin or approver
  const { data: users } = useQuery<User[]>({
    queryKey: ["/api/users"],
    enabled: user?.role === "admin" || user?.role === "approver",
  });

  const form = useForm<FormData>({
    resolver: zodResolver(formSchema),
    defaultValues: {
      description: initialData?.description || "",
      amount: initialData?.amount?.toString() || "",
      categoryId: initialData?.categoryId || "",
      date: initialData?.date ? new Date(initialData.date).toISOString().split('T')[0] : new Date().toISOString().split('T')[0],
      notes: initialData?.notes || "",
      userId: initialData?.userId || ((user?.role === "admin" || user?.role === "approver") ? "" : user?.id || ""), // Default to current user for standard users
    },
  });

  const createExpenseMutation = useMutation({
    mutationFn: async (data: FormData) => {
      const formData = new FormData();
      
      // Append all form fields
      Object.entries(data).forEach(([key, value]) => {
        if (value !== undefined && value !== null) {
          formData.append(key, value.toString());
        }
      });
      
      // Append file if selected
      if (selectedFile) {
        formData.append('receipt', selectedFile);
      }

      const response = await fetch('/api/expenses', {
        method: 'POST',
        body: formData,
        credentials: 'include',
      });

      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.message || 'Failed to create expense');
      }

      return response.json();
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
      if (onSuccess) {
        onSuccess();
      }
    },
    onError: (error) => {
      toast({
        title: "Error",
        description: error.message,
        variant: "destructive",
      });
    },
  });

  const handleSubmit = async (data: FormData) => {
    if (onSubmit) {
      // Edit mode - use custom submit handler
      onSubmit(data);
    } else {
      // Create mode - use default creation logic
      createExpenseMutation.mutate(data);
    }
  };

  const handleFileChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (file) {
      setSelectedFile(file);
    }
  };

  const formContent = (
    <Form {...form}>
      <form onSubmit={form.handleSubmit(handleSubmit)} className="space-y-6">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          <FormField
            control={form.control}
            name="description"
            render={({ field }) => (
              <FormItem>
                <FormLabel className="form-label-enhanced">Description</FormLabel>
                <FormControl>
                  <Input 
                    placeholder="Enter expense description" 
                    {...field} 
                    data-testid="input-description"
                  />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />
          
          <FormField
            control={form.control}
            name="amount"
            render={({ field }) => (
              <FormItem>
                <FormLabel className="form-label-enhanced">Amount</FormLabel>
                <FormControl>
                  <div className="relative">
                    <span className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-500">$</span>
                    <Input 
                      type="number" 
                      step="0.01" 
                      placeholder="0.00" 
                      className="pl-8"
                      {...field} 
                      data-testid="input-amount"
                    />
                  </div>
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />
        </div>
            
        
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          <FormField
                control={form.control}
                name="categoryId"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel className="form-label-enhanced">Category</FormLabel>
                    <Select onValueChange={field.onChange} defaultValue={field.value}>
                      <FormControl>
                        <SelectTrigger data-testid="select-category">
                          <SelectValue placeholder="Select category" />
                        </SelectTrigger>
                      </FormControl>
                      <SelectContent>
                        {categories?.map((category) => (
                          <SelectItem key={category.id} value={category.id}>
                            <div className="flex items-center space-x-2">
                              <div 
                                className="w-4 h-4 rounded border"
                                style={{ 
                                  backgroundColor: category.color || '#6B7280',
                                  borderColor: category.color || '#6B7280'
                                }}
                              />
                              <span className={category.level > 0 ? "ml-4 text-sm" : ""}>
                                {category.level > 0 && "└─ "}
                                {category.name}
                                {category.level > 0 && category.parentName && (
                                  <span className="text-xs text-gray-500 ml-1">
                                    ({category.parentName})
                                  </span>
                                )}
                              </span>
                            </div>
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    <FormMessage />
                  </FormItem>
                )}
              />
              
              <FormField
                control={form.control}
                name="date"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel className="form-label-enhanced">Date</FormLabel>
                    <FormControl>
                      <Input 
                        type="date" 
                        {...field} 
                        data-testid="input-date"
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
            </div>

            {/* User Selection Field - Full width */}
            <FormField
              control={form.control}
              name="userId"
              render={({ field }) => (
                <FormItem>
                  <FormLabel className="form-label-enhanced flex items-center gap-2">
                    <Users className="w-4 h-4 text-ccw-yellow" />
                    Expense For
                  </FormLabel>
                  {user?.role === "admin" || user?.role === "approver" ? (
                    // Selectable dropdown for admins/approvers
                    <Select onValueChange={field.onChange} defaultValue={field.value}>
                      <FormControl>
                        <SelectTrigger data-testid="select-user">
                          <SelectValue placeholder="Select user" />
                        </SelectTrigger>
                      </FormControl>
                      <SelectContent>
                        {users?.map((userOption) => (
                          <SelectItem key={userOption.id} value={userOption.id}>
                            <div className="flex items-center justify-between w-full">
                              <span className="font-medium">
                                {userOption.firstName && userOption.lastName 
                                  ? `${userOption.firstName} ${userOption.lastName}`
                                  : userOption.email}
                              </span>
                              <span className="text-xs text-gray-500 bg-gray-100 px-2 py-1 rounded">
                                {userOption.role}
                              </span>
                            </div>
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  ) : (
                    // Read-only display for standard users
                    <FormControl>
                      <div className="flex items-center p-3 bg-gray-50 border border-gray-200 rounded-md">
                        <span className="text-gray-900 font-medium">
                          {user?.firstName && user?.lastName 
                            ? `${user.firstName} ${user.lastName}` 
                            : user?.email || 'Current User'}
                        </span>
                        <span className="ml-auto text-xs text-gray-500 bg-ccw-yellow/20 text-ccw-dark px-2 py-1 rounded">
                          Your Account
                        </span>
                      </div>
                    </FormControl>
                  )}
                  <FormMessage />
                </FormItem>
              )}
            />
            
            <div>
              <FormLabel className="form-label-enhanced">Receipt Upload</FormLabel>
              <div className="relative border-2 border-dashed border-gray-300 rounded-lg p-6 text-center hover:border-ccw-yellow transition-colors mt-2">
                <Upload className="mx-auto h-12 w-12 text-gray-400" />
                <div className="mt-4">
                  <p className="text-sm text-gray-600">Click to upload receipt or drag and drop</p>
                  <p className="text-xs text-gray-500 mt-1">PNG, JPG, PDF up to 10MB</p>
                  {selectedFile && (
                    <p className="text-sm text-ccw-green mt-2" data-testid="text-selected-file">
                      Selected: {selectedFile.name}
                    </p>
                  )}
                </div>
                <input
                  type="file"
                  accept="image/*,.pdf"
                  onChange={handleFileChange}
                  className="absolute inset-0 w-full h-full opacity-0 cursor-pointer"
                  data-testid="input-receipt"
                />
              </div>
            </div>
            
            <FormField
              control={form.control}
              name="notes"
              render={({ field }) => (
                <FormItem>
                  <FormLabel className="form-label-enhanced">Notes (Optional)</FormLabel>
                  <FormControl>
                    <Textarea 
                      placeholder="Additional notes about this expense" 
                      rows={3}
                      {...field}
                      value={field.value || ""}
                      data-testid="textarea-notes"
                    />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
            
            <div className="flex justify-end space-x-3 pt-4 border-t border-gray-200">
              <Button 
                type="button" 
                variant="outline" 
                onClick={() => {
                  if (onClose) {
                    onClose();
                  } else {
                    // Fallback: try to close any parent dialog
                    const dialog = document.querySelector('[data-state="open"][role="dialog"]');
                    if (dialog) {
                      const closeButton = dialog.querySelector('button[aria-label="Close"]');
                      if (closeButton) {
                        (closeButton as HTMLButtonElement).click();
                      }
                    }
                  }
                }}
                data-testid="button-cancel"
              >
                Cancel
              </Button>
              <Button 
                type="submit"
                className="bg-ccw-yellow hover:bg-ccw-yellow/90 text-ccw-dark"
                disabled={isLoading || createExpenseMutation.isPending}
                data-testid="button-submit-expense"
              >
                {(isLoading || createExpenseMutation.isPending) ? "Submitting..." : submitButtonText}
              </Button>
            </div>
      </form>
    </Form>
  );

  // If initialData is provided (edit mode), return just the form content without modal wrapper
  if (initialData) {
    return formContent;
  }

  // Otherwise, return with modal wrapper (create mode)
  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 z-50 flex items-center justify-center p-4">
      <div className="bg-white rounded-xl shadow-xl max-w-2xl w-full max-h-[90vh] overflow-y-auto">
        <div className="p-6 border-b border-gray-200">
          <h3 className="text-xl font-semibold text-ccw-dark">Submit New Expense</h3>
        </div>
        
        <div className="p-6">
          {formContent}
        </div>
      </div>
    </div>
  );
}
