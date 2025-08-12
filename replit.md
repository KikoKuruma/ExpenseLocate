# Overview

ExpenseLocator is a production-ready, full-stack expense tracking application for business expense management. It features a three-tier permission system (Basic User, Approver, Administrator) and integrates Google OAuth for authentication. Users can submit expense reports with receipt uploads, approvers manage approvals, and administrators handle user management and category configuration. The application provides a complete expense reporting solution with a professional utility industry theme and comprehensive error handling. 

## Key Capabilities
- **Entry Management System**: Complete expense lifecycle management with view, edit, and delete functionality
- **Comprehensive Reporting**: Excel export functionality with proper formatting
- **Advanced Dashboard**: Visual analytics with filtering by day/month/quarter views  
- **Category Management**: Color customization and hierarchical organization
- **Expense Management**: Full CRUD operations with real-time updates and validation
- **Database Administration**: Import/export functionality with auto-category creation, secure data purging
- **Enhanced User Experience**: Error boundaries, mobile-responsive design, comprehensive validation
- **Deployment Ready**: Production-grade error handling, input validation, and security measures
- **Docker Containerization**: Complete containerization setup with Google Cloud VM deployment scripts

# User Preferences

Preferred communication style: Simple, everyday language.
App Name: ExpenseLocator - redirect landing page directly to login without marketing content.

# System Architecture

## Frontend Architecture
- **Framework**: React 18 with TypeScript and Vite.
- **UI Library**: Shadcn/ui components built on Radix UI primitives with Tailwind CSS.
- **Routing**: Wouter for client-side routing with protected routes.
- **State Management**: TanStack React Query for server state management and caching.
- **Form Handling**: React Hook Form with Zod validation.
- **File Structure**: Feature-based organization.
- **UI/UX Decisions**: Professional utility industry theming, CCW brand color scheme, enhanced form visual design with accent highlighting and improved readability, interactive charts for expense breakdowns and monthly trends, personalized dashboard experiences based on user roles, consistent date displays, streamlined dialog interactions, and mobile-responsive navigation with hamburger menu for sidebar access on small screens.

## Backend Architecture
- **Runtime**: Node.js with Express.js.
- **Language**: TypeScript with ES modules.
- **Database ORM**: Drizzle ORM.
- **Authentication**: Replit's OpenID Connect integration with Passport.js for session management.
- **File Uploads**: Multer for handling receipt attachments.
- **Session Storage**: PostgreSQL-backed session storage.

## Database Design
- **Primary Database**: PostgreSQL with connection pooling via Neon serverless.
- **Schema Management**: Drizzle Kit for migrations.
- **Core Tables**: Users (with enum-based roles), Categories (hierarchical), Expenses (with amount, description, status, attachments), and Sessions.
- **Database Management**: Administrator-only import/export functionality with Excel support, comprehensive database statistics tracking, secure purge operations that preserve user accounts and categories while removing expense records, downloadable import templates with reference data, and robust field validation with detailed error reporting.

## Authentication & Authorization
- **Provider**: Replit OIDC integration for Google-based authentication.
- **Session Management**: Server-side sessions with PostgreSQL storage.
- **Three-Tier Role System**: Basic Users (submit/view own expenses), Approvers (all user permissions + approve/deny any expenses), Administrators (full system access including user role management).
- **Permission Middleware**: Role-based access controls with hierarchical permission checking.
- **Security**: HTTPS-only cookies with CSRF protection and role validation.

## File Upload System
- **Storage**: Local filesystem.
- **Allowed Types**: Images (JPEG, PNG) and PDF documents.
- **Processing**: Multer middleware with file type and size validation.

## Development Workflow
- **Build System**: Vite for frontend bundling, esbuild for server compilation.
- **Development**: Hot reload for client and server code.
- **Type Safety**: Full TypeScript coverage with shared types.
- **Code Organization**: Monorepo structure with shared schema definitions.

# External Dependencies

## Database Services
- **Neon Database**: Serverless PostgreSQL hosting.
- **Drizzle ORM**: Type-safe database client.

## Authentication Services
- **Replit Auth**: OpenID Connect integration.
- **Google OAuth**: Identity provider via Replit's auth system.

## UI Component Libraries
- **Radix UI**: Headless component primitives.
- **Tailwind CSS**: Utility-first CSS framework.
- **Lucide Icons**: Iconography.
- **Recharts**: Data visualization library.

## Development Tools
- **Replit Platform**: Integrated development environment.
- **Vite Plugins**: Development experience enhancements.
- **TanStack React Query**: Server state synchronization and caching.

## File Processing
- **Multer**: Node.js middleware for file uploads.
- **XLSX library**: Used for Excel export functionality.

## Deployment & Infrastructure
- **Docker**: Container runtime and multi-stage builds.
- **Docker Compose**: Container orchestration with PostgreSQL, nginx, and app services.
- **Google Cloud Platform**: VM hosting with automated deployment scripts.
- **Nginx**: Reverse proxy with SSL/TLS termination and rate limiting.
- **Let's Encrypt**: Automated SSL certificate management.
- **Systemd**: Service management and auto-startup configuration.