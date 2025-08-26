# API Reference

Comprehensive API documentation for lever-ui-logger - a modern logging library with optional EventBus integration.

## Table of Contents

- [Quick Start](#quick-start)
- [Core API](#core-api)
- [Logger Interface](#logger-interface)
- [Transport System](#transport-system)
- [EventBus Integration](#eventbus-integration)
- [Configuration Types](#configuration-types)
- [Advanced Usage](#advanced-usage)

## Quick Start

### Basic Usage

The logger works without any external dependencies:

```typescript
import { createLogger, ConsoleTransport } from 'lever-ui-logger';

// Create a logger
const logger = createLogger({
  level: 'info',
  component: 'my-app',
  defaultContext: { version: '1.0.0' },
  transports: [
    new ConsoleTransport({ colors: true })
  ]
});

// Start logging immediately
logger.info('Application started', { port: 3000 });
logger.warn('Configuration warning', { missingKey: 'API_URL' });
logger.error('Database connection failed', { retries: 3 });
```

### With Multiple Transports

```typescript
import { 
  createLogger, 
  ConsoleTransport, 
  SendBeaconTransport 
} from 'lever-ui-logger';

const logger = createLogger({
  level: 'debug',
  component: 'user-service',
  transports: [
    // Console for development
    new ConsoleTransport({ 
      colors: true,
      format: 'pretty' 
    }),
    // SendBeacon for production telemetry
    new SendBeaconTransport({
      endpoint: 'https://logs.example.com/collect',
      batchSize: 50,
      flushInterval: 5000
    })
  ],
  redaction: { 
    enabled: true,
    mode: 'balanced' 
  }
});

// All logs go to both transports
logger.info('User authenticated', { 
  userId: '12345',
  method: 'oauth' 
});
```

## Core API

### `createLogger(config?)`

Creates a new logger instance.

**Parameters:**
- `config?: LoggerConfig` - Optional logger configuration

**Returns:** `Logger` - New logger instance

**Example:**
```typescript
import { createLogger } from 'lever-ui-logger';

// Minimal logger
const logger = createLogger();

// Configured logger
const configuredLogger = createLogger({
  level: 'warn',
  component: 'api-service',
  defaultContext: { 
    service: 'user-api',
    version: '2.1.0' 
  }
});
```
## Logger Interface

### Core Logging Methods

#### `trace(message, ...args)`
Logs detailed debugging information.

```typescript
logger.trace('Function entry', { 
  function: 'processUserData', 
  args: { userId: '123' } 
});
```

#### `debug(message, ...args)`
Logs development debugging information.

```typescript
logger.debug('Processing request', { 
  requestId: 'req-456',
  endpoint: '/api/users' 
});
```

#### `info(message, ...args)`
Logs general application information.

```typescript
logger.info('User action completed', { 
  userId: '123',
  action: 'profile_update',
  duration: 245 
});
```

#### `warn(message, ...args)`
Logs warnings about potential issues.

```typescript
logger.warn('Rate limit approaching', { 
  currentRequests: 95,
  limit: 100,
  timeWindow: '1m' 
});
```

#### `error(message, ...args)`
Logs application errors.

```typescript
logger.error('Operation failed', { 
  operation: 'user_creation',
  error: error.message,
  stack: error.stack 
});
```

### Context and Metrics

#### `metric(name, fields)`
Records structured metrics.

```typescript
// Performance metrics
logger.metric('api_response_time', {
  endpoint: '/users',
  method: 'GET',
  duration: 125,
  status: 200
});

// Business metrics
logger.metric('user_conversion', {
  source: 'landing_page',
  campaign: 'summer_2024',
  converted: true,
  value: 99.99
});
```

#### `withContext(additionalContext)`
Creates a child logger with additional context.

```typescript
const baseLogger = createLogger({
  defaultContext: { service: 'api', version: '1.0' }
});

// User-specific context
const userLogger = baseLogger.withContext({
  userId: '123',
  sessionId: 'sess-abc'
});

// Request-specific context
const requestLogger = userLogger.withContext({
  requestId: 'req-456',
  traceId: 'trace-789'
});

requestLogger.info('Request processed');
// Context: { service: 'api', version: '1.0', userId: '123', sessionId: 'sess-abc', requestId: 'req-456', traceId: 'trace-789' }
```

### Configuration Management

#### `setLevel(level)`
Changes the minimum log level.

```typescript
logger.setLevel('debug'); // Enable debug logging
logger.setLevel('error'); // Only errors and above
```

#### `setComponentLevel(component, level)`
Sets level for specific components.

```typescript
logger.setComponentLevel('database', 'warn');
logger.setComponentLevel('auth', 'trace');
```

### Transport Management

#### `addTransport(transport)`
Adds a new transport to the logger.

```typescript
import { SendBeaconTransport } from 'lever-ui-logger';

const transport = new SendBeaconTransport({
  endpoint: 'https://logs.example.com/collect'
});

logger.addTransport(transport);
```

#### `removeTransport(transportName)`
Removes a transport by name.

```typescript
logger.removeTransport('console');
logger.removeTransport('sendbeacon');
```

### Lifecycle Management

#### `flush()`
Ensures all pending logs are written.

```typescript
// Before page unload
window.addEventListener('beforeunload', async () => {
  await logger.flush();
});
```

#### `destroy()`
Cleans up all resources.

```typescript
// Application shutdown
await logger.destroy();
```

## Transport System

### ConsoleTransport

Rich console output with formatting and colors.

```typescript
import { ConsoleTransport } from 'lever-ui-logger';

const consoleTransport = new ConsoleTransport({
  name: 'console',
  format: 'pretty',              // 'pretty' | 'compact' | 'json'
  colors: true,                  // Enable colors
  timestamps: true,              // Show timestamps
  timestampFormat: 'HH:mm:ss.SSS', // Custom timestamp format
  enableInProduction: false,     // Disable in production
  performanceThreshold: 1.0,     // Warn if logging is slow
  consoleMethods: {              // Custom console methods
    error: 'error',
    warn: 'warn', 
    info: 'log',
    debug: 'debug',
    trace: 'trace'
  }
});
```

### SendBeaconTransport

Reliable telemetry delivery with batching and offline support.

```typescript
import { SendBeaconTransport } from 'lever-ui-logger';

const beaconTransport = new SendBeaconTransport({
  name: 'analytics',
  endpoint: 'https://logs.example.com/collect',
  batchSize: 50,                 // Batch size
  flushInterval: 5000,           // Auto-flush interval (ms)
  maxPayloadSize: 60000,         // Max payload size (bytes)
  enableOfflineStorage: true,    // Store logs offline
  authToken: async () => {       // Dynamic auth token
    return await getAuthToken();
  },
  enableRetries: true,           // Retry failed requests
  maxRetries: 3,
  retryDelayMs: 1000,
  headers: {                     // Custom headers
    'X-API-Key': 'your-api-key'
  }
});
```

### Custom Transports

Create custom transports by implementing the Transport interface.

```typescript
interface Transport {
  name: string;
  write(event: LogEventData): void | Promise<void>;
  flush?(): Promise<void>;
  close?(): Promise<void>;
}

class DatabaseTransport implements Transport {
  name = 'database';

  constructor(private connection: DatabaseConnection) {}

  async write(event: LogEventData): Promise<void> {
    await this.connection.insert('logs', {
      level: event.level,
      message: event.message,
      context: JSON.stringify(event.context),
      timestamp: new Date(event.timestamp)
    });
  }

  async flush(): Promise<void> {
    await this.connection.commit();
  }

  async close(): Promise<void> {
    await this.connection.close();
  }
}

// Use the custom transport
logger.addTransport(new DatabaseTransport(dbConnection));
```

## EventBus Integration

### Optional EventBus Integration

If you want to integrate with lever-ui-eventbus, use the EventBusTransport:

```typescript
import { EventBus } from 'lever-ui-eventbus';
import { createLogger, EventBusTransport } from 'lever-ui-logger';

// Create EventBus instance
const eventBus = new EventBus();

// Create standalone logger
const logger = createLogger({
  component: 'my-service',
  transports: [
    new ConsoleTransport(),
    // Add EventBus integration via transport
    new EventBusTransport(eventBus, {
      enableSelfLogging: false,
      filterComponents: ['eventbus-transport'],
      eventMetadata: { source: 'logger' }
    })
  ]
});

// Subscribe to log events from other components
eventBus.subscribe(LogEvent, (event) => {
  console.log(`[${event.level}] ${event.component}: ${event.message}`);
});

// Subscribe to metrics
eventBus.subscribe(MetricEvent, (event) => {
  sendToAnalytics(event.name, event.fields);
});
```

## Configuration Types

### LoggerConfig

Complete configuration options for logger instances.

```typescript
interface LoggerConfig {
  // Basic configuration
  level?: LogLevel;                          // 'trace' | 'debug' | 'info' | 'warn' | 'error'
  component?: string;                        // Component/service identifier
  defaultContext?: Record<string, unknown>;  // Default context for all logs
  
  // Sampling configuration
  sampling?: Partial<Record<LogLevel, number>>; // Sampling rates (0-1) per level
  
  // PII redaction
  redaction?: {
    enabled?: boolean;                       // Enable/disable redaction
    mode?: 'strict' | 'balanced' | 'permissive' | 'off'; // Redaction mode
    customPatterns?: RedactionPattern[];     // Custom redaction patterns
    customFieldNames?: string[];             // Additional PII field names
    hashMode?: boolean;                      // Use hash instead of '<redacted>'
    enablePerformanceWarnings?: boolean;     // Warn on slow redaction
  };
  
  // Transport configuration
  transports?: Transport[];                  // Log output destinations
}
```

## Advanced Usage

### Performance Optimization

#### Sampling Configuration
```typescript
const logger = createLogger({
  level: 'debug',
  sampling: {
    trace: 0.1,    // Only 10% of trace logs
    debug: 0.5,    // 50% of debug logs  
    info: 1.0,     // All info logs
    warn: 1.0,     // All warnings
    error: 1.0     // All errors
  }
});
```

#### Conditional Logging
```typescript
// Expensive operation only runs if debug level is enabled
if (logger.shouldLog('debug')) {
  logger.debug('Expensive debug info', expensiveOperation());
}
```

### Custom Redaction Patterns

```typescript
import { createLogger } from 'lever-ui-logger';

const logger = createLogger({
  redaction: {
    enabled: true,
    mode: 'strict',
    customPatterns: [
      {
        name: 'api-key',
        pattern: /apikey-[a-zA-Z0-9]{32}/g,
        replacement: '<api-key-redacted>',
        description: 'Custom API key pattern'
      }
    ],
    customFieldNames: ['internalId', 'sessionToken']
  }
});
```

### Environment-Specific Configuration

```typescript
const isDevelopment = process.env.NODE_ENV === 'development';
const isProduction = process.env.NODE_ENV === 'production';

const logger = createLogger({
  level: isDevelopment ? 'debug' : 'warn',
  transports: [
    // Always include console in development
    ...(isDevelopment ? [new ConsoleTransport({ colors: true })] : []),
    
    // Only telemetry in production
    ...(isProduction ? [
      new SendBeaconTransport({
        endpoint: process.env.TELEMETRY_ENDPOINT!,
        batchSize: 100
      })
    ] : [])
  ],
  redaction: {
    enabled: true,
    mode: isProduction ? 'strict' : 'balanced'
  }
});
```

### Multi-Service Architecture

```typescript
// Base logger factory for consistent configuration
function createServiceLogger(serviceName: string) {
  return createLogger({
    component: serviceName,
    defaultContext: {
      service: serviceName,
      version: process.env.SERVICE_VERSION,
      environment: process.env.NODE_ENV
    },
    transports: [
      new ConsoleTransport({ 
        format: 'json',
        enableInProduction: false 
      }),
      new SendBeaconTransport({
        endpoint: process.env.LOGS_ENDPOINT!,
        batchSize: 50
      })
    ]
  });
}

// Service-specific loggers
const userServiceLogger = createServiceLogger('user-service');
const authServiceLogger = createServiceLogger('auth-service');
const paymentServiceLogger = createServiceLogger('payment-service');

// Different log levels per service
userServiceLogger.setLevel('info');
authServiceLogger.setLevel('debug'); // More verbose for security
paymentServiceLogger.setLevel('warn'); // Less verbose for PCI compliance
```

This comprehensive API reference covers the complete standalone logger system with optional EventBus integration. The logger is designed to work independently while providing seamless integration options when needed.