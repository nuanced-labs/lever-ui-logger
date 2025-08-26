# lever-ui-logger

[![npm version](https://badge.fury.io/js/@nuanced-labs%2Flever-ui-logger.svg)](https://badge.fury.io/js/@nuanced-labs%2Flever-ui-logger)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)
[![TypeScript](https://img.shields.io/badge/TypeScript-Ready-blue.svg)](https://www.typescriptlang.org/)

Zero-dependency logging library with optional EventBus integration. Designed for TypeScript-first development with built-in PII redaction and focused core transport system. Advanced features like WebSocket streaming, IndexedDB persistence, and worker processing are handled by external services that integrate via EventBus.

## Key Benefits

- **Zero Dependencies** - No external dependencies required
- **Privacy First** - Built-in PII redaction with customizable patterns
- **Tree Shakable** - Import only what you need for optimal bundle sizes
- **High Performance** - Optimized for speed with sampling and async processing
- **TypeScript Native** - Full type safety and IntelliSense support

## Features

### Logger System
- **Structured Logging** - Type-safe logging with context and metadata  
- **Multiple Transports** - Console, SendBeacon, and custom transports
- **PII Redaction** - Automatic data protection and sanitization
- **Performance Optimized** - Sampling, buffering, and async processing

### Transport System
- **ConsoleTransport** - Rich console output with colors and formatting
- **SendBeaconTransport** - Reliable telemetry delivery with offline support
- **EventBusTransport** - Optional cross-library event coordination
- **Custom Transports** - Extensible transport interface for any destination

## Installation

```bash
# Core logger
npm install lever-ui-logger

# Standalone (zero dependencies)
npm install lever-ui-logger

# With optional EventBus integration (install EventBus separately)
npm install lever-ui-logger lever-ui-eventbus
```

## Quick Start

### Basic Usage

Get started immediately:

```typescript
import { createLogger, ConsoleTransport } from 'lever-ui-logger';

// Create a logger
const logger = createLogger({
  level: 'info',
  component: 'my-app',
  transports: [
    new ConsoleTransport({ colors: true })
  ]
});

// Start logging immediately
logger.info('Application started', { version: '1.0.0', port: 3000 });
logger.warn('Configuration warning', { missingKey: 'API_URL' });
logger.error('Database connection failed', { retries: 3 });
```

### With Production Telemetry

Add reliable telemetry delivery for production environments:

```typescript
import { 
  createLogger, 
  ConsoleTransport, 
  SendBeaconTransport 
} from 'lever-ui-logger';

const logger = createLogger({
  level: 'info',
  component: 'user-service',
  transports: [
    // Console for development
    new ConsoleTransport({ 
      colors: true,
      enableInProduction: false 
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

// All logs go to both transports (when appropriate)
logger.info('User authenticated', { 
  userId: '12345',
  method: 'oauth' 
});
```

### Metrics Collection

Record structured metrics for analytics:

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

## Advanced Features

### PII Protection

Automatic PII redaction keeps sensitive data secure:

```typescript
const logger = createLogger({
  redaction: {
    enabled: true,
    mode: 'strict', // 'strict', 'balanced', 'permissive', 'off'
    customPatterns: [
      { 
        name: 'api_key', 
        pattern: /apikey-[a-zA-Z0-9]{32}/g,
        replacement: '<api-key-redacted>'
      }
    ]
  }
});

// Automatic PII redaction
logger.info('User registered', { 
  email: 'user@example.com',      // → 'email': '<redacted>'
  phone: '+1-555-123-4567',       // → 'phone': '<redacted>'
  apiKey: 'apikey-abc123def456'   // → 'apiKey': '<api-key-redacted>'
});
```

### Contextual Logging

Create child loggers with inherited context:

```typescript
// Base logger with service context
const baseLogger = createLogger({
  defaultContext: { service: 'api', version: '1.0' }
});

// User-specific context
const userLogger = baseLogger.withContext({ 
  userId: '123', 
  sessionId: 'abc-def-ghi' 
});

// Request-specific context
const requestLogger = userLogger.withContext({
  requestId: 'req-456',
  traceId: 'trace-789'
});

requestLogger.info('Request processed');
// Context: { service: 'api', version: '1.0', userId: '123', sessionId: 'abc-def-ghi', requestId: 'req-456', traceId: 'trace-789' }
```

### Custom Transports

Extend the logger with custom destinations:

```typescript
class DatabaseTransport {
  name = 'database';
  
  constructor(private connection) {}

  async write(event) {
    await this.connection.insert('logs', {
      level: event.level,
      message: event.message,
      context: JSON.stringify(event.context),
      timestamp: new Date(event.timestamp)
    });
  }

  async flush() {
    await this.connection.commit();
  }
}

logger.addTransport(new DatabaseTransport(dbConnection));
```

## EventBus Integration (Optional)

If you need cross-library coordination, add EventBus integration via transport:

```typescript
import { EventBus } from 'lever-ui-eventbus';
import { 
  createLogger, 
  EventBusTransport,
  LogEvent,
  MetricEvent 
} from 'lever-ui-logger';

// Create EventBus instance
const eventBus = new EventBus();

// Create standalone logger with EventBus transport
const logger = createLogger({
  component: 'my-service',
  transports: [
    new ConsoleTransport(),
    // Add EventBus integration via transport
    new EventBusTransport(eventBus, {
      enableSelfLogging: false,
      eventMetadata: { source: 'logger' }
    })
  ]
});

// Subscribe to log events from other systems
eventBus.subscribe(LogEvent, (event) => {
  console.log(`[${event.level}] ${event.component}: ${event.message}`);
});

eventBus.subscribe(MetricEvent, (event) => {
  sendToAnalytics(event.name, event.fields);
});
```

## Configuration

### Logger Configuration

```typescript
const logger = createLogger({
  // Basic settings
  level: 'info',                    // Minimum log level
  component: 'user-service',        // Component/service name
  
  // Default context for all logs
  defaultContext: { 
    service: 'api',
    version: '1.0.0',
    environment: 'production'
  },
  
  // Sampling rates (0-1) per level
  sampling: {
    trace: 0.1,   // Sample 10% of trace logs
    debug: 0.5,   // Sample 50% of debug logs
    info: 1.0,    // Log all info messages
    warn: 1.0,    // Log all warnings
    error: 1.0    // Log all errors
  },
  
  // PII redaction
  redaction: {
    enabled: true,
    mode: 'balanced',
    customPatterns: [],
    customFieldNames: ['internalId', 'sessionToken']
  },
  
  // Transports
  transports: [/* transport instances */]
});
```

### Transport Configuration

```typescript
// Console Transport
const consoleTransport = new ConsoleTransport({
  format: 'pretty',             // 'pretty', 'compact', 'json'
  colors: true,                 // Enable colors
  timestamps: true,             // Show timestamps
  timestampFormat: 'HH:mm:ss.SSS',
  enableInProduction: false,    // Disable in production
  performanceThreshold: 1.0     // Warn if logging is slow
});

// SendBeacon Transport  
const beaconTransport = new SendBeaconTransport({
  endpoint: 'https://logs.example.com/collect',
  batchSize: 100,
  flushInterval: 10000,
  maxPayloadSize: 60000,        // ~60KB (under 64KB limit)
  enableOfflineStorage: true,
  authToken: () => getAuthToken(), // Dynamic auth
  enableRetries: true,
  maxRetries: 3
});
```

## Tree-Shakable Imports

Import only what you need:

```typescript
// Minimal logger setup
import { createLogger } from 'lever-ui-logger/logger';
import { ConsoleTransport } from 'lever-ui-logger/transports/console';

// Specific transports
import { SendBeaconTransport } from 'lever-ui-logger/transports/sendbeacon';

// Everything (larger bundle)
import { 
  createLogger, 
  ConsoleTransport,
  SendBeaconTransport
} from 'lever-ui-logger';
```

## Browser Compatibility

- **Modern Browsers**: Chrome 90+, Firefox 88+, Safari 14+, Edge 90+
- **sendBeacon API**: Supported in all modern browsers with fetch fallback
- **Source Maps**: Requires browser developer tools or source map support
- **TypeScript**: Full type safety and IntelliSense support

## Examples

See the `/examples` directory for complete working examples:

- **[Basic Logging](./examples/basic-logging.html)** - Interactive browser-based usage
- **[Multiple Transports](./examples/multiple-transports.js)** - Console + SendBeacon setup
- **[Error Handling](./examples/error-handling.js)** - Complete error handling system
- **[Custom Transport](./examples/custom-transport.js)** - Creating custom transport implementations

All examples demonstrate the logger with optional EventBus integration where relevant.

## API Reference

### Core Functions

- **`createLogger(config?)`** - Create logger instance

### Logger Methods

- **`trace(message, ...args)`** - Trace-level logging
- **`debug(message, ...args)`** - Debug-level logging  
- **`info(message, ...args)`** - Info-level logging
- **`warn(message, ...args)`** - Warning-level logging
- **`error(message, ...args)`** - Error-level logging
- **`metric(name, fields)`** - Record structured metric
- **`withContext(context)`** - Create child logger with additional context
- **`setLevel(level)`** - Change minimum log level
- **`addTransport(transport)`** - Add transport to logger
- **`flush()`** - Flush all transports
- **`destroy()`** - Clean up resources

### Transport Classes

- **`ConsoleTransport(config?)`** - Console output transport
- **`SendBeaconTransport(config?)`** - SendBeacon transport for telemetry
- **`EventBusTransport(eventBus, config?)`** - Optional EventBus integration transport

For complete API documentation, see [docs/api.md](./docs/api.md).

## Development

```bash
# Install dependencies
npm install

# Run tests  
npm test

# Build package
npm run build

# Type checking
npm run typecheck

# Linting
npm run lint
```

## License

MIT © [Nuanced Labs](https://github.com/nuanced-labs)
