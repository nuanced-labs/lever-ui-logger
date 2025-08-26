# Troubleshooting Guide

This guide helps resolve common issues when using lever-ui-logger in your applications.

## Table of Contents

- [Installation Issues](#installation-issues)
- [Configuration Problems](#configuration-problems)
- [Transport Issues](#transport-issues)
- [Performance Issues](#performance-issues)
- [EventBus Integration Issues](#eventbus-integration-issues)
- [PII Redaction Issues](#pii-redaction-issues)
- [Build and Import Problems](#build-and-import-problems)
- [Common Error Messages](#common-error-messages)
- [Debugging Tips](#debugging-tips)

## Installation Issues

### Cannot find module 'lever-ui-logger'

**Symptoms:**
```bash
Error: Cannot find module 'lever-ui-logger'
Module not found: Can't resolve 'lever-ui-logger'
```

**Solutions:**
1. **Install the package and its peer dependency:**
   ```bash
   npm install lever-ui-logger lever-ui-eventbus
   ```

2. **Check package.json dependencies:**
   ```json
   {
     "dependencies": {
       "lever-ui-logger": "^0.1.0",
       "lever-ui-eventbus": "^1.0.0"
     }
   }
   ```

3. **Clear npm cache and reinstall:**
   ```bash
   npm cache clean --force
   rm -rf node_modules package-lock.json
   npm install
   ```


## Configuration Problems

### Logger not outputting any logs

**Symptoms:**
- No console output
- No logs in transports
- Silent failures

**Diagnostic steps:**
```javascript
// Check logger configuration
console.log('Logger level:', logger.level);
console.log('Transports:', logger.transports?.length);

// Test with explicit level
logger.setLevel('debug');
logger.debug('Test debug message');
logger.info('Test info message');
```

**Common causes and solutions:**

1. **Log level too high:**
   ```javascript
   // Problem: level set too high
   const logger = createLogger({ level: 'error' });
   logger.info('This will not appear'); // info < error
   
   // Solution: lower the level
   const logger = createLogger({ level: 'info' });
   logger.info('This will appear');
   ```

2. **No transports configured:**
   ```javascript
   // Problem: no transports
   const logger = createLogger({}); // No transports
   
   // Solution: add at least one transport
   const logger = createLogger({
     transports: [new ConsoleTransport()]
   });
   ```

3. **Transport disabled in production:**
   ```javascript
   // Problem: console disabled in production
   new ConsoleTransport({ enableInProduction: false })
   
   // Solution: enable for production or use different transport
   new ConsoleTransport({ enableInProduction: true })
   ```

### Context not appearing in logs

**Symptoms:**
- Context objects are empty or missing
- `withContext()` not working

**Solutions:**
```javascript
// Check context is being passed
const contextLogger = logger.withContext({ userId: '123' });
contextLogger.info('Test with context'); // Should include userId

// Verify context structure
logger.info('Test message', { explicit: 'context' });

// Check default context
const logger = createLogger({
  defaultContext: { service: 'api' }
});
```

## Transport Issues

### ConsoleTransport not showing colors

**Symptoms:**
- Plain text output without colors
- ANSI codes visible in output

**Solutions:**
1. **Check environment support:**
   ```javascript
   console.log('Supports colors:', process.stdout.isTTY);
   console.log('Environment:', Environment.supportsConsoleStyles);
   ```

2. **Enable colors explicitly:**
   ```javascript
   new ConsoleTransport({
     colors: true,
     format: 'pretty'  // Required for colors
   })
   ```

3. **Browser vs Node.js differences:**
   ```javascript
   // Browser: uses CSS styles
   console.log('Browser:', Environment.isBrowser);
   
   // Node.js: uses ANSI codes
   console.log('Node.js:', Environment.isNode);
   ```

### SendBeaconTransport failing to send

**Symptoms:**
- Network errors in console
- Logs not reaching server
- 413 Payload Too Large errors

**Diagnostic steps:**
```javascript
// Check sendBeacon support
console.log('SendBeacon supported:', 'sendBeacon' in navigator);

// Monitor network requests
// Open browser DevTools > Network tab
// Look for POST requests to your endpoint

// Check payload size
const transport = new SendBeaconTransport({
  endpoint: 'https://your-endpoint.com/logs',
  maxPayloadSize: 60000, // ~60KB (browser limit is 64KB)
  batchSize: 50 // Smaller batches
});
```

**Common solutions:**

1. **Reduce payload size:**
   ```javascript
   new SendBeaconTransport({
     maxPayloadSize: 50000, // Smaller limit
     batchSize: 20,         // Fewer logs per batch
     flushInterval: 10000   // More frequent flushes
   })
   ```

2. **Check CORS configuration:**
   ```javascript
   // Server must allow your origin
   Access-Control-Allow-Origin: *
   Access-Control-Allow-Methods: POST
   Access-Control-Allow-Headers: Content-Type
   ```

3. **Verify endpoint is reachable:**
   ```bash
   curl -X POST https://your-endpoint.com/logs \
     -H "Content-Type: application/json" \
     -d '{"test": true}'
   ```

4. **Handle authentication errors:**
   ```javascript
   new SendBeaconTransport({
     authToken: async () => {
       try {
         return await getAuthToken();
       } catch (error) {
         console.error('Auth token failed:', error);
         return 'fallback-token';
       }
     }
   })
   ```

### EventBusTransport not receiving events

**Symptoms:**
- Events not published to EventBus
- Subscribers not receiving events

**Solutions:**
```javascript
// Check EventBus is properly initialized
console.log('EventBus:', eventBus);
console.log('Is EventBus connected:', eventBus.isConnected);

// Verify event subscription
eventBus.subscribe(LogEvent, (event) => {
  console.log('Received LogEvent:', event);
});

// Test direct EventBus posting
eventBus.post(new LogEvent('info', 'Test message', {}, [], 'test', 'test'));

// Check transport configuration
const transport = new EventBusTransport(eventBus, {
  enableSelfLogging: false, // Prevent infinite loops
  filterComponents: ['eventbus-transport']
});
```

## Performance Issues

### Logging causing performance degradation

**Symptoms:**
- Application slowness
- High memory usage
- Blocking operations

**Diagnostic steps:**
```javascript
// Enable performance monitoring
const logger = createLogger({
  level: 'info' // Avoid debug/trace in production
});

// Monitor memory usage
console.log('Memory usage:', process.memoryUsage());
```

**Solutions:**

1. **Optimize log level:**
   ```javascript
   // Production: use higher levels
   const logger = createLogger({
     level: process.env.NODE_ENV === 'production' ? 'warn' : 'debug'
   });
   ```

2. **Use sampling:**
   ```javascript
   const logger = createLogger({
     sampling: {
       debug: 0.01,  // Log 1% of debug messages
       info: 0.1,    // Log 10% of info messages
       warn: 1.0,    // Log all warnings
       error: 1.0    // Log all errors
     }
   });
   ```

3. **Optimize transports:**
   ```javascript
   // Disable expensive features in production
   new ConsoleTransport({
     enableInProduction: false
   }),
   
   // Use efficient batch sizes
   new SendBeaconTransport({
     batchSize: 100,
     flushInterval: 30000 // Less frequent flushes
   })
   ```

4. **Reduce context size:**
   ```javascript
   // Avoid large objects in context
   logger.info('User action', { 
     userId: user.id,        // Good: primitive value
     // user: user           // Bad: entire object
   });
   ```

### Memory leaks with long-running applications

**Symptoms:**
- Increasing memory usage over time
- Application crashes with out-of-memory errors

**Solutions:**
```javascript
// Enable periodic cleanup
const logger = createLogger({
  // Regular flushing
  transports: [
    new SendBeaconTransport({
      flushInterval: 10000 // Flush every 10 seconds
    })
  ]
});

// Periodic manual cleanup
setInterval(async () => {
  await logger.flush();
}, 30000);

// Destroy logger on application shutdown
process.on('SIGTERM', async () => {
  await logger.destroy();
});

```

## EventBus Integration Issues

### Event subscription not working

**Symptoms:**
- Subscribers not receiving LogEvent or MetricEvent
- Events appear to be published but not received

**Solutions:**
```javascript
// Import event classes correctly
import { LogEvent, MetricEvent } from 'lever-ui-logger';

// Subscribe with the class, not string
eventBus.subscribe(LogEvent, (event) => {
  console.log('Received:', event);
});

// Test subscription
eventBus.post(new LogEvent('info', 'Test', {}, [], 'test', 'test'));

// Check EventBus health
console.log('EventBus subscribers:', eventBus.getSubscriptionCount?.());
```

### Circular event loops

**Symptoms:**
- Infinite loops of log events
- Browser/Node.js hanging
- Stack overflow errors

**Solutions:**
```javascript
// Use EventBus transport filtering
const transport = new EventBusTransport(eventBus, {
  enableSelfLogging: false,
  filterComponents: ['eventbus-transport', 'error-handling']
});

// Be careful with EventBus subscribers that log
eventBus.subscribe(LogEvent, (event) => {
  // Don't log here - will create infinite loop
  sendToAnalytics(event); // OK
  
  // logger.info('Received event'); // BAD - infinite loop
});
```

## PII Redaction Issues

### PII not being redacted

**Symptoms:**
- Sensitive data appearing in logs
- Email addresses, phone numbers visible

**Solutions:**
```javascript
// Enable redaction
const logger = createLogger({
  redaction: {
    enabled: true,
    mode: 'strict' // More aggressive redaction
  }
});

// Test redaction
const testData = { email: 'test@example.com', phone: '555-123-4567' };
logger.info('User data', testData);
// Should show: { email: '<redacted>', phone: '<redacted>' }

// Add custom patterns
const logger = createLogger({
  redaction: {
    enabled: true,
    customPatterns: [{
      name: 'internal_id',
      pattern: /INTERNAL-\d+/g
    }]
  }
});
```

### Over-aggressive redaction

**Symptoms:**
- Normal data being redacted
- False positives in pattern matching

**Solutions:**
```javascript
// Use more permissive mode
const logger = createLogger({
  redaction: {
    enabled: true,
    mode: 'permissive' // Less aggressive
  }
});

// Customize patterns
const logger = createLogger({
  redaction: {
    enabled: true,
    customPatterns: [], // Remove default patterns
    customFieldNames: ['password', 'secret'] // Only specific fields
  }
});

// Test specific redaction
const testValue = logger.redact('test@example.com');
console.log('Redacted:', testValue);
```

## Build and Import Problems

### Module import errors with ES modules

**Symptoms:**
```bash
SyntaxError: Cannot use import statement outside a module
Error [ERR_REQUIRE_ESM]: Must use import to load ES module
```

**Solutions:**

1. **Use ES modules in package.json:**
   ```json
   {
     "type": "module"
   }
   ```

2. **Use .mjs extension:**
   ```bash
   mv script.js script.mjs
   node script.mjs
   ```

3. **Use CommonJS require():**
   ```javascript
   const { createLogger } = require('lever-ui-logger');
   ```

### TypeScript compilation errors

**Symptoms:**
```bash
TS2307: Cannot find module 'lever-ui-logger' or its corresponding type declarations
TS2345: Argument of type X is not assignable to parameter of type Y
```

**Solutions:**

1. **Install @types packages:**
   ```bash
   npm install --save-dev @types/node
   ```

2. **Check tsconfig.json:**
   ```json
   {
     "compilerOptions": {
       "moduleResolution": "node",
       "esModuleInterop": true,
       "allowSyntheticDefaultImports": true
     }
   }
   ```

3. **Use correct import syntax:**
   ```typescript
   import { createLogger, ConsoleTransport } from 'lever-ui-logger';
   import type { LoggerConfig } from 'lever-ui-logger';
   ```

### Webpack/bundler issues

**Symptoms:**
- Bundle size too large
- Tree shaking not working
- Module resolution failures

**Solutions:**

1. **Use tree-shakable imports:**
   ```javascript
   // Good: tree-shakable
   import { createLogger } from 'lever-ui-logger/logger';
   import { ConsoleTransport } from 'lever-ui-logger/transports/console';
   
   // Avoid: imports everything
   import * from 'lever-ui-logger';
   ```

2. **Configure webpack externals:**
   ```javascript
   module.exports = {
     externals: {
       'lever-ui-eventbus': 'lever-ui-eventbus'
     }
   };
   ```

## Common Error Messages

### "Transport must have a write method"

**Cause:** Invalid transport object passed to logger.

**Solution:**
```javascript
// Ensure transport implements required interface
const transport = {
  name: 'custom',
  write(event) { /* implementation */ },
  flush: async () => { /* optional */ },
  close: async () => { /* optional */ }
};
```

### "Message must be a string"

**Cause:** Non-string value passed as log message.

**Solution:**
```javascript
// Correct usage
logger.info('User action', { data: 'value' });

// Incorrect usage
logger.info({ message: 'User action' }); // Wrong: object as message
```

### "EventBus is not connected"

**Cause:** EventBus transport trying to use disconnected EventBus.

**Solution:**
```javascript
// Check EventBus state
console.log('EventBus connected:', eventBus.isConnected);

// Ensure EventBus is initialized
const eventBus = new EventBus();
await eventBus.connect(); // If required

// Then create logger
const logger = createLogger(eventBus, config);
```

## Debugging Tips

### Enable debug logging

```javascript
// Set environment variable
process.env.DEBUG = 'lever-ui-logger:*';

// Or enable in configuration
const logger = createLogger({
  level: 'debug',
  enableLogging: true
});
```

### Use console inspection

```javascript
// Inspect logger configuration
console.dir(logger, { depth: null });

// Check transport status
logger.transports?.forEach(transport => {
  console.log(`Transport ${transport.name}:`, transport);
});

// Monitor event flow
eventBus.subscribe(LogEvent, (event) => {
  console.log('Event flow:', event.level, event.message);
});
```

### Network debugging

```bash
# Monitor HTTP requests (for SendBeaconTransport)
# Open browser DevTools > Network tab
# Look for POST requests to your logging endpoint

# Test endpoint manually
curl -X POST https://your-endpoint.com/logs \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer your-token" \
  -d '{"level":"info","message":"test"}'
```

### Performance profiling

```javascript
// Monitor performance
performance.mark('logging-start');
logger.info('Test message');
performance.mark('logging-end');
performance.measure('logging-duration', 'logging-start', 'logging-end');

// Get timing
const measure = performance.getEntriesByName('logging-duration')[0];
console.log('Logging took:', measure.duration, 'ms');
```

## Getting Help

If you're still experiencing issues after following this guide:

1. **Check the GitHub Issues:** [https://github.com/nuanced-labs/lever-ui-logger/issues](https://github.com/nuanced-labs/lever-ui-logger/issues)
2. **Review the API Documentation:** [docs/api.md](./api.md)
3. **Study the Examples:** [examples/](../examples/)
4. **Create a Minimal Reproduction:** Strip your code down to the smallest example that demonstrates the problem

When reporting issues, please include:
- Package version (`npm list lever-ui-logger`)
- Node.js/browser version
- Configuration used
- Error messages and stack traces
- Minimal reproduction code