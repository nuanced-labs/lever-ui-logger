/**
 * Multiple Transports Example - Standalone First
 * 
 * Demonstrates using multiple transports simultaneously with the standalone logger:
 * - ConsoleTransport for development
 * - SendBeaconTransport for production telemetry
 * - EventBusTransport for optional cross-library coordination
 * 
 * Run with: node examples/multiple-transports.js
 */

import { 
  createLogger, 
  ConsoleTransport, 
  SendBeaconTransport
} from 'lever-ui-logger';

console.log('🚀 Multiple Transports Example - Standalone Logger\n');

// Create standalone logger with multiple transports
const logger = createLogger({
  level: 'debug',
  component: 'multi-transport-demo',
  defaultContext: { 
    service: 'example-service',
    version: '2.1.0',
    environment: process.env.NODE_ENV || 'development'
  },
  transports: [
    // Console transport for development visibility
    new ConsoleTransport({
      name: 'console',
      format: 'pretty',
      colors: true,
      timestamps: true,
      timestampFormat: 'HH:mm:ss.SSS',
      enableInProduction: false,
      performanceThreshold: 1.0
    }),

    // SendBeacon transport for production telemetry
    new SendBeaconTransport({
      name: 'analytics',
      endpoint: 'https://httpbin.org/post', // Demo endpoint that echoes data
      batchSize: 5, // Small batch for demo
      flushInterval: 3000, // 3 seconds for demo
      maxPayloadSize: 10000, // 10KB for demo
      enableOfflineStorage: true,
      enableRetries: true,
      maxRetries: 2,
      retryDelayMs: 1000,
      authToken: () => `demo-token-${Date.now()}`, // Dynamic token generation
      headers: {
        'X-Demo-App': 'lever-ui-logger-example'
      }
    })
  ],

  // PII redaction configuration
  redaction: {
    enabled: true,
    mode: 'balanced',
    customPatterns: [
      {
        name: 'session-id',
        pattern: /sess-[a-zA-Z0-9]{16}/g,
        replacement: '<session-id>',
        description: 'Session ID pattern'
      }
    ]
  },

  // Sampling configuration
  sampling: {
    trace: 0.5,  // 50% sampling for trace
    debug: 1.0,  // All debug logs
    info: 1.0,   // All info logs
    warn: 1.0,   // All warnings
    error: 1.0   // All errors
  }
});

console.log('✅ Logger initialized with multiple transports');
console.log(`📊 Active transports: ${logger.getTransports().map(t => t.name).join(', ')}\n`);

// Demonstrate logging at different levels
console.log('📝 Testing different log levels...\n');

logger.trace('Detailed trace information', { 
  function: 'processData', 
  step: 'validation',
  executionTime: 0.245 
});

logger.debug('Processing user request', { 
  requestId: 'req-' + Math.random().toString(36).substr(2, 9),
  endpoint: '/api/users/profile',
  method: 'GET'
});

logger.info('User operation completed', { 
  userId: '12345', 
  operation: 'profile_update',
  duration: 156,
  success: true
});

logger.warn('API rate limit approaching', { 
  currentRequests: 95,
  limit: 100,
  resetTime: new Date(Date.now() + 60000).toISOString(),
  action: 'throttle_requests'
});

logger.error('Database connection failed', { 
  host: 'localhost',
  port: 5432,
  database: 'users',
  error: 'Connection timeout after 30s',
  retries: 3,
  nextRetryIn: '2s'
});

// Demonstrate metrics collection
console.log('\n📈 Recording structured metrics...\n');

logger.metric('api_response_time', {
  endpoint: '/users/profile',
  method: 'GET',
  duration: 125,
  status: 200,
  cached: false,
  region: 'us-west-2'
});

logger.metric('user_engagement', {
  action: 'button_click',
  element: 'upgrade_plan',
  page: 'pricing',
  userId: '12345',
  sessionDuration: 245000,
  converted: true
});

logger.metric('system_performance', {
  cpu_usage: 45.2,
  memory_usage: 67.8,
  disk_usage: 23.1,
  active_connections: 124,
  response_time_p95: 89.5
});

// Demonstrate contextual logging with child loggers
console.log('\n🌳 Demonstrating contextual logging...\n');

const userLogger = logger.withContext({
  userId: '67890',
  sessionId: 'sess-' + Math.random().toString(36).substr(2, 16)
});

const requestLogger = userLogger.withContext({
  requestId: 'req-' + Math.random().toString(36).substr(2, 9),
  traceId: 'trace-' + Math.random().toString(36).substr(2, 12)
});

requestLogger.info('Request processing started', {
  endpoint: '/api/orders',
  method: 'POST',
  contentType: 'application/json'
});

requestLogger.debug('Validating request payload', {
  payloadSize: 1247,
  validationRules: ['required_fields', 'data_types', 'business_rules']
});

requestLogger.info('Request processing completed', {
  processingTime: 89,
  status: 201,
  responseSize: 543
});

// Demonstrate dynamic transport management
console.log('\n🔄 Demonstrating transport management...\n');

// Add a custom transport dynamically
class CustomTransport {
  name = 'custom-demo';
  
  write(event) {
    console.log(`🔧 Custom Transport: [${event.level.toUpperCase()}] ${event.message}`);
    if (event.context && Object.keys(event.context).length > 0) {
      console.log(`   Context:`, JSON.stringify(event.context, null, 2));
    }
  }

  async flush() {
    console.log('🔧 Custom Transport: Flushing...');
  }

  async close() {
    console.log('🔧 Custom Transport: Closing...');
  }
}

logger.addTransport(new CustomTransport());
logger.info('Custom transport has been added', { transportCount: logger.getTransports().length });

// Demonstrate PII redaction
console.log('\n🛡️ Demonstrating PII redaction...\n');

logger.info('User registration attempt', {
  email: 'user@example.com',          // Will be redacted
  phone: '+1-555-123-4567',           // Will be redacted  
  sessionId: 'sess-abc123def456ghi',  // Will be redacted (custom pattern)
  username: 'johndoe',                // Will remain
  timestamp: Date.now()               // Will remain
});

// Performance demonstration
console.log('\n⚡ Performance demonstration...\n');

const startTime = performance.now();
const iterations = 1000;

for (let i = 0; i < iterations; i++) {
  logger.debug(`Performance test iteration ${i}`, {
    iteration: i,
    batchId: Math.floor(i / 100),
    timestamp: Date.now()
  });
}

const endTime = performance.now();
const avgTime = (endTime - startTime) / iterations;

console.log(`📊 Performance Results:`);
console.log(`   Total iterations: ${iterations}`);
console.log(`   Total time: ${(endTime - startTime).toFixed(2)}ms`);
console.log(`   Average time per log: ${avgTime.toFixed(4)}ms`);

// Flush all transports before exit
console.log('\n🔄 Flushing all transports...');

try {
  await logger.flush();
  console.log('✅ All transports flushed successfully');
} catch (error) {
  console.error('❌ Error flushing transports:', error.message);
}

// Optional: Demonstrate EventBus integration
console.log('\n🔗 Optional EventBus Integration Example...\n');

// Uncomment below to see EventBus integration (requires lever-ui-eventbus)
/*
import { EventBus } from 'lever-ui-eventbus';
import { EventBusTransport, LogEvent, MetricEvent } from 'lever-ui-logger';

const eventBus = new EventBus();

// Subscribe to events before adding transport
eventBus.subscribe(LogEvent, (event) => {
  console.log(`📡 EventBus LogEvent: [${event.level}] ${event.component}: ${event.message}`);
});

eventBus.subscribe(MetricEvent, (event) => {
  console.log(`📊 EventBus MetricEvent: ${event.name} =`, event.fields);
});

// Add EventBus transport to existing logger
logger.addTransport(new EventBusTransport(eventBus, {
  enableSelfLogging: false,
  eventMetadata: { source: 'multi-transport-example' }
}));

logger.info('EventBus transport added - this log will also publish an event');
logger.metric('eventbus_integration', { enabled: true, timestamp: Date.now() });
*/

// Graceful shutdown
process.on('SIGINT', async () => {
  console.log('\n🛑 Graceful shutdown initiated...');
  
  try {
    await logger.flush();
    await logger.destroy();
    console.log('✅ Logger shutdown completed');
    process.exit(0);
  } catch (error) {
    console.error('❌ Error during shutdown:', error.message);
    process.exit(1);
  }
});

console.log('\n✨ Example completed! The logger continues to work in the background.');
console.log('💡 Press Ctrl+C to trigger graceful shutdown and see transport cleanup.');
console.log('🔍 Check your browser network tab to see SendBeacon requests (if running in browser context).');

// Keep process alive to demonstrate batching and flushing
setTimeout(() => {
  logger.info('Periodic heartbeat', { 
    uptime: process.uptime(),
    memory: process.memoryUsage(),
    timestamp: new Date().toISOString()
  });
}, 10000);