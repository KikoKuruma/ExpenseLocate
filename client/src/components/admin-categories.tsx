import { useState } from "react";
import React from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useToast } from "@/hooks/use-toast";
import { useAuth } from "@/hooks/useAuth";
import { insertCategorySchema, type CategoryWithSubcategories } from "@shared/schema";
import { apiRequest } from "@/lib/queryClient";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { Plus, Edit2, Trash2, X, FolderPlus } from "lucide-react";
import { isUnauthorizedError } from "@/lib/authUtils";
import CategoryTree from "@/components/category-tree";
import { z } from "zod";

type FormData = z.infer<typeof insertCategorySchema>;

interface CategoryFormProps {
  editingCategory: CategoryWithSubcategories | null;
  showForm: boolean;
  onClose: () => void;
  onSubmit: (data: FormData) => void;
  isPending: boolean;
  categories: CategoryWithSubcategories[];
  parentId?: string;
}

function CategoryForm({ editingCategory, showForm, onClose, onSubmit, isPending, categories, parentId }: CategoryFormProps) {
  const form = useForm<FormData>({
    resolver: zodResolver(insertCategorySchema),
    defaultValues: {
      name: "",
      description: "",
      parentId: "__none__",
      color: "#6366F1",
    },
  });

  // Reset form when editingCategory changes
  React.useEffect(() => {
    if (editingCategory) {
      form.reset({
        name: editingCategory.name,
        description: editingCategory.description || "",
        parentId: editingCategory.parentId || "__none__",
        color: editingCategory.color || "#6366F1",
      });
    } else if (parentId) {
      form.reset({
        name: "",
        description: "",
        parentId: parentId,
        color: "#6366F1",
      });
    } else {
      form.reset({
        name: "",
        description: "",
        parentId: "__none__",
        color: "#6366F1",
      });
    }
  }, [editingCategory, parentId, form]);

  const handleSubmit = (data: FormData) => {
    // Convert "__none__" back to undefined for no parent
    const processedData = {
      ...data,
      parentId: data.parentId === "__none__" ? undefined : data.parentId,
    };
    onSubmit(processedData);
  };

  // Get all categories flattened for parent selection
  const flattenCategories = (cats: CategoryWithSubcategories[]): CategoryWithSubcategories[] => {
    const result: CategoryWithSubcategories[] = [];
    cats.forEach(cat => {
      result.push(cat);
      if (cat.subcategories?.length) {
        result.push(...flattenCategories(cat.subcategories));
      }
    });
    return result;
  };

  const flatCategories = flattenCategories(categories);

  if (!showForm) return null;

  return (
    <Card className="mb-6">
      <CardHeader>
        <CardTitle className="dialog-title-enhanced">
          {editingCategory ? "Edit Category" : parentId ? "Add Subcategory" : "Add Category"}
        </CardTitle>
      </CardHeader>
      <CardContent>
        <Form {...form}>
          <form onSubmit={form.handleSubmit(handleSubmit)} className="space-y-4">
            <FormField
              control={form.control}
              name="name"
              render={({ field }) => (
                <FormItem>
                  <FormLabel className="form-label-enhanced">Category Name</FormLabel>
                  <FormControl>
                    <Input 
                      placeholder="Enter category name" 
                      {...field} 
                      data-testid="input-category-name"
                    />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            <FormField
              control={form.control}
              name="description"
              render={({ field }) => (
                <FormItem>
                  <FormLabel className="form-label-enhanced">Description (Optional)</FormLabel>
                  <FormControl>
                    <Textarea 
                      placeholder="Enter category description" 
                      {...field} 
                      value={field.value || ""}
                      data-testid="textarea-category-description"
                    />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            <FormField
              control={form.control}
              name="color"
              render={({ field }) => (
                <FormItem>
                  <FormLabel className="form-label-enhanced">Category Color</FormLabel>
                  <FormControl>
                    <div className="flex items-center space-x-3">
                      <input
                        type="color"
                        value={field.value || "#6366F1"}
                        onChange={field.onChange}
                        className="w-16 h-10 border border-gray-300 rounded cursor-pointer"
                        data-testid="input-category-color"
                      />
                      <div className="flex items-center space-x-2">
                        <div 
                          className="w-8 h-8 rounded-lg border-2 flex items-center justify-center"
                          style={{ 
                            backgroundColor: `${field.value || '#6366F1'}20`,
                            borderColor: field.value || '#6366F1'
                          }}
                        >
                          <span className="text-xs font-semibold" style={{ color: field.value || '#6366F1' }}>
                            Aa
                          </span>
                        </div>
                        <span className="text-sm text-gray-600">Preview</span>
                      </div>
                    </div>
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            {!editingCategory && (
              <FormField
                control={form.control}
                name="parentId"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel className="form-label-enhanced">Parent Category (Optional)</FormLabel>
                    <Select 
                      onValueChange={(value) => field.onChange(value === "__none__" ? undefined : value)} 
                      value={field.value || "__none__"}
                    >
                      <FormControl>
                        <SelectTrigger data-testid="select-parent-category">
                          <SelectValue placeholder="Select parent category (leave empty for top-level)" />
                        </SelectTrigger>
                      </FormControl>
                      <SelectContent>
                        <SelectItem value="__none__">No parent (Top-level category)</SelectItem>
                        {flatCategories
                          .filter(cat => !cat.parentId) // Only show top-level categories as potential parents
                          .map((category) => (
                            <SelectItem key={category.id} value={category.id}>
                              {category.name}
                            </SelectItem>
                          ))}
                      </SelectContent>
                    </Select>
                    <FormMessage />
                  </FormItem>
                )}
              />
            )}

            <div className="flex justify-end space-x-2">
              <Button type="button" variant="outline" onClick={onClose} data-testid="button-cancel">
                Cancel
              </Button>
              <Button type="submit" disabled={isPending} data-testid="button-save-category">
                {isPending ? "Saving..." : (editingCategory ? "Update" : "Create")}
              </Button>
            </div>
          </form>
        </Form>
      </CardContent>
    </Card>
  );
}

export default function AdminCategories() {
  const { toast } = useToast();
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const [editingCategory, setEditingCategory] = useState<CategoryWithSubcategories | null>(null);
  const [showForm, setShowForm] = useState(false);
  const [parentIdForNew, setParentIdForNew] = useState<string>("");
  
  const isAdmin = user?.role === 'admin';

  const { data: categories = [], isLoading } = useQuery<CategoryWithSubcategories[]>({
    queryKey: ["/api/categories"],
  });

  const createCategoryMutation = useMutation({
    mutationFn: async (data: FormData) => {
      await apiRequest("POST", "/api/categories", data);
    },
    onSuccess: () => {
      // Invalidate categories and related expense queries for real-time updates
      queryClient.invalidateQueries({ queryKey: ["/api/categories"] });
      queryClient.invalidateQueries({ queryKey: ["/api/expenses/analytics/categories"] });
      setShowForm(false);
      setParentIdForNew("");
      toast({
        title: "Success",
        description: "Category created successfully",
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

  const updateCategoryMutation = useMutation({
    mutationFn: async (data: FormData) => {
      if (!editingCategory) throw new Error("No category selected for editing");
      await apiRequest("PUT", `/api/categories/${editingCategory.id}`, data);
    },
    onSuccess: () => {
      // Invalidate categories and related expense queries for real-time updates  
      queryClient.invalidateQueries({ queryKey: ["/api/categories"] });
      queryClient.invalidateQueries({ queryKey: ["/api/expenses/analytics/categories"] });
      setEditingCategory(null);
      setShowForm(false);
      toast({
        title: "Success",
        description: "Category updated successfully",
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

  const deleteCategoryMutation = useMutation({
    mutationFn: async (id: string) => {
      await apiRequest("DELETE", `/api/categories/${id}`);
    },
    onSuccess: () => {
      // Invalidate categories and related expense queries for real-time updates
      queryClient.invalidateQueries({ queryKey: ["/api/categories"] });
      queryClient.invalidateQueries({ queryKey: ["/api/expenses/analytics/categories"] });
      toast({
        title: "Success",
        description: "Category deleted successfully",
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

  const handleSubmit = (data: FormData) => {
    if (editingCategory) {
      updateCategoryMutation.mutate(data);
    } else {
      createCategoryMutation.mutate(data);
    }
  };

  const handleEdit = (category: CategoryWithSubcategories) => {
    setEditingCategory(category);
    setShowForm(true);
    setParentIdForNew("");
  };

  const handleDelete = (id: string) => {
    const category = categories.find(c => c.id === id);
    const categoryName = category?.name || 'this category';
    
    if (confirm(`Are you sure you want to delete "${categoryName}"?\n\nThis action cannot be undone. If this category has associated expenses, the deletion will fail and you'll need to reassign those expenses first.`)) {
      deleteCategoryMutation.mutate(id);
    }
  };

  const handleAddSubcategory = (parentId: string) => {
    setParentIdForNew(parentId);
    setEditingCategory(null);
    setShowForm(true);
  };

  const handleAddCategory = () => {
    setEditingCategory(null);
    setParentIdForNew("");
    setShowForm(true);
  };

  const handleCloseForm = () => {
    setShowForm(false);
    setEditingCategory(null);
    setParentIdForNew("");
  };

  if (isLoading) {
    return <div>Loading categories...</div>;
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h3 className="text-lg font-semibold text-ccw-dark">Category Management</h3>
          <p className="text-sm text-gray-600">
            Organize expenses with main categories and subcategories
          </p>
        </div>
        <div className="flex space-x-2">
          {isAdmin && (
            <Button 
              onClick={handleAddCategory}
              className="bg-ccw-brown hover:bg-ccw-brown/90 text-white"
              data-testid="button-add-parent-category"
            >
              <FolderPlus className="w-4 h-4 mr-2" />
              Add Parent Category
            </Button>
          )}
        </div>
      </div>

      <CategoryForm
        editingCategory={editingCategory}
        showForm={showForm}
        onClose={handleCloseForm}
        onSubmit={handleSubmit}
        isPending={createCategoryMutation.isPending || updateCategoryMutation.isPending}
        categories={categories}
        parentId={parentIdForNew}
      />

      <div className="space-y-4">
        {categories.length === 0 ? (
          <Card>
            <CardContent className="flex items-center justify-center h-32">
              <div className="text-center">
                <FolderPlus className="w-8 h-8 text-gray-400 mx-auto mb-2" />
                <p className="text-gray-500">No categories created yet</p>
                <p className="text-sm text-gray-400">Click "Add Category" to get started</p>
              </div>
            </CardContent>
          </Card>
        ) : (
          <CategoryTree
            categories={categories}
            onEdit={handleEdit}
            onDelete={handleDelete}
            onAddSubcategory={handleAddSubcategory}
          />
        )}
      </div>
    </div>
  );
}