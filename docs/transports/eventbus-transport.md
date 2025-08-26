# EventBus Transport Documentation

## Table of Contents
- [Overview](#overview)
- [Basic Usage](#basic-usage)
- [Configuration Options](#configuration-options)
- [Infinite Loop Prevention](#infinite-loop-prevention)
- [Self-Logging Patterns](#self-logging-patterns)
- [Event Transformation](#event-transformation)
- [Production Configurations](#production-configurations)
- [Troubleshooting](#troubleshooting)
- [Best Practices](#best-practices)

## Overview

The EventBus transport publishes log events to an EventBus system, enabling cross-library integration and event-driven architectures. It provides intelligent event type detection, comprehensive loop prevention, and robust error handling.

### Key Features
- Automatic event transformation (LogEvent, MetricEvent, ErrorEvent)
- Infinite loop prevention with component filtering
- Intelligent event type detection
- Custom event transformation support
- Production-ready with silent error modes
- Dependency injection pattern for testability

## Basic Usage

### Simple Setup

```typescript
import { EventBus } from 'lever-ui-eventbus';
import { createLogger, EventBusTransport } from 'lever-ui-logger';

// Create EventBus instance
const eventBus = new EventBus();

// Create transport
const transport = new EventBusTransport(eventBus);

// Create logger with transport
const logger = createLogger({
  transports: [transport]
});

// Other parts of your app can subscribe to events
eventBus.subscribe(LogEvent, (event) => {
  console.log(`[${event.level}] ${event.message}`);
});

// Use the logger
logger.info('Application started', { version: '1.0.0' });
```

### With Custom Configuration

```typescript
const transport = new EventBusTransport(eventBus, {
  name: 'main-eventbus',
  enableSelfLogging: false,
  filterComponents: ['eventbus-transport', 'analytics'],
  silentErrors: process.env.NODE_ENV === 'production',
  transformMetadata: {
    appVersion: '1.0.0',
    environment: process.env.NODE_ENV
  }
});

// Create logger with the transport
const logger = createLogger('app', {
  transports: [transport]
});

// Use the logger - events will be published to EventBus
logger.info('User logged in', { userId: '123' });
logger.error('Database error', new Error('Connection failed'));
```

## Configuration Options

| Option | Type | Default | Description |
|--------|------|---------|-------------|
| `name` | `string` | `'eventbus'` | Transport identifier |
| `enableSelfLogging` | `boolean` | `false` | Allow transport to log about itself |
| `filterComponents` | `string[]` | `['eventbus-transport']` | Components to filter out |
| `silentErrors` | `boolean` | `false` | Suppress error logging |
| `transformMetadata` | `Record<string, unknown>` | `{}` | Additional event metadata |
| `eventTransformer` | `Function` | `undefined` | Custom event transformation |

## Infinite Loop Prevention

### The Problem

Without proper safeguards, logging transports can create infinite loops:

```typescript
// DANGER: Infinite loop scenario
class UnsafeTransport {
  write(event: LogEventData): void {
    try {
      this.eventBus.publish(event);
    } catch (error) {
      // This creates a new log event that goes through the same transport!
      logger.error('Failed to publish', error); // INFINITE LOOP
    }
  }
}
```

### The Solution: Multi-Layer Defense

#### Layer 1: Component Filtering

```typescript
const transport = new EventBusTransport(eventBus, {
  filterComponents: [
    'eventbus-transport',  // Filter self
    'analytics',           // Filter analytics logs
    'error-tracker',       // Filter error tracking logs
    'metrics-collector'    // Filter metrics logs
  ]
});

// Create logger with the transport
const logger = createLogger('app', {
  transports: [transport]
});

// These components' logs won't go through EventBus transport
logger.info('Event processed', { component: 'analytics' }); // Filtered out - won't publish to EventBus
logger.info('User action', { component: 'ui' }); // Will publish to EventBus
```

#### Layer 2: Self-Logging Control

```typescript
const transport = new EventBusTransport(eventBus, {
  name: 'main-eventbus',
  enableSelfLogging: false  // Default - prevents self-logging
});

// Create logger with the transport
const logger = createLogger('app', {
  transports: [transport]
});

// Transport's own logs are filtered
logger.info('Transport initialized', { 
  component: 'main-eventbus' // Automatically filtered - won't publish to EventBus
});
logger.info('User action', { component: 'ui' }); // Will publish to EventBus
```

#### Layer 3: Silent Error Mode

```typescript
const transport = new EventBusTransport(eventBus, {
  silentErrors: true  // No error logging at all in production
});

// Create logger with the transport
const logger = createLogger('app', {
  transports: [transport]
});

// Even if the EventBus transport fails internally, errors are suppressed
// No console.error, no logger.error - complete silence
logger.info('This will attempt to publish to EventBus');
// If EventBus fails, no error will be logged anywhere
```

#### Layer 4: Safe Error Handling

```typescript
class EventBusTransport {
  private handlePublishError(error: unknown, originalEvent: LogEventData | null): void {
    if (this.transportConfig.silentErrors) {
      return; // Silent - no logging
    }
    
    // Use console.error instead of logger to avoid loops
    console.error(`EventBus transport: ${error}`);
    // NOT: logger.error(...) which would create a loop
  }
}
```

### Advanced Loop Prevention Techniques

#### Technique 1: Event Origin Tracking
```typescript
interface TrackedLogEventData extends LogEventData {
  _transportOrigins?: string[];  // Track which transports processed this
}

class OriginTrackingTransport extends EventBusTransport {
  write(event: LogEventData): void {
    const trackedEvent = event as TrackedLogEventData;
    
    // Initialize origins array if not present
    if (!trackedEvent._transportOrigins) {
      trackedEvent._transportOrigins = [];
    }
    
    // Check if this transport already processed this event
    if (trackedEvent._transportOrigins.includes(this.name)) {
      console.warn('Loop detected: ' + this.name + ' already processed this event');
      return;
    }
    
    // Add this transport to the origins
    trackedEvent._transportOrigins.push(this.name);
    
    super.write(trackedEvent);
  }
}
```

#### Technique 2: Execution Context Isolation
```typescript
class ContextIsolatedTransport extends EventBusTransport {
  private static processingContext = new Map<string, boolean>();
  
  write(event: LogEventData): void {
    const contextKey = `${this.name}-${event.level}-${event.component}`;
    
    // Check if we're already processing a similar event
    if (ContextIsolatedTransport.processingContext.get(contextKey)) {
      return; // Skip to prevent immediate recursion
    }
    
    try {
      ContextIsolatedTransport.processingContext.set(contextKey, true);
      super.write(event);
    } finally {
      ContextIsolatedTransport.processingContext.delete(contextKey);
    }
  }
}
```

#### Technique 3: Async Boundary Protection
```typescript
class AsyncBoundaryTransport extends EventBusTransport {
  write(event: LogEventData): void {
    // Use setImmediate to break the call stack
    setImmediate(() => {
      this.writeAsync(event);
    });
  }
  
  private writeAsync(event: LogEventData): void {
    try {
      super.write(event);
    } catch (error) {
      // Safe to use console here - we're in a new stack
      console.error('AsyncBoundary transport error:', error);
    }
  }
}
```

#### Technique 4: Rate Limiting by Event Signature
```typescript
class RateLimitedTransport extends EventBusTransport {
  private eventSignatures = new Map<string, { count: number; lastSeen: number }>();
  private readonly MAX_SAME_EVENT_PER_SECOND = 10;
  
  write(event: LogEventData): void {
    const signature = `${event.level}:${event.component}:${event.message.substring(0, 50)}`;
    const now = Date.now();
    const existing = this.eventSignatures.get(signature);
    
    if (existing) {
      // Reset counter if more than 1 second has passed
      if (now - existing.lastSeen > 1000) {
        existing.count = 0;
      }
      
      existing.count++;
      existing.lastSeen = now;
      
      // Skip if we've seen this event too many times recently
      if (existing.count > this.MAX_SAME_EVENT_PER_SECOND) {
        return;
      }
    } else {
      this.eventSignatures.set(signature, { count: 1, lastSeen: now });
    }
    
    super.write(event);
  }
}
```

#### Technique 5: Dead Letter Queue for Problem Events
```typescript
class DeadLetterTransport extends EventBusTransport {
  private deadLetterQueue: LogEventData[] = [];
  private problemPatterns = new Set<string>();
  
  write(event: LogEventData): void {
    const eventPattern = `${event.component}:${event.level}`;
    
    // Check if this pattern has caused problems before
    if (this.problemPatterns.has(eventPattern)) {
      this.deadLetterQueue.push(event);
      
      // Periodically log dead letter stats (not through logger!)
      if (this.deadLetterQueue.length % 100 === 0) {
        console.warn('Dead letter queue: ' + this.deadLetterQueue.length + ' events');
      }
      return;
    }
    
    try {
      super.write(event);
    } catch (error) {
      // Mark this pattern as problematic
      this.problemPatterns.add(eventPattern);
      this.deadLetterQueue.push(event);
      
      console.error('Event pattern ' + eventPattern + ' marked as problematic:', error);
    }
  }
  
  // Method to retry dead letter events (call manually)
  retryDeadLetters(): void {
    const events = this.deadLetterQueue.splice(0, 10); // Retry in batches
    
    events.forEach(event => {
      try {
        super.write(event);
      } catch (error) {
        // Put it back in dead letter queue
        this.deadLetterQueue.push(event);
      }
    });
  }
}
```

## Self-Logging Patterns

### When to Enable Self-Logging

There are legitimate cases where you want the transport to log about itself:

#### 1. Performance Monitoring

```typescript
// Track transport performance metrics
const transport = new EventBusTransport(eventBus, {
  name: 'perf-eventbus',
  enableSelfLogging: true,
  eventTransformer: (event, metadata) => {
    const startTime = performance.now();
    const transformed = defaultTransform(event);
    const duration = performance.now() - startTime;
    
    if (duration > 100) {
      // This log goes through the same transport - intentionally!
      logger.warn('Slow event transformation', {
        component: 'perf-eventbus',
        duration,
        eventLevel: event.level
      });
    }
    
    return transformed;
  }
});

// Create logger with the transport
const logger = createLogger('app', {
  transports: [transport]
});

// Subscribe to performance warnings
eventBus.subscribe(LogEvent, (event) => {
  if (event.message.includes('Slow event transformation')) {
    // Send alert to monitoring system
    monitoring.alert('slow_transform', event.context);
  }
});

// Normal usage - transformation performance will be monitored
logger.info('Processing user data', { userId: '123' });
```

#### 2. Connection Lifecycle Tracking

```typescript
class EventBusTransport extends BaseTransport {
  private async connect(): Promise<void> {
    try {
      await this.eventBus.connect();
      
      // Log successful connection - goes through same transport
      logger.info('EventBus transport connected', {
        component: this.name,
        endpoint: this.config.endpoint,
        timestamp: Date.now()
      });
    } catch (error) {
      // Log connection failure - important for debugging
      logger.error('EventBus transport connection failed', {
        component: this.name,
        error: error.message,
        willRetry: true
      });
    }
  }
}
```

#### 3. Audit Trail Requirements

```typescript
// Financial/Healthcare compliance requires complete audit trail
const transport = new EventBusTransport(eventBus, {
  name: 'audit-eventbus',
  enableSelfLogging: true,
  eventTransformer: (event, metadata) => {
    // Log that we processed a compliance event
    if (event.context?.compliance) {
      logger.info('Compliance event processed', {
        component: 'audit-eventbus',
        eventId: event.context.eventId,
        processedAt: Date.now(),
        transportVersion: '1.0.0'
      });
    }
    
    return new LogEvent(event.level, event.message, event.context);
  }
});

// Create logger with the transport
const logger = createLogger('app', {
  transports: [transport]
});

// Subscribe to audit events for compliance reporting
eventBus.subscribe(LogEvent, (event) => {
  if (event.message === 'Compliance event processed') {
    // Store in permanent audit log
    auditDB.store(event);
  }
});

// Log compliance events - each will generate an audit trail
logger.info('Patient data accessed', { 
  compliance: true, 
  eventId: 'PAT-001',
  userId: 'doctor-123' 
});
```

#### 4. Development Debugging

```typescript
// Enable verbose logging during development
const transport = new EventBusTransport(eventBus, {
  name: 'debug-eventbus',
  enableSelfLogging: process.env.NODE_ENV === 'development',
  eventTransformer: (event, metadata) => {
    if (process.env.DEBUG_TRANSPORT === 'true') {
      console.log('EventBus Transform Debug:', {
        input: event,
        detected: detectEventType(event),
        metadata: metadata
      });
    }
    
    return defaultTransform(event);
  }
});

// Create logger with the transport
const logger = createLogger('app', {
  transports: [transport]
});

// In development, transport logs will be published to EventBus for debugging
// In production, transport logs are filtered out
logger.info('App started', { version: '1.0.0' });

// Subscribe to debug events in development
if (process.env.NODE_ENV === 'development') {
  eventBus.subscribe(LogEvent, (event) => {
    if (event.component === 'debug-eventbus') {
      console.log('Transport self-log:', event);
    }
  });
}
```

### Anti-Patterns to Avoid

**Never do these things when self-logging is enabled:**

#### 1. Logging in Error Handlers
```typescript
// DANGEROUS: Creates loops
class BadEventBusTransport extends EventBusTransport {
  write(event: LogEventData): void {
    try {
      super.write(event);
    } catch (error) {
      // This creates infinite recursion!
      logger.error('Transport failed', error, {
        component: this.name // Same component = loop
      });
    }
  }
}
```

#### 2. Logging Every Event
```typescript
// DANGEROUS: Too verbose, creates noise loops
const transport = new EventBusTransport(eventBus, {
  enableSelfLogging: true,
  eventTransformer: (event) => {
    // DON'T log every single event processing
    logger.info('Processing event', {
      component: 'eventbus-transport',
      eventLevel: event.level // Creates noise loop
    });
    return null;
  }
});
```

#### 3. Conditional Self-Logging Without Proper Guards
```typescript
// DANGEROUS: No depth protection
const transport = new EventBusTransport(eventBus, {
  enableSelfLogging: true,
  eventTransformer: (event) => {
    if (event.level === 'error') {
      // What if THIS fails and creates an error event?
      logger.warn('Error event detected', {
        component: 'eventbus-transport',
        originalError: event.message
      });
    }
    return null;
  }
});
```

#### 4. Using Logger in Constructor
```typescript
// DANGEROUS: Logger may not be fully initialized
class BadEventBusTransport extends EventBusTransport {
  constructor(eventBus: EventBusInterface, config?: EventBusTransportConfig) {
    super(eventBus, config);
    
    // DON'T log during construction
    logger.info('EventBus transport initialized', {
      component: this.name
    });
  }
}
```

### Safe Self-Logging Implementation

**When you do enable self-logging, implement safeguards:**

```typescript
class SafeEventBusTransport extends EventBusTransport {
  private selfLogDepth = 0;
  private readonly MAX_SELF_LOG_DEPTH = 1;
  
  write(event: LogEventData): void {
    // Check if this is a self-log
    if (event.component === this.name) {
      // Enforce depth limit
      if (this.selfLogDepth >= this.MAX_SELF_LOG_DEPTH) {
        return; // Stop processing to prevent deep recursion
      }
      
      // Only allow specific self-log types
      if (!this.isAllowedSelfLog(event)) {
        return;
      }
      
      this.selfLogDepth++;
      try {
        super.write(event);
      } finally {
        this.selfLogDepth--;
      }
    } else {
      super.write(event);
    }
  }
  
  private isAllowedSelfLog(event: LogEventData): boolean {
    const allowedPatterns = [
      'connected',
      'disconnected',
      'performance',
      'retry',
      'audit'
    ];
    
    return allowedPatterns.some(pattern => 
      event.message.toLowerCase().includes(pattern)
    );
  }
}
```

## Event Transformation

### Automatic Event Type Detection

The transport intelligently detects and transforms events:

```typescript
// Automatically becomes ErrorEvent
logger.error('Database connection failed', { 
  error: new Error('Connection timeout') 
});

// Automatically becomes MetricEvent (detects "timing:" prefix)
logger.info('timing: api_response', { 
  duration: 234,
  endpoint: '/api/users'
});

// Automatically becomes MetricEvent (numeric data + keywords)
logger.info('Response time measured', {
  responseTime: 156,
  statusCode: 200
});

// Regular LogEvent
logger.info('User logged in', { userId: '123' });
```

### Custom Event Transformation

```typescript
const transport = new EventBusTransport(eventBus, {
  eventTransformer: (event, metadata) => {
    // Custom business logic
    if (event.context?.businessEvent) {
      return new BusinessEvent(
        event.context.businessEvent,
        event.message,
        metadata.transformTimestamp
      );
    }
    
    // Custom metric detection
    if (event.message.startsWith('METRIC:')) {
      const metricName = event.message.substring(7);
      return new MetricEvent(
        metricName,
        event.context,
        {},
        event.component
      );
    }
    
    // Fall back to default transformation
    return null; // null means use default
  }
});
```

### Transformation Metadata

```typescript
const transport = new EventBusTransport(eventBus, {
  transformMetadata: {
    appVersion: '2.1.0',
    buildId: process.env.BUILD_ID,
    region: 'us-west-2',
    instanceId: process.env.INSTANCE_ID
  },
  eventTransformer: (event, metadata) => {
    // metadata includes:
    // - transportName: 'eventbus'
    // - transformTimestamp: 1234567890
    // - metadata: { appVersion, buildId, region, instanceId }
    
    const enrichedEvent = new LogEvent(
      event.level,
      event.message,
      {
        ...event.context,
        ...metadata.metadata // Add all metadata to context
      },
      event.args,
      event.component
    );
    
    return enrichedEvent;
  }
});
```

## Production Configurations

### High-Volume Production System

```typescript
// High-throughput configuration with safety features
const transport = new EventBusTransport(eventBus, {
  name: 'prod-eventbus',
  enableSelfLogging: false,
  silentErrors: true, // No error logging in production
  filterComponents: [
    'eventbus-transport',
    'analytics',
    'metrics-collector',
    'health-check',
    'rate-limiter'
  ],
  transformMetadata: {
    environment: 'production',
    version: process.env.APP_VERSION,
    deploymentId: process.env.DEPLOYMENT_ID
  }
});

// Create production logger
const logger = createLogger('api', {
  transports: [
    transport,
    new FileTransport({ path: '/var/log/api.log' }) // Backup logging
  ]
});

// Set up event processing for monitoring
eventBus.subscribe(ErrorEvent, (event) => {
  // Send critical errors to alerting system
  if (event.level === 'error') {
    alerting.sendAlert(event);
  }
});

eventBus.subscribe(MetricEvent, (event) => {
  // Send metrics to monitoring dashboard
  metrics.record(event.name, event.fields);
});

// Use logger - events published to EventBus and file
logger.info('API request processed', { endpoint: '/users', duration: 45 });
logger.error('Database timeout', new Error('Connection lost'));
```

### Microservices Architecture

```typescript
const SERVICE_NAME = 'user-service';

// Service-specific transport configuration
const transport = new EventBusTransport(eventBus, {
  name: `eventbus-${SERVICE_NAME}`,
  filterComponents: [
    'eventbus-transport',
    // Filter out other services' transports
    'eventbus-auth-service',
    'eventbus-payment-service',
    'eventbus-notification-service'
  ],
  transformMetadata: {
    serviceName: SERVICE_NAME,
    serviceVersion: SERVICE_VERSION,
    podId: process.env.POD_ID,
    nodeId: process.env.NODE_ID
  },
  eventTransformer: (event, metadata) => {
    // Add service context to all events
    return new LogEvent(
      event.level,
      event.message,
      {
        ...event.context,
        service: metadata.metadata.serviceName,
        traceId: event.context?.traceId || generateTraceId()
      },
      event.args,
      event.component
    );
  }
});

// Create service logger
const logger = createLogger(SERVICE_NAME, {
  transports: [transport]
});

// Cross-service event handling
eventBus.subscribe(LogEvent, (event) => {
  // Only process events from other services
  if (event.context?.service !== SERVICE_NAME) {
    handleCrossServiceEvent(event);
  }
});

// Service usage - all events enriched with service metadata
logger.info('User created', { userId: '123', email: 'user@example.com' });
logger.error('Database connection failed', new Error('Timeout'));
```

### Multi-Tenant SaaS Platform

```typescript
// Tenant-aware configuration
const transport = new EventBusTransport(eventBus, {
  name: 'tenant-eventbus',
  eventTransformer: (event, metadata) => {
    const tenantId = event.context?.tenantId || 'system';
    
    // Route to tenant-specific event types
    if (tenantId !== 'system') {
      return new TenantLogEvent(
        tenantId,
        event.level,
        event.message,
        event.context
      );
    }
    
    return new LogEvent(
      event.level,
      event.message,
      event.context,
      event.args,
      event.component
    );
  },
  filterComponents: [
    'eventbus-transport',
    // Don't filter tenant logs
  ],
  transformMetadata: {
    platform: 'saas',
    region: process.env.AWS_REGION
  }
});
```

### Development Environment

```typescript
// Verbose configuration for development
const transport = new EventBusTransport(eventBus, {
  name: 'dev-eventbus',
  enableSelfLogging: true, // See transport operations
  silentErrors: false,     // See all errors
  filterComponents: [],     // Don't filter anything
  transformMetadata: {
    environment: 'development',
    developer: process.env.USER,
    branch: process.env.GIT_BRANCH
  },
  eventTransformer: (event, metadata) => {
    // Add debug information
    console.log('Event Transform Debug:', {
      level: event.level,
      component: event.component,
      willBecome: detectEventType(event)
    });
    
    return null; // Use default transformation
  }
});
```

### Load Balancer / Proxy Environment

```typescript
// Configuration for applications behind load balancers
const transport = new EventBusTransport(eventBus, {
  name: 'lb-eventbus',
  silentErrors: true,
  filterComponents: ['eventbus-transport', 'health-check'],
  transformMetadata: {
    instance: process.env.HOSTNAME || os.hostname(),
    pod: process.env.POD_NAME,
    node: process.env.NODE_NAME,
    loadBalancer: process.env.LB_NAME
  },
  eventTransformer: (event, metadata) => {
    // Add load balancer context to all events
    return new LogEvent(
      event.level,
      event.message,
      {
        ...event.context,
        infrastructure: {
          instance: metadata.metadata.instance,
          pod: metadata.metadata.pod,
          node: metadata.metadata.node
        }
      },
      event.args,
      event.component
    );
  }
});
```

### Cloud Native (Kubernetes/Docker)

```typescript
// Configuration optimized for containerized environments
const transport = new EventBusTransport(eventBus, {
  name: 'k8s-eventbus',
  silentErrors: true,
  filterComponents: ['eventbus-transport', 'k8s-probe'],
  transformMetadata: {
    cluster: process.env.CLUSTER_NAME,
    namespace: process.env.NAMESPACE,
    pod: process.env.POD_NAME,
    container: process.env.CONTAINER_NAME,
    image: process.env.IMAGE_TAG,
    commit: process.env.GIT_SHA
  },
  eventTransformer: (event, metadata) => {
    // Enrich events with Kubernetes metadata
    return new LogEvent(
      event.level,
      event.message,
      {
        ...event.context,
        kubernetes: {
          cluster: metadata.metadata.cluster,
          namespace: metadata.metadata.namespace,
          pod: metadata.metadata.pod,
          container: metadata.metadata.container
        },
        deployment: {
          image: metadata.metadata.image,
          commit: metadata.metadata.commit,
          deployTime: process.env.DEPLOY_TIMESTAMP
        }
      },
      event.args,
      event.component
    );
  }
});
```

### Financial Services (Compliance Heavy)

```typescript
// Configuration for regulated environments
const transport = new EventBusTransport(eventBus, {
  name: 'finserv-eventbus',
  enableSelfLogging: true, // Audit requirements
  silentErrors: false,     // Must log all errors for compliance
  filterComponents: [],    // Cannot filter for compliance
  transformMetadata: {
    complianceVersion: '2.1.0',
    auditId: generateAuditId(),
    jurisdiction: process.env.JURISDICTION,
    regulatoryScope: ['PCI', 'SOX', 'GDPR']
  },
  eventTransformer: (event, metadata) => {
    // Add compliance metadata to all events
    return new ComplianceLogEvent(
      event.level,
      event.message,
      {
        ...event.context,
        audit: {
          id: metadata.metadata.auditId,
          timestamp: new Date().toISOString(),
          jurisdiction: metadata.metadata.jurisdiction,
          retentionPeriod: '7 years',
          classification: classifyEvent(event)
        }
      },
      event.component
    );
  }
});

// Custom compliance event type
class ComplianceLogEvent extends LogEvent {
  constructor(
    level: string,
    message: string,
    context: any,
    component?: string
  ) {
    super(level, message, context, [], component);
    
    // Ensure required audit fields
    if (!context?.audit?.id) {
      throw new Error('Compliance events must have audit.id');
    }
  }
}
```

### E-commerce / High Traffic

```typescript
// Configuration for high-traffic e-commerce sites
const transport = new EventBusTransport(eventBus, {
  name: 'ecommerce-eventbus',
  silentErrors: true,
  filterComponents: [
    'eventbus-transport',
    'analytics-tracker',
    'metrics-collector',
    'recommendation-engine'
  ],
  transformMetadata: {
    region: process.env.AWS_REGION,
    availability: process.env.AVAILABILITY_ZONE,
    instanceType: process.env.INSTANCE_TYPE,
    salesChannel: process.env.SALES_CHANNEL
  },
  eventTransformer: (event, metadata) => {
    // Route business events differently
    if (event.context?.businessEvent) {
      return new BusinessEvent(
        event.context.businessEvent,
        event.message,
        {
          ...event.context,
          salesContext: {
            channel: metadata.metadata.salesChannel,
            region: metadata.metadata.region,
            timestamp: Date.now()
          }
        }
      );
    }
    
    // Add user session context to all events
    return new LogEvent(
      event.level,
      event.message,
      {
        ...event.context,
        session: {
          region: metadata.metadata.region,
          instanceType: metadata.metadata.instanceType
        }
      },
      event.args,
      event.component
    );
  }
});
```

### Gaming / Real-time Applications

```typescript
// Configuration for gaming and real-time applications
const transport = new EventBusTransport(eventBus, {
  name: 'gaming-eventbus',
  silentErrors: true,
  filterComponents: [
    'eventbus-transport',
    'physics-engine',
    'render-loop',
    'input-handler'
  ],
  transformMetadata: {
    gameServer: process.env.GAME_SERVER_ID,
    gameMode: process.env.GAME_MODE,
    maxPlayers: process.env.MAX_PLAYERS,
    tickRate: process.env.TICK_RATE
  },
  eventTransformer: (event, metadata) => {
    // Handle game events specially
    if (event.context?.gameEvent) {
      return new GameEvent(
        event.context.gameEvent,
        event.context.playerId,
        {
          ...event.context,
          server: {
            id: metadata.metadata.gameServer,
            mode: metadata.metadata.gameMode,
            tick: getCurrentTick()
          }
        }
      );
    }
    
    // Add performance context for non-game events
    return new LogEvent(
      event.level,
      event.message,
      {
        ...event.context,
        performance: {
          fps: getCurrentFPS(),
          players: getPlayerCount(),
          tickRate: metadata.metadata.tickRate
        }
      },
      event.args,
      event.component
    );
  }
});
```

### Healthcare / HIPAA Compliance

```typescript
// Configuration for healthcare applications
const transport = new EventBusTransport(eventBus, {
  name: 'healthcare-eventbus',
  enableSelfLogging: true, // Required for audit trails
  silentErrors: false,     // Must capture all errors
  filterComponents: [],    // Cannot filter for compliance
  transformMetadata: {
    facilityId: process.env.FACILITY_ID,
    systemVersion: process.env.SYSTEM_VERSION,
    hipaaCompliance: 'enabled',
    auditLevel: 'comprehensive'
  },
  eventTransformer: (event, metadata) => {
    // Redact PII before publishing
    const redactedEvent = redactPHI(event);
    
    return new HIPAALogEvent(
      redactedEvent.level,
      redactedEvent.message,
      {
        ...redactedEvent.context,
        hipaa: {
          facilityId: metadata.metadata.facilityId,
          auditTimestamp: new Date().toISOString(),
          dataClassification: classifyHealthData(event),
          retentionPeriod: '6 years',
          accessLevel: determineAccessLevel(event)
        }
      },
      event.component
    );
  }
});

// Custom HIPAA-compliant event type
class HIPAALogEvent extends LogEvent {
  constructor(
    level: string,
    message: string,
    context: any,
    component?: string
  ) {
    super(level, message, context, [], component);
    
    // Validate HIPAA compliance
    if (!context?.hipaa?.auditTimestamp) {
      throw new Error('HIPAA events must have audit timestamp');
    }
  }
}
```

## Troubleshooting

### Common Issues and Solutions

#### 1. Events Not Publishing

```typescript
// Problem: Events aren't reaching subscribers
eventBus.subscribe(LogEvent, (event) => {
  console.log('Received:', event); // Never called
});

// Solution 1: Check if EventBus is connected
const transport = new EventBusTransport(eventBus, {
  silentErrors: false // Enable error logging
});

const logger = createLogger('debug', {
  transports: [transport]
});

// Try logging - check console for connection errors
logger.info('Test event');

// Solution 2: Check component filtering
const unfilteredTransport = new EventBusTransport(eventBus, {
  filterComponents: [] // Temporarily disable filtering
});

const debugLogger = createLogger('debug', {
  transports: [unfilteredTransport]
});

debugLogger.info('Should reach subscribers');

// Solution 3: Add debug logging
const verboseTransport = new EventBusTransport(eventBus, {
  eventTransformer: (event) => {
    console.log('Processing:', event);
    return null; // Use default transformation
  }
});

const verboseLogger = createLogger('debug', {
  transports: [verboseTransport]
});

verboseLogger.info('Debug event'); // Will log processing details
```

#### 2. Infinite Loop Detection

```typescript
// Symptom: Stack overflow or hanging application

// Debug approach:
const transport = new EventBusTransport(eventBus, {
  name: 'debug-transport',
  enableSelfLogging: false,
  filterComponents: ['debug-transport'],
  eventTransformer: (event, metadata) => {
    // Track recursion depth
    const depth = event.context?._transportDepth || 0;
    if (depth > 0) {
      console.error('ERROR: Recursive event detected!', event);
      return null; // Stop processing
    }
    
    return new LogEvent(
      event.level,
      event.message,
      { ...event.context, _transportDepth: depth + 1 },
      event.args,
      event.component
    );
  }
});
```

#### 3. Memory Leaks

```typescript
// Problem: Memory usage keeps growing

// Solution: Implement cleanup
class ManagedEventBusTransport extends EventBusTransport {
  private eventCount = 0;
  private readonly MAX_EVENTS = 10000;
  
  write(event: LogEventData): void {
    this.eventCount++;
    
    // Periodic cleanup
    if (this.eventCount >= this.MAX_EVENTS) {
      this.cleanup();
      this.eventCount = 0;
    }
    
    super.write(event);
  }
  
  private cleanup(): void {
    // Force garbage collection hints
    if (global.gc) {
      global.gc();
    }
    
    // Log memory usage
    const usage = process.memoryUsage();
    logger.info('Transport memory check', {
      component: 'transport-monitor',
      heapUsed: Math.round(usage.heapUsed / 1024 / 1024),
      heapTotal: Math.round(usage.heapTotal / 1024 / 1024)
    });
  }
}
```

#### 4. Performance Issues

```typescript
// Problem: Slow event processing

// Solution: Add performance monitoring
const transport = new EventBusTransport(eventBus, {
  eventTransformer: (event, metadata) => {
    const start = performance.now();
    
    // Your transformation logic
    const transformed = complexTransformation(event);
    
    const duration = performance.now() - start;
    if (duration > 10) {
      // Use console to avoid loops
      console.warn('Slow transformation: ' + duration + 'ms', {
        level: event.level,
        component: event.component
      });
    }
    
    return transformed;
  }
});

// Or implement batching
class BatchingEventBusTransport extends EventBusTransport {
  private batch: LogEventData[] = [];
  private batchTimer?: NodeJS.Timeout;
  
  write(event: LogEventData): void {
    this.batch.push(event);
    
    if (this.batch.length >= 100) {
      this.flush();
    } else if (!this.batchTimer) {
      this.batchTimer = setTimeout(() => this.flush(), 100);
    }
  }
  
  private flush(): void {
    const events = this.batch;
    this.batch = [];
    
    if (this.batchTimer) {
      clearTimeout(this.batchTimer);
      this.batchTimer = undefined;
    }
    
    // Process batch efficiently
    const transformedEvents = events.map(e => this.transformEvent(e));
    this.eventBus.publishBatch(transformedEvents);
  }
}
```

#### 5. Events Not Transforming Correctly

```typescript
// Problem: Events aren't being transformed to expected types

// Debugging approach:
const transport = new EventBusTransport(eventBus, {
  eventTransformer: (event, metadata) => {
    // Log detection results
    console.log('Event Detection Debug:', {
      original: event,
      hasError: !!event.context?.error,
      isTimingMessage: event.message.startsWith('timing:'),
      hasNumericFields: hasNumericFields(event.context || {}),
      detectedAs: detectEventType(event)
    });
    
    return null; // Use default transformation
  }
});

// Or create custom detection logic:
const transport = new EventBusTransport(eventBus, {
  eventTransformer: (event, metadata) => {
    // Custom business logic detection
    if (event.context?.transactionId) {
      return new TransactionEvent(event.context.transactionId, event.message);
    }
    
    if (event.context?.userId && event.message.includes('login')) {
      return new UserEvent('login', event.context.userId, event.context);
    }
    
    // Fall back to default
    return null;
  }
});
```

#### 6. EventBus Connection Issues

```typescript
// Problem: EventBus is not connected or has connection problems

// Solution: Add connection monitoring
class ResilientEventBusTransport extends EventBusTransport {
  private connectionRetries = 0;
  private readonly maxRetries = 5;
  
  write(event: LogEventData): void {
    if (!this.eventBus.isConnected()) {
      this.handleConnectionFailure(event);
      return;
    }
    
    try {
      super.write(event);
      this.connectionRetries = 0; // Reset on success
    } catch (error) {
      if (this.isConnectionError(error)) {
        this.handleConnectionFailure(event);
      } else {
        throw error;
      }
    }
  }
  
  private handleConnectionFailure(event: LogEventData): void {
    if (this.connectionRetries < this.maxRetries) {
      this.connectionRetries++;
      
      console.log('EventBus connection retry ' + this.connectionRetries + '/' + this.maxRetries);
      
      // Retry after delay
      setTimeout(() => {
        this.write(event);
      }, Math.pow(2, this.connectionRetries) * 1000);
    } else {
      console.error('EventBus max retries exceeded, dropping event');
    }
  }
  
  private isConnectionError(error: unknown): boolean {
    return error instanceof Error && (
      error.message.includes('not connected') ||
      error.message.includes('connection closed') ||
      error.message.includes('network error')
    );
  }
}
```

#### 7. High Memory Usage

```typescript
// Problem: Transport is consuming too much memory

// Solution: Implement memory-aware transport
class MemoryAwareTransport extends EventBusTransport {
  private eventCount = 0;
  private readonly memoryCheckInterval = 1000; // Check every 1000 events
  private readonly maxMemoryMB = 512;
  
  write(event: LogEventData): void {
    this.eventCount++;
    
    // Periodic memory check
    if (this.eventCount % this.memoryCheckInterval === 0) {
      this.checkMemoryUsage();
    }
    
    super.write(event);
  }
  
  private checkMemoryUsage(): void {
    if (!process.memoryUsage) return; // Browser environment
    
    const usage = process.memoryUsage();
    const heapUsedMB = usage.heapUsed / 1024 / 1024;
    
    if (heapUsedMB > this.maxMemoryMB) {
      console.warn('High memory usage: ' + Math.round(heapUsedMB) + 'MB', {
        heapUsed: Math.round(usage.heapUsed / 1024 / 1024),
        heapTotal: Math.round(usage.heapTotal / 1024 / 1024),
        external: Math.round(usage.external / 1024 / 1024),
        rss: Math.round(usage.rss / 1024 / 1024)
      });
      
      // Trigger garbage collection if available
      if (global.gc) {
        global.gc();
        console.log('Forced garbage collection');
      }
    }
  }
}
```

#### 8. Type Safety Issues

```typescript
// Problem: TypeScript errors with custom event types

// Solution: Proper type definitions
interface CustomEventBusTransportConfig extends EventBusTransportConfig {
  customEventTypes?: Record<string, new (...args: any[]) => any>;
}

class TypeSafeEventBusTransport extends EventBusTransport {
  constructor(
    eventBus: EventBusInterface,
    private customConfig: CustomEventBusTransportConfig
  ) {
    super(eventBus, customConfig);
  }
  
  protected transformEvent(event: LogEventData): any {
    // Type-safe event transformation
    const transformed = super.transformEvent(event);
    
    // Validate the transformed event is what we expect
    if (transformed && this.customConfig.customEventTypes) {
      const expectedType = this.customConfig.customEventTypes[transformed.constructor.name];
      if (expectedType && !(transformed instanceof expectedType)) {
        console.warn('Type mismatch in event transformation', {
          expected: expectedType.name,
          actual: transformed.constructor.name
        });
      }
    }
    
    return transformed;
  }
}
```

#### 9. Testing Challenges

```typescript
// Problem: Hard to test EventBus integration

// Solution: Create testable transport wrapper
class TestableEventBusTransport extends EventBusTransport {
  private _testMode = false;
  private _publishedEvents: any[] = [];
  private _errors: Error[] = [];
  
  enableTestMode(): void {
    this._testMode = true;
    this._publishedEvents = [];
    this._errors = [];
  }
  
  getPublishedEvents(): any[] {
    return [...this._publishedEvents];
  }
  
  getErrors(): Error[] {
    return [...this._errors];
  }
  
  write(event: LogEventData): void {
    if (this._testMode) {
      try {
        const transformed = this.transformEvent(event);
        this._publishedEvents.push(transformed);
      } catch (error) {
        this._errors.push(error as Error);
      }
    } else {
      super.write(event);
    }
  }
}

// Usage in tests
describe('EventBus Integration', () => {
  let transport: TestableEventBusTransport;
  
  beforeEach(() => {
    transport = new TestableEventBusTransport(mockEventBus);
    transport.enableTestMode();
  });
  
  it('should transform error events correctly', () => {
    transport.write(createErrorEvent('test error'));
    
    const published = transport.getPublishedEvents();
    expect(published).toHaveLength(1);
    expect(published[0]).toBeInstanceOf(ErrorEvent);
  });
});
```

#### 10. Development vs Production Behavior Differences

```typescript
// Problem: Transport behaves differently in dev vs prod

// Solution: Environment-aware configuration
class EnvironmentAwareTransport extends EventBusTransport {
  constructor(eventBus: EventBusInterface, baseConfig: EventBusTransportConfig) {
    const envConfig = EnvironmentAwareTransport.getEnvironmentConfig(baseConfig);
    super(eventBus, envConfig);
  }
  
  private static getEnvironmentConfig(baseConfig: EventBusTransportConfig): EventBusTransportConfig {
    const isDev = process.env.NODE_ENV === 'development';
    const isProd = process.env.NODE_ENV === 'production';
    const isTest = process.env.NODE_ENV === 'test';
    
    return {
      ...baseConfig,
      // Development: verbose logging
      enableSelfLogging: isDev ? true : baseConfig.enableSelfLogging,
      silentErrors: isDev ? false : baseConfig.silentErrors,
      
      // Production: performance optimized
      filterComponents: isProd 
        ? [...(baseConfig.filterComponents || []), 'debug', 'trace']
        : baseConfig.filterComponents,
        
      // Test: isolated behavior
      eventTransformer: isTest 
        ? (event, metadata) => {
            // Add test markers
            return new LogEvent(
              event.level,
              event.message,
              { ...event.context, _testRun: true },
              event.args,
              event.component
            );
          }
        : baseConfig.eventTransformer
    };
  }
}
```

### Diagnostic Tools

#### EventBus Transport Health Check

```typescript
class EventBusTransportHealthCheck {
  constructor(private transport: EventBusTransport) {}
  
  async runHealthCheck(): Promise<HealthCheckResult> {
    const results: HealthCheckResult = {
      status: 'healthy',
      checks: {},
      timestamp: Date.now()
    };
    
    // Test basic connectivity
    try {
      await this.testConnectivity();
      results.checks.connectivity = 'pass';
    } catch (error) {
      results.checks.connectivity = 'fail';
      results.status = 'unhealthy';
    }
    
    // Test event transformation
    try {
      this.testEventTransformation();
      results.checks.transformation = 'pass';
    } catch (error) {
      results.checks.transformation = 'fail';
      results.status = 'degraded';
    }
    
    // Test memory usage
    const memoryCheck = this.checkMemoryUsage();
    results.checks.memory = memoryCheck.status;
    results.memoryUsageMB = memoryCheck.usageMB;
    
    return results;
  }
  
  private async testConnectivity(): Promise<void> {
    // Send a test event
    const testEvent: LogEventData = {
      level: 'info',
      message: 'health-check',
      timestamp: Date.now(),
      component: 'health-check',
      context: { test: true },
      args: []
    };
    
    this.transport.write(testEvent);
  }
  
  private testEventTransformation(): void {
    const testEvents = [
      { level: 'error', context: { error: new Error('test') } },
      { level: 'info', message: 'timing: test', context: { duration: 100 } },
      { level: 'info', message: 'regular log' }
    ];
    
    // Verify transformations work
    // Implementation depends on your specific transport setup
  }
  
  private checkMemoryUsage(): { status: string; usageMB: number } {
    if (!process.memoryUsage) {
      return { status: 'skip', usageMB: 0 };
    }
    
    const usage = process.memoryUsage();
    const usageMB = usage.heapUsed / 1024 / 1024;
    
    return {
      status: usageMB > 512 ? 'warn' : 'pass',
      usageMB: Math.round(usageMB)
    };
  }
}

interface HealthCheckResult {
  status: 'healthy' | 'degraded' | 'unhealthy';
  checks: Record<string, string>;
  timestamp: number;
  memoryUsageMB?: number;
}
```

#### Debug Event Inspector

```typescript
class EventBusDebugInspector {
  private eventHistory: Array<{
    original: LogEventData;
    transformed: any;
    timestamp: number;
    processed: boolean;
    error?: Error;
  }> = [];
  
  wrapTransport(transport: EventBusTransport): EventBusTransport {
    const originalWrite = transport.write.bind(transport);
    
    transport.write = (event: LogEventData) => {
      const entry = {
        original: { ...event },
        transformed: null as any,
        timestamp: Date.now(),
        processed: false,
        error: undefined as Error | undefined
      };
      
      try {
        // Call original method
        originalWrite(event);
        entry.processed = true;
      } catch (error) {
        entry.error = error as Error;
        entry.processed = false;
      }
      
      this.eventHistory.push(entry);
      
      // Keep only last 1000 events
      if (this.eventHistory.length > 1000) {
        this.eventHistory.shift();
      }
    };
    
    return transport;
  }
  
  getEventHistory(filter?: {
    component?: string;
    level?: string;
    hasError?: boolean;
  }): typeof this.eventHistory {
    if (!filter) return this.eventHistory;
    
    return this.eventHistory.filter(entry => {
      if (filter.component && entry.original.component !== filter.component) return false;
      if (filter.level && entry.original.level !== filter.level) return false;
      if (filter.hasError !== undefined && !!entry.error !== filter.hasError) return false;
      return true;
    });
  }
  
  getStats(): {
    total: number;
    processed: number;
    errors: number;
    byLevel: Record<string, number>;
    byComponent: Record<string, number>;
  } {
    const stats = {
      total: this.eventHistory.length,
      processed: 0,
      errors: 0,
      byLevel: {} as Record<string, number>,
      byComponent: {} as Record<string, number>
    };
    
    this.eventHistory.forEach(entry => {
      if (entry.processed) stats.processed++;
      if (entry.error) stats.errors++;
      
      const level = entry.original.level;
      stats.byLevel[level] = (stats.byLevel[level] || 0) + 1;
      
      const component = entry.original.component || 'unknown';
      stats.byComponent[component] = (stats.byComponent[component] || 0) + 1;
    });
    
    return stats;
  }
}
```

## Best Practices

### 1. Use Separate Loggers for Infrastructure

```typescript
// Application logger
const appLogger = createLogger({
  transports: [
    new EventBusTransport(eventBus, {
      enableSelfLogging: false
    })
  ]
});

// Infrastructure logger (doesn't use EventBus)
const infraLogger = createLogger({
  transports: [
    new ConsoleTransport(),
    new FileTransport({ path: '/var/log/infra.log' })
  ]
});

// Use in EventBus transport
class EventBusTransport {
  write(event: LogEventData): void {
    // Use infra logger for transport logs
    infraLogger.debug('Processing event', { 
      level: event.level 
    });
    
    this.eventBus.publish(event);
  }
}
```

### 2. Implement Circuit Breakers

```typescript
class ResilientEventBusTransport extends EventBusTransport {
  private failures = 0;
  private readonly maxFailures = 5;
  private circuitOpen = false;
  private resetTimer?: NodeJS.Timeout;
  
  write(event: LogEventData): void {
    if (this.circuitOpen) {
      // Circuit is open, skip processing
      return;
    }
    
    try {
      super.write(event);
      this.failures = 0; // Reset on success
    } catch (error) {
      this.failures++;
      
      if (this.failures >= this.maxFailures) {
        this.openCircuit();
      }
      
      throw error;
    }
  }
  
  private openCircuit(): void {
    this.circuitOpen = true;
    console.error('EventBus circuit breaker opened');
    
    // Auto-reset after 30 seconds
    this.resetTimer = setTimeout(() => {
      this.circuitOpen = false;
      this.failures = 0;
      console.info('EventBus circuit breaker reset');
    }, 30000);
  }
}
```

### 3. Type-Safe Event Subscriptions

```typescript
// Define custom event types
class BusinessMetricEvent extends MetricEvent {
  constructor(
    public readonly businessMetric: string,
    public readonly value: number,
    public readonly dimensions: Record<string, string>
  ) {
    super(businessMetric, { value }, dimensions, 'business');
  }
}

// Type-safe subscription
eventBus.subscribe(BusinessMetricEvent, (event) => {
  // TypeScript knows the event type
  analytics.track(event.businessMetric, {
    value: event.value,
    ...event.dimensions
  });
});

// Configure transport to create custom events
const transport = new EventBusTransport(eventBus, {
  eventTransformer: (event) => {
    if (event.context?.businessMetric) {
      return new BusinessMetricEvent(
        event.context.businessMetric,
        event.context.value,
        event.context.dimensions
      );
    }
    return null;
  }
});
```

### 4. Monitoring and Alerting

```typescript
// Monitor transport health
class MonitoredEventBusTransport extends EventBusTransport {
  private stats = {
    processed: 0,
    errors: 0,
    filtered: 0,
    lastError: null as Error | null
  };
  
  write(event: LogEventData): void {
    if (!this.shouldProcessEvent(event)) {
      this.stats.filtered++;
      return;
    }
    
    try {
      super.write(event);
      this.stats.processed++;
    } catch (error) {
      this.stats.errors++;
      this.stats.lastError = error as Error;
      
      // Alert if error rate is high
      if (this.stats.errors > 100) {
        this.sendAlert({
          type: 'high_error_rate',
          transport: 'eventbus',
          errors: this.stats.errors,
          lastError: this.stats.lastError.message
        });
      }
    }
  }
  
  getStats() {
    return { ...this.stats };
  }
}
```

### 5. Testing Strategies

```typescript
// Mock EventBus for testing
describe('EventBusTransport', () => {
  let transport: EventBusTransport;
  let mockEventBus: MockEventBus;
  
  beforeEach(() => {
    mockEventBus = new MockEventBus();
    transport = new EventBusTransport(mockEventBus, {
      silentErrors: true // No console noise in tests
    });
  });
  
  it('should filter self-logs by default', () => {
    const event = createLogEvent('info', 'test', {
      component: 'eventbus'
    });
    
    transport.write(event);
    
    expect(mockEventBus.publishedEvents).toHaveLength(0);
  });
  
  it('should transform errors to ErrorEvents', () => {
    const event = createLogEvent('error', 'failed', {
      error: new Error('test error')
    });
    
    transport.write(event);
    
    const published = mockEventBus.publishedEvents[0];
    expect(published).toBeInstanceOf(ErrorEvent);
    expect(published.error.message).toBe('test error');
  });
});
```

## Advanced Patterns

### Event Routing

```typescript
// Route events to different EventBus instances
class RoutingEventBusTransport extends BaseTransport {
  constructor(
    private routes: Map<string, EventBusInterface>
  ) {
    super('routing-transport');
  }
  
  write(event: LogEventData): void {
    const route = this.determineRoute(event);
    const eventBus = this.routes.get(route);
    
    if (eventBus) {
      const transformed = this.transformEvent(event);
      eventBus.publish(transformed);
    }
  }
  
  private determineRoute(event: LogEventData): string {
    // Route by level
    if (event.level === 'error') return 'errors';
    if (event.level === 'warn') return 'warnings';
    
    // Route by component
    if (event.component?.startsWith('auth-')) return 'auth';
    if (event.component?.startsWith('payment-')) return 'payment';
    
    return 'default';
  }
}
```

### Event Aggregation

```typescript
// Aggregate similar events before publishing
class AggregatingEventBusTransport extends EventBusTransport {
  private aggregates = new Map<string, AggregatedEvent>();
  
  write(event: LogEventData): void {
    const key = this.getAggregateKey(event);
    
    if (!this.aggregates.has(key)) {
      this.aggregates.set(key, {
        first: event,
        count: 1,
        lastSeen: Date.now()
      });
      
      // Publish first occurrence immediately
      super.write(event);
    } else {
      // Aggregate subsequent occurrences
      const aggregate = this.aggregates.get(key)!;
      aggregate.count++;
      aggregate.lastSeen = Date.now();
      
      // Publish aggregate periodically
      if (aggregate.count % 100 === 0) {
        super.write({
          ...event,
          message: `${event.message} (×${aggregate.count})`,
          context: {
            ...event.context,
            aggregated: true,
            count: aggregate.count
          }
        });
      }
    }
  }
  
  private getAggregateKey(event: LogEventData): string {
    return `${event.level}:${event.component}:${event.message}`;
  }
}
```

## Migration Guide

### From Console to EventBus Transport

```typescript
// Before: Console-only logging
const logger = createLogger({
  transports: [new ConsoleTransport()]
});

// After: Add EventBus transport
const logger = createLogger({
  transports: [
    new ConsoleTransport(),
    new EventBusTransport(eventBus, {
      filterComponents: ['console-transport']
    })
  ]
});

// Subscribe to events
eventBus.subscribe(LogEvent, (event) => {
  // Send to monitoring service
  monitoring.send(event);
});

eventBus.subscribe(ErrorEvent, (event) => {
  // Send to error tracking
  errorTracking.capture(event);
});
```

### From Direct EventBus Publishing

```typescript
// Before: Direct publishing
eventBus.publish(new LogEvent('info', 'User action', {}));

// After: Through logger
logger.info('User action', { userId: '123' });
// Automatically published as LogEvent
```

## Performance Considerations

### Benchmarks

```typescript
// Measure transport overhead
const benchmark = async () => {
  const iterations = 10000;
  const transport = new EventBusTransport(eventBus);
  
  console.time('EventBus Transport');
  for (let i = 0; i < iterations; i++) {
    transport.write({
      level: 'info',
      message: `Message ${i}`,
      timestamp: Date.now(),
      component: 'benchmark',
      context: { index: i },
      args: []
    });
  }
  console.timeEnd('EventBus Transport');
  
  // Results on typical hardware:
  // EventBus Transport: 45ms (≈4.5µs per event)
};
```

### Optimization Tips

1. **Use Silent Mode in Production**
   ```typescript
   silentErrors: process.env.NODE_ENV === 'production'
   ```

2. **Filter Aggressively**
   ```typescript
   filterComponents: getAllNoisyComponents()
   ```

3. **Batch When Possible**
   ```typescript
   // Use custom batching transport for high volume
   ```

4. **Cache Transformations**
   ```typescript
   const transformCache = new WeakMap();
   ```

## API Reference

See [API Documentation](./api/eventbus-transport.md) for detailed API reference.

## Examples Repository

Full working examples available at:
- [Basic Setup](../../examples/eventbus-basic.ts)
- [Production Config](../../examples/eventbus-production.ts)
- [Custom Transformers](../../examples/eventbus-transform.ts)
- [Loop Prevention](../../examples/eventbus-loops.ts)
- [Testing Setup](../../examples/eventbus-testing.ts)