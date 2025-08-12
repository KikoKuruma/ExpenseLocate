-- ExpenseLocator Database Initialization Script
-- This script sets up the initial database configuration

-- Create extensions if needed
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- Set timezone
SET timezone = 'UTC';

-- Create a simple health check function
CREATE OR REPLACE FUNCTION health_check()
RETURNS TEXT AS $$
BEGIN
    RETURN 'Database is healthy at ' || NOW();
END;
$$ LANGUAGE plpgsql;

-- Grant necessary permissions
GRANT ALL PRIVILEGES ON DATABASE expenselocator TO postgres;

-- Log successful initialization
DO $$
BEGIN
    RAISE NOTICE 'ExpenseLocator database initialized successfully at %', NOW();
END $$;