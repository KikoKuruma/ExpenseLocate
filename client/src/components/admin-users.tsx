import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { 
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Users, Shield, ShieldCheck, User, LogIn, Edit } from "lucide-react";
import { isUnauthorizedError } from "@/lib/authUtils";
import type { User as UserType } from "@shared/schema";
import { UserRole } from "@shared/schema";
import AdminCreateUser from "./admin-create-user";

const editUserSchema = z.object({
  firstName: z.string().min(1, "First name is required"),
  lastName: z.string().min(1, "Last name is required"),
  email: z.string().email("Please enter a valid email address"),
  profileImageUrl: z.string().url("Please enter a valid image URL").optional().or(z.literal(""))
});

type EditUserData = z.infer<typeof editUserSchema>;

export default function AdminUsers() {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [selectedUser, setSelectedUser] = useState<UserType | null>(null);
  const [newRole, setNewRole] = useState<string>("");
  const [showConfirmDialog, setShowConfirmDialog] = useState(false);
  const [showEditDialog, setShowEditDialog] = useState(false);
  const [userToEdit, setUserToEdit] = useState<UserType | null>(null);

  const editForm = useForm<EditUserData>({
    resolver: zodResolver(editUserSchema),
    defaultValues: {
      firstName: "",
      lastName: "",
      email: "",
      profileImageUrl: "",
    },
  });

  const { data: users = [], isLoading } = useQuery<UserType[]>({
    queryKey: ["/api/users"],
  });

  const updateRoleMutation = useMutation({
    mutationFn: async ({ userId, role }: { userId: string; role: string }) => {
      await apiRequest("PUT", `/api/users/${userId}/role`, { role });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/users"] });
      setShowConfirmDialog(false);
      setSelectedUser(null);
      setNewRole("");
      toast({
        title: "Success",
        description: "User role updated successfully",
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

  const impersonateMutation = useMutation({
    mutationFn: async (userId: string) => {
      await apiRequest("POST", "/api/auth/impersonate", { userId });
    },
    onSuccess: () => {
      toast({
        title: "Success",
        description: "Successfully signed in as user. Redirecting...",
      });
      // Refresh the page to load the new user session
      setTimeout(() => {
        window.location.href = "/";
      }, 1000);
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
        description: error.message || "Failed to sign in as user",
        variant: "destructive",
      });
    },
  });

  const editUserMutation = useMutation({
    mutationFn: async ({ userId, userData }: { userId: string; userData: EditUserData }) => {
      await apiRequest("PUT", `/api/users/${userId}`, userData);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/users"] });
      setShowEditDialog(false);
      setUserToEdit(null);
      editForm.reset();
      toast({
        title: "Success",
        description: "User information updated successfully",
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
        description: error.message || "Failed to update user information",
        variant: "destructive",
      });
    },
  });

  const handleRoleChange = (user: UserType, role: string) => {
    setSelectedUser(user);
    setNewRole(role);
    setShowConfirmDialog(true);
  };

  const confirmRoleChange = () => {
    if (selectedUser && newRole) {
      updateRoleMutation.mutate({ userId: selectedUser.id, role: newRole });
    }
  };

  const handleEditUser = (user: UserType) => {
    setUserToEdit(user);
    editForm.reset({
      firstName: user.firstName || "",
      lastName: user.lastName || "",
      email: user.email || "",
      profileImageUrl: user.profileImageUrl || "",
    });
    setShowEditDialog(true);
  };

  const handleEditSubmit = (data: EditUserData) => {
    if (userToEdit) {
      editUserMutation.mutate({ 
        userId: userToEdit.id, 
        userData: data 
      });
    }
  };

  const getRoleBadge = (role: string) => {
    const roleConfig = {
      user: { label: "Basic User", color: "bg-blue-100 text-blue-800", icon: User },
      approver: { label: "Approver", color: "bg-green-100 text-green-800", icon: Shield },
      admin: { label: "Administrator", color: "bg-red-100 text-red-800", icon: ShieldCheck },
    };

    const config = roleConfig[role as keyof typeof roleConfig] || roleConfig.user;
    const IconComponent = config.icon;

    return (
      <Badge className={`${config.color} font-medium`}>
        <IconComponent className="w-3 h-3 mr-1" />
        {config.label}
      </Badge>
    );
  };

  const getRoleDescription = (role: string) => {
    const descriptions = {
      user: "Can submit expenses and view their own reports",
      approver: "Can approve/deny expenses + all user permissions", 
      admin: "Full system access + user management"
    };
    return descriptions[role as keyof typeof descriptions] || descriptions.user;
  };

  if (isLoading) {
    return <div>Loading users...</div>;
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h3 className="text-lg font-semibold text-ccw-dark">User Management</h3>
          <p className="text-sm text-gray-600">
            Manage user roles and permissions
          </p>
        </div>
        <AdminCreateUser />
      </div>

      <div className="grid gap-4">
        {users.map((user) => (
          <Card key={user.id} className="border-l-4 border-l-ccw-yellow">
            <CardContent className="p-4">
              <div className="flex items-center justify-between">
                <div className="flex items-center space-x-4">
                  <div className="w-10 h-10 bg-ccw-brown bg-opacity-10 rounded-full flex items-center justify-center">
                    <Users className="w-5 h-5 text-ccw-brown" />
                  </div>
                  <div>
                    <div className="flex items-center gap-2">
                      <h4 className="font-medium text-ccw-dark" data-testid={`user-name-${user.id}`}>
                        {user.firstName} {user.lastName}
                      </h4>
                      {getRoleBadge(user.role)}
                    </div>
                    <p className="text-sm text-gray-600">{user.email}</p>
                    <p className="text-xs text-gray-500 mt-1">
                      {getRoleDescription(user.role)}
                    </p>
                  </div>
                </div>
                
                <div className="flex items-center space-x-2">
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => handleEditUser(user)}
                    className="border-gray-300 text-gray-700 hover:bg-gray-50"
                    data-testid={`button-edit-${user.id}`}
                  >
                    <Edit className="w-4 h-4 mr-1" />
                    Edit
                  </Button>
                  
                  {/* Show impersonation button for manually created users */}
                  {user.id.startsWith('manual_') && (
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => impersonateMutation.mutate(user.id)}
                      disabled={impersonateMutation.isPending}
                      className="border-ccw-yellow text-ccw-yellow hover:bg-ccw-yellow hover:text-ccw-dark"
                      data-testid={`button-impersonate-${user.id}`}
                    >
                      <LogIn className="w-4 h-4 mr-1" />
                      {impersonateMutation.isPending ? "Signing in..." : "Sign In As"}
                    </Button>
                  )}
                  
                  <Select
                    value={user.role}
                    onValueChange={(value) => handleRoleChange(user, value)}
                    data-testid={`select-role-${user.id}`}
                  >
                    <SelectTrigger className="w-40">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value={UserRole.USER}>
                        <div className="flex items-center space-x-2">
                          <User className="w-4 h-4" />
                          <span>Basic User</span>
                        </div>
                      </SelectItem>
                      <SelectItem value={UserRole.APPROVER}>
                        <div className="flex items-center space-x-2">
                          <Shield className="w-4 h-4" />
                          <span>Approver</span>
                        </div>
                      </SelectItem>
                      <SelectItem value={UserRole.ADMIN}>
                        <div className="flex items-center space-x-2">
                          <ShieldCheck className="w-4 h-4" />
                          <span>Administrator</span>
                        </div>
                      </SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

      <AlertDialog open={showConfirmDialog} onOpenChange={setShowConfirmDialog}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Confirm Role Change</AlertDialogTitle>
            <AlertDialogDescription>
              Are you sure you want to change {selectedUser?.firstName} {selectedUser?.lastName}'s role to{" "}
              <strong>
                {newRole === UserRole.USER && "Basic User"}
                {newRole === UserRole.APPROVER && "Approver"}
                {newRole === UserRole.ADMIN && "Administrator"}
              </strong>
              ?
              {newRole === UserRole.ADMIN && " This will give them full system access."}
              {newRole === UserRole.USER && " This will remove their approval and admin permissions."}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={confirmRoleChange}
              disabled={updateRoleMutation.isPending}
              data-testid="button-confirm-role-change"
            >
              {updateRoleMutation.isPending ? "Updating..." : "Confirm"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <Dialog open={showEditDialog} onOpenChange={setShowEditDialog}>
        <DialogContent className="sm:max-w-[425px]">
          <DialogHeader>
            <DialogTitle className="dialog-title-enhanced">Edit User Information</DialogTitle>
            <DialogDescription>
              Update the user's personal information. This will not affect their password or role.
            </DialogDescription>
          </DialogHeader>
          <Form {...editForm}>
            <form onSubmit={editForm.handleSubmit(handleEditSubmit)} className="space-y-4">
              <FormField
                control={editForm.control}
                name="firstName"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel className="form-label-enhanced">First Name</FormLabel>
                    <FormControl>
                      <Input 
                        placeholder="Enter first name" 
                        data-testid="input-edit-firstName"
                        {...field} 
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={editForm.control}
                name="lastName"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel className="form-label-enhanced">Last Name</FormLabel>
                    <FormControl>
                      <Input 
                        placeholder="Enter last name" 
                        data-testid="input-edit-lastName"
                        {...field} 
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={editForm.control}
                name="email"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel className="form-label-enhanced">Email Address</FormLabel>
                    <FormControl>
                      <Input 
                        type="email" 
                        placeholder="Enter email address" 
                        data-testid="input-edit-email"
                        {...field} 
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={editForm.control}
                name="profileImageUrl"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel className="form-label-enhanced">Profile Image URL (Optional)</FormLabel>
                    <FormControl>
                      <Input 
                        type="url" 
                        placeholder="Enter profile image URL" 
                        data-testid="input-edit-profileImageUrl"
                        {...field} 
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <DialogFooter>
                <Button 
                  type="button" 
                  variant="outline" 
                  onClick={() => setShowEditDialog(false)}
                  data-testid="button-cancel-edit"
                >
                  Cancel
                </Button>
                <Button 
                  type="submit" 
                  disabled={editUserMutation.isPending}
                  className="bg-ccw-yellow text-ccw-dark hover:bg-ccw-yellow/90"
                  data-testid="button-save-edit"
                >
                  {editUserMutation.isPending ? "Saving..." : "Save Changes"}
                </Button>
              </DialogFooter>
            </form>
          </Form>
        </DialogContent>
      </Dialog>
    </div>
  );
}