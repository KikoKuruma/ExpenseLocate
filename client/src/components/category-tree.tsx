import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { 
  ChevronRight, 
  ChevronDown, 
  Edit, 
  Trash2, 
  Plus,
  Folder,
  FolderOpen
} from "lucide-react";
import { useAuth } from "@/hooks/useAuth";
import type { CategoryWithSubcategories } from "@shared/schema";

interface CategoryTreeProps {
  categories: CategoryWithSubcategories[];
  onEdit: (category: CategoryWithSubcategories) => void;
  onDelete: (categoryId: string) => void;
  onAddSubcategory: (parentId: string) => void;
}

interface CategoryNodeProps {
  category: CategoryWithSubcategories;
  onEdit: (category: CategoryWithSubcategories) => void;
  onDelete: (categoryId: string) => void;
  onAddSubcategory: (parentId: string) => void;
  level?: number;
}

function CategoryNode({ category, onEdit, onDelete, onAddSubcategory, level = 0 }: CategoryNodeProps) {
  const [isExpanded, setIsExpanded] = useState(true);
  const { user } = useAuth();
  const hasSubcategories = category.subcategories && category.subcategories.length > 0;
  const isAdmin = user?.role === 'admin';
  
  const indentClass = level > 0 ? `ml-${level * 6}` : "";
  
  return (
    <div className="space-y-1">
      <div className={`flex items-center justify-between p-3 border border-gray-200 rounded-lg hover:bg-gray-50 transition-colors ${indentClass}`}>
        <div className="flex items-center space-x-3">
          <div className="flex items-center space-x-1">
            {hasSubcategories ? (
              <Button
                variant="ghost"
                size="sm"
                className="w-6 h-6 p-0"
                onClick={() => setIsExpanded(!isExpanded)}
              >
                {isExpanded ? (
                  <ChevronDown className="w-4 h-4" />
                ) : (
                  <ChevronRight className="w-4 h-4" />
                )}
              </Button>
            ) : (
              <div className="w-6 h-6" />
            )}
            
            <div 
              className="w-8 h-8 rounded-lg flex items-center justify-center"
              style={{ 
                backgroundColor: category.color ? `${category.color}20` : '#6B7280',
                border: `2px solid ${category.color || '#6B7280'}`
              }}
            >
              {hasSubcategories && isExpanded ? (
                <FolderOpen 
                  className="w-4 h-4" 
                  style={{ color: category.color || '#6B7280' }}
                />
              ) : (
                <Folder 
                  className="w-4 h-4" 
                  style={{ color: category.color || '#6B7280' }}
                />
              )}
            </div>
          </div>
          
          <div>
            <div className="flex items-center gap-2">
              <h4 className="font-medium text-ccw-dark" data-testid={`category-name-${category.id}`}>
                {category.name}
              </h4>
              {level > 0 && (
                <Badge variant="outline" className="text-xs">
                  Subcategory
                </Badge>
              )}
              {hasSubcategories && (
                <Badge className="bg-ccw-yellow bg-opacity-20 text-ccw-dark text-xs">
                  {category.subcategories.length} subcategories
                </Badge>
              )}
            </div>
            {category.description && (
              <p className="text-sm text-gray-500 mt-1">
                {category.description}
              </p>
            )}
          </div>
        </div>
        
        <div className="flex items-center space-x-2">
          {isAdmin && (
            <Button
              size="sm"
              variant="outline"
              onClick={() => onAddSubcategory(category.id)}
              className="text-ccw-brown border-ccw-brown hover:bg-ccw-brown hover:text-white"
              data-testid={`button-add-subcategory-${category.id}`}
            >
              <Plus className="w-4 h-4 mr-1" />
              Add Sub
            </Button>
          )}
          
          {isAdmin && (
            <>
              <Button
                size="sm"
                variant="outline"
                onClick={() => onEdit(category)}
                data-testid={`button-edit-category-${category.id}`}
              >
                <Edit className="w-4 h-4" />
              </Button>
              
              <Button
                size="sm"
                variant="outline"
                onClick={() => onDelete(category.id)}
                className="text-red-600 border-red-600 hover:bg-red-50"
                data-testid={`button-delete-category-${category.id}`}
              >
                <Trash2 className="w-4 h-4" />
              </Button>
            </>
          )}
        </div>
      </div>
      
      {hasSubcategories && isExpanded && (
        <div className="space-y-1">
          {category.subcategories.map((subcategory) => (
            <CategoryNode
              key={subcategory.id}
              category={subcategory}
              onEdit={onEdit}
              onDelete={onDelete}
              onAddSubcategory={onAddSubcategory}
              level={level + 1}
            />
          ))}
        </div>
      )}
    </div>
  );
}

export default function CategoryTree({ categories, onEdit, onDelete, onAddSubcategory }: CategoryTreeProps) {
  return (
    <div className="space-y-2">
      {categories.map((category) => (
        <CategoryNode
          key={category.id}
          category={category}
          onEdit={onEdit}
          onDelete={onDelete}
          onAddSubcategory={onAddSubcategory}
        />
      ))}
    </div>
  );
}