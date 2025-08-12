#!/usr/bin/env node

// ExpenseLocator Health Check Script
// This script provides a simple health check endpoint for monitoring

const http = require('http');
const { execSync } = require('child_process');

const port = process.env.HEALTH_PORT || 3001;

// Health check function
function checkHealth() {
  const checks = {
    timestamp: new Date().toISOString(),
    status: 'healthy',
    checks: {}
  };

  try {
    // Check database connection
    checks.checks.database = checkDatabase();
    
    // Check disk space
    checks.checks.disk = checkDiskSpace();
    
    // Check memory usage
    checks.checks.memory = checkMemoryUsage();
    
    // Check if main application is responding
    checks.checks.application = checkApplication();
    
  } catch (error) {
    checks.status = 'unhealthy';
    checks.error = error.message;
  }

  // Determine overall health
  const unhealthyChecks = Object.values(checks.checks).filter(check => !check.healthy);
  if (unhealthyChecks.length > 0) {
    checks.status = 'unhealthy';
  }

  return checks;
}

function checkDatabase() {
  try {
    // Simple database connectivity check
    const result = execSync('docker-compose exec -T postgres pg_isready -U postgres', { timeout: 5000 });
    return {
      healthy: true,
      message: 'Database is accepting connections'
    };
  } catch (error) {
    return {
      healthy: false,
      message: 'Database connection failed'
    };
  }
}

function checkDiskSpace() {
  try {
    const result = execSync("df -h / | awk 'NR==2 {print $5}' | sed 's/%//'", { encoding: 'utf8' });
    const usage = parseInt(result.trim());
    
    return {
      healthy: usage < 90,
      usage: `${usage}%`,
      message: usage < 90 ? 'Disk space OK' : 'Disk space low'
    };
  } catch (error) {
    return {
      healthy: false,
      message: 'Failed to check disk space'
    };
  }
}

function checkMemoryUsage() {
  try {
    const result = execSync("free | awk 'NR==2{printf \"%.1f\", $3*100/$2}'", { encoding: 'utf8' });
    const usage = parseFloat(result.trim());
    
    return {
      healthy: usage < 90,
      usage: `${usage}%`,
      message: usage < 90 ? 'Memory usage OK' : 'Memory usage high'
    };
  } catch (error) {
    return {
      healthy: false,
      message: 'Failed to check memory usage'
    };
  }
}

function checkApplication() {
  return new Promise((resolve) => {
    const req = http.request({
      hostname: 'localhost',
      port: 5000,
      path: '/api/health',
      timeout: 5000
    }, (res) => {
      resolve({
        healthy: res.statusCode === 200,
        statusCode: res.statusCode,
        message: res.statusCode === 200 ? 'Application responding' : 'Application error'
      });
    });

    req.on('error', () => {
      resolve({
        healthy: false,
        message: 'Application not responding'
      });
    });

    req.on('timeout', () => {
      req.destroy();
      resolve({
        healthy: false,
        message: 'Application timeout'
      });
    });

    req.end();
  });
}

// Create HTTP server
const server = http.createServer(async (req, res) => {
  if (req.url === '/health' && req.method === 'GET') {
    try {
      const health = await checkHealth();
      const statusCode = health.status === 'healthy' ? 200 : 503;
      
      res.writeHead(statusCode, {
        'Content-Type': 'application/json',
        'Cache-Control': 'no-cache'
      });
      res.end(JSON.stringify(health, null, 2));
    } catch (error) {
      res.writeHead(500, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({
        status: 'error',
        message: error.message,
        timestamp: new Date().toISOString()
      }));
    }
  } else {
    res.writeHead(404, { 'Content-Type': 'text/plain' });
    res.end('Not Found');
  }
});

server.listen(port, () => {
  console.log(`Health check server running on port ${port}`);
});

// Graceful shutdown
process.on('SIGTERM', () => {
  console.log('Received SIGTERM, shutting down gracefully');
  server.close(() => {
    process.exit(0);
  });
});

process.on('SIGINT', () => {
  console.log('Received SIGINT, shutting down gracefully');
  server.close(() => {
    process.exit(0);
  });
});