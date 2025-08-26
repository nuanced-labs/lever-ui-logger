# Performance Tuning Guide

This guide provides strategies for optimizing lever-ui-logger performance in production environments, reducing overhead, and maintaining application responsiveness.

## Table of Contents

- [Performance Overview](#performance-overview)
- [Logger Configuration Optimization](#logger-configuration-optimization)
- [Transport Optimization](#transport-optimization)
- [Memory Management](#memory-management)
- [Bundle Size Optimization](#bundle-size-optimization)
- [Production Best Practices](#production-best-practices)
- [Monitoring and Metrics](#monitoring-and-metrics)
- [Performance Testing](#performance-testing)

## Performance Overview

### Baseline Performance
- **Average log processing**: 0.036ms per log
- **Memory usage**: ~3MB for 10k logs
- **Burst logging**: 0.102ms per log average
- **Bundle size**: 7.79KB logger + 10.41KB transports (gzipped)

### Performance Goals
- **< 1ms processing time** per log operation
- **< 50MB memory usage** for long-running applications
- **< 20KB total bundle size** for web applications
- **Zero blocking operations** on the main thread

## Logger Configuration Optimization

### Log Level Management

**Production configuration:**
```javascript
const logger = createLogger({
  // Use higher levels in production
  level: process.env.NODE_ENV === 'production' ? 'warn' : 'debug',
  
  // Component-specific levels
  component: 'api-server'
});

// Set different levels for different components
logger.setComponentLevel('database', 'error');  // Only errors from DB
logger.setComponentLevel('auth', 'info');       // Info+ from auth
logger.setComponentLevel('metrics', 'warn');    // Warnings+ from metrics
```

**Dynamic level adjustment:**
```javascript
// Adjust levels based on system load
function adjustLogLevelBasedOnLoad() {
  const memUsage = process.memoryUsage().heapUsed / 1024 / 1024;
  
  if (memUsage > 100) {
    logger.setLevel('error'); // Only critical logs
  } else if (memUsage > 50) {
    logger.setLevel('warn');  // Warnings and errors
  } else {
    logger.setLevel('info');  // Normal operation
  }
}

setInterval(adjustLogLevelBasedOnLoad, 60000); // Check every minute
```

### Sampling Configuration

**Intelligent sampling:**
```javascript
const logger = createLogger({
  sampling: {
    // Sample debug logs aggressively
    debug: process.env.NODE_ENV === 'production' ? 0.01 : 1.0,
    
    // Sample info logs moderately
    info: process.env.NODE_ENV === 'production' ? 0.1 : 1.0,
    
    // Always log warnings and errors
    warn: 1.0,
    error: 1.0
  }
});
```

**Adaptive sampling:**
```javascript
class AdaptiveSampler {
  constructor() {
    this.baseSampleRates = { debug: 0.1, info: 0.5, warn: 1.0, error: 1.0 };
    this.currentLoad = 0;
  }
  
  updateSampleRates(systemLoad) {
    this.currentLoad = systemLoad;
    const multiplier = Math.max(0.01, 1 - systemLoad);
    
    return {
      debug: this.baseSampleRates.debug * multiplier,
      info: this.baseSampleRates.info * multiplier,
      warn: this.baseSampleRates.warn,
      error: this.baseSampleRates.error
    };
  }
}

const sampler = new AdaptiveSampler();

// Update sampling based on CPU usage
setInterval(() => {
  const cpuUsage = getCPUUsage(); // Your implementation
  const newRates = sampler.updateSampleRates(cpuUsage);
  
  // Recreate logger with new sampling rates (or update existing)
  updateLoggerSampling(newRates);
}, 30000);
```

### Context Optimization

**Efficient context management:**
```javascript
// Good: lightweight context
const userLogger = logger.withContext({
  userId: user.id,           // Primitive values
  sessionId: session.id,
  role: user.role
});

// Avoid: heavy context objects
const userLogger = logger.withContext({
  user: user,                // Entire user object (heavy)
  session: session,          // Entire session object (heavy)
  request: request           // Request object (very heavy)
});
```

**Context pooling for high-frequency logging:**
```javascript
class ContextPool {
  constructor() {
    this.pool = [];
    this.maxSize = 100;
  }
  
  acquire() {
    return this.pool.pop() || {};
  }
  
  release(context) {
    // Clear and reuse object
    Object.keys(context).forEach(key => delete context[key]);
    
    if (this.pool.length < this.maxSize) {
      this.pool.push(context);
    }
  }
}

const contextPool = new ContextPool();

// High-frequency logging with context reuse
function logUserAction(userId, action) {
  const context = contextPool.acquire();
  context.userId = userId;
  context.action = action;
  context.timestamp = Date.now();
  
  logger.info('User action', context);
  
  contextPool.release(context);
}
```

## Transport Optimization

### Console Transport

**Production optimization:**
```javascript
const consoleTransport = new ConsoleTransport({
  // Disable in production for better performance
  enableInProduction: process.env.NODE_ENV !== 'production',
  
  // Use efficient format
  format: 'compact',
  
  // Disable colors for better performance
  colors: process.env.NODE_ENV !== 'production',
  
  // Reduce timestamp precision
  timestampFormat: 'HH:mm:ss', // No milliseconds
  
  // Higher performance threshold
  performanceThreshold: 2.0 // 2ms warning threshold
});
```

### SendBeacon Transport

**Optimized batching:**
```javascript
const beaconTransport = new SendBeaconTransport({
  // Optimize batch size for payload limit
  batchSize: calculateOptimalBatchSize(),
  
  // Less frequent flushing
  flushInterval: 30000, // 30 seconds
  
  // Larger payload limit (close to browser limit)
  maxPayloadSize: 62000, // 62KB (留 2KB buffer)
  
  // Disable retries for better performance
  enableRetries: false,
  
  // Compress payloads
  enableCompression: true
});

function calculateOptimalBatchSize() {
  // Estimate average log size and calculate optimal batch
  const avgLogSize = 200; // bytes
  const targetPayloadSize = 60000; // bytes
  return Math.floor(targetPayloadSize / avgLogSize);
}
```

**Compression for large payloads:**
```javascript
import { compressionMiddleware } from 'lever-ui-logger';

const beaconTransport = new SendBeaconTransport({
  endpoint: 'https://logs.example.com/collect',
  middleware: [
    // Compress batches before sending
    compressionMiddleware({ 
      format: 'gzip',
      threshold: 1024 // Only compress if > 1KB
    })
  ]
});
```

### EventBus Transport

**Efficient EventBus integration:**
```javascript
const eventBusTransport = new EventBusTransport(eventBus, {
  // Disable self-logging to prevent loops
  enableSelfLogging: false,
  
  // Filter out noisy components
  filterComponents: [
    'performance-monitor',
    'metrics-collector',
    'heartbeat'
  ],
  
  // Minimal metadata
  eventMetadata: {
    source: 'logger' // Only essential metadata
  }
});
```

### Custom Transport Optimization

**High-performance custom transport:**
```javascript
class OptimizedTransport {
  constructor(config = {}) {
    this.name = 'optimized';
    this.buffer = [];
    this.bufferSize = config.bufferSize || 1000;
    this.flushInterval = config.flushInterval || 5000;
    this.isProcessing = false;
    
    // Use requestIdleCallback for non-blocking processing
    this.scheduleFlush();
  }
  
  write(event) {
    // Add to buffer without processing
    this.buffer.push(event);
    
    if (this.buffer.length >= this.bufferSize) {
      this.requestFlush();
    }
  }
  
  requestFlush() {
    if (this.isProcessing) return;
    
    // Use scheduler API for non-blocking execution
    if (typeof requestIdleCallback !== 'undefined') {
      requestIdleCallback(() => this.flush(), { timeout: 1000 });
    } else {
      setTimeout(() => this.flush(), 0);
    }
  }
  
  async flush() {
    if (this.isProcessing || this.buffer.length === 0) return;
    
    this.isProcessing = true;
    const events = this.buffer.splice(0);
    
    try {
      // Process events in chunks to avoid blocking
      await this.processEventsInChunks(events, 100);
    } finally {
      this.isProcessing = false;
    }
  }
  
  async processEventsInChunks(events, chunkSize) {
    for (let i = 0; i < events.length; i += chunkSize) {
      const chunk = events.slice(i, i + chunkSize);
      await this.processChunk(chunk);
      
      // Yield control to prevent blocking
      await new Promise(resolve => setTimeout(resolve, 0));
    }
  }
  
  async processChunk(events) {
    // Your processing logic here
    console.log(`Processing ${events.length} events`);
  }
  
  scheduleFlush() {
    setInterval(() => this.requestFlush(), this.flushInterval);
  }
}
```


## Memory Management

### Prevent Memory Leaks

**Periodic cleanup:**
```javascript
class MemoryManager {
  constructor(logger, errorSystem) {
    this.logger = logger;
    this.errorSystem = errorSystem;
    this.lastCleanup = Date.now();
    this.cleanupInterval = 300000; // 5 minutes
    
    this.scheduleCleanup();
  }
  
  scheduleCleanup() {
    setInterval(() => {
      this.performCleanup();
    }, this.cleanupInterval);
  }
  
  async performCleanup() {
    const startTime = Date.now();
    
    try {
      // Flush logger transports
      await this.logger.flush();
      
      // Reset error system statistics
      this.errorSystem.reset();
      
      // Force garbage collection if available
      if (global.gc) {
        global.gc();
      }
      
      const cleanupTime = Date.now() - startTime;
      console.log(`Memory cleanup completed in ${cleanupTime}ms`);
      
    } catch (error) {
      console.error('Memory cleanup failed:', error);
    }
  }
  
  getMemoryStats() {
    const usage = process.memoryUsage();
    return {
      heapUsed: Math.round(usage.heapUsed / 1024 / 1024),
      heapTotal: Math.round(usage.heapTotal / 1024 / 1024),
      external: Math.round(usage.external / 1024 / 1024),
      rss: Math.round(usage.rss / 1024 / 1024)
    };
  }
}

const memoryManager = new MemoryManager(logger, errorSystem);
```

### Object Pooling

**Pool frequently created objects:**
```javascript
class LogEventPool {
  constructor() {
    this.pool = [];
    this.maxSize = 1000;
  }
  
  acquire() {
    return this.pool.pop() || this.createNew();
  }
  
  release(event) {
    // Reset object properties
    event.level = null;
    event.message = null;
    event.context = null;
    event.args = null;
    event.timestamp = null;
    
    if (this.pool.length < this.maxSize) {
      this.pool.push(event);
    }
  }
  
  createNew() {
    return {
      level: null,
      message: null,
      context: null,
      args: null,
      timestamp: null
    };
  }
}

const eventPool = new LogEventPool();

// Use pooled objects in custom transport
class PooledTransport {
  write(event) {
    const pooledEvent = eventPool.acquire();
    
    // Copy data to pooled object
    Object.assign(pooledEvent, event);
    
    // Process event
    this.processEvent(pooledEvent);
    
    // Return to pool
    eventPool.release(pooledEvent);
  }
}
```

## Bundle Size Optimization

### Tree-Shakable Imports

**Optimal import strategy:**
```javascript
// Good: Import only what you need
import { createLogger } from 'lever-ui-logger/logger';
import { ConsoleTransport } from 'lever-ui-logger/transports/console';

// Avoid: Importing everything
import * as Logger from 'lever-ui-logger'; // Imports entire library
```

### Dynamic Imports for Optional Features

**Lazy load heavy features:**
```javascript
class LazyLogger {
  constructor(basicConfig) {
    this.basicLogger = createLogger(basicConfig);
    this.errorSystem = null;
  }
  
  async enableErrorHandling(config) {
    if (!this.errorSystem) {
      // Dynamic import to reduce initial bundle size
        'lever-ui-logger/error-handling'
      );
      
    }
    
    return this.errorSystem;
  }
  
  async addSendBeaconTransport(config) {
    // Only load SendBeacon transport when needed
    const { SendBeaconTransport } = await import(
      'lever-ui-logger/transports/sendbeacon'
    );
    
    this.basicLogger.addTransport(new SendBeaconTransport(config));
  }
}

// Usage
const logger = new LazyLogger({
  level: 'info',
  transports: [new ConsoleTransport()]
});

// Only load error handling when needed
if (shouldEnableErrorHandling()) {
  await logger.enableErrorHandling({
    globalCapture: { enabled: true }
  });
}
```

### Webpack Bundle Analysis

**Webpack optimization:**
```javascript
// webpack.config.js
module.exports = {
  resolve: {
    // Enable tree shaking
    sideEffects: false
  },
  
  optimization: {
    // Better tree shaking
    usedExports: true,
    
    // Split vendor chunks
    splitChunks: {
      chunks: 'all',
      cacheGroups: {
        logger: {
          test: /[\\/]node_modules[\\/]@nuanced-labs[\\/]lever-ui-logger/,
          name: 'logger',
          chunks: 'all'
        }
      }
    }
  }
};
```

## Production Best Practices

### Environment-Specific Configuration

**Production logger setup:**
```javascript
function createProductionLogger() {
  return createLogger({
    // Higher log level
    level: 'warn',
    
    // Minimal context
    defaultContext: {
      service: process.env.SERVICE_NAME,
      version: process.env.VERSION,
      env: 'production'
    },
    
    // Aggressive sampling
    sampling: {
      debug: 0.001,  // 0.1% of debug logs
      info: 0.01,    // 1% of info logs
      warn: 1.0,     // All warnings
      error: 1.0     // All errors
    },
    
    // Optimized transports
    transports: [
      // No console in production
      new SendBeaconTransport({
        endpoint: process.env.LOG_ENDPOINT,
        batchSize: 200,
        flushInterval: 60000, // 1 minute
        enableCompression: true
      })
    ],
    
    // Balanced redaction
    redaction: {
      enabled: true,
      mode: 'balanced',
      enablePerformanceWarnings: false
    }
  });
}

function createDevelopmentLogger() {
  return createLogger({
    // Lower log level
    level: 'debug',
    
    // Rich context
    defaultContext: {
      service: 'dev-service',
      developer: process.env.USER
    },
    
    // No sampling in development
    sampling: {},
    
    // Rich console output
    transports: [
      new ConsoleTransport({
        format: 'pretty',
        colors: true,
        timestamps: true
      })
    ]
  });
}

// Environment-aware logger creation
const logger = process.env.NODE_ENV === 'production' 
  ? createProductionLogger()
  : createDevelopmentLogger();
```

### Performance Monitoring

**Built-in performance monitoring:**
```javascript
class LoggerPerformanceMonitor {
  constructor(logger) {
    this.logger = logger;
    this.metrics = {
      logCount: 0,
      totalTime: 0,
      maxTime: 0,
      slowLogs: []
    };
    
    this.startMonitoring();
  }
  
  startMonitoring() {
    const originalWrite = this.logger.constructor.prototype.write;
    
    this.logger.constructor.prototype.write = function(event) {
      const start = performance.now();
      const result = originalWrite.call(this, event);
      const duration = performance.now() - start;
      
      this.updateMetrics(duration, event);
      
      return result;
    }.bind(this);
  }
  
  updateMetrics(duration, event) {
    this.metrics.logCount++;
    this.metrics.totalTime += duration;
    this.metrics.maxTime = Math.max(this.metrics.maxTime, duration);
    
    // Track slow logs
    if (duration > 5.0) { // > 5ms is slow
      this.metrics.slowLogs.push({
        duration,
        level: event.level,
        message: event.message.substring(0, 100),
        timestamp: Date.now()
      });
      
      // Keep only recent slow logs
      if (this.metrics.slowLogs.length > 100) {
        this.metrics.slowLogs.shift();
      }
    }
  }
  
  getMetrics() {
    return {
      ...this.metrics,
      averageTime: this.metrics.logCount > 0 
        ? this.metrics.totalTime / this.metrics.logCount 
        : 0
    };
  }
  
  reset() {
    this.metrics = {
      logCount: 0,
      totalTime: 0,
      maxTime: 0,
      slowLogs: []
    };
  }
}

const perfMonitor = new LoggerPerformanceMonitor(logger);

// Periodic performance reporting
setInterval(() => {
  const metrics = perfMonitor.getMetrics();
  
  if (metrics.averageTime > 1.0) { // > 1ms average is concerning
    console.warn('Logger performance degraded:', metrics);
  }
  
  perfMonitor.reset();
}, 300000); // Every 5 minutes
```

## Monitoring and Metrics

### Key Performance Indicators

**Monitor these metrics:**
```javascript
class LoggerKPIMonitor {
  constructor() {
    this.kpis = {
      // Performance KPIs
      averageLogTime: 0,
      p95LogTime: 0,
      p99LogTime: 0,
      
      // Volume KPIs
      logsPerSecond: 0,
      totalLogs: 0,
      
      // Error KPIs
      errorRate: 0,
      transportFailures: 0,
      
      // Memory KPIs
      memoryUsage: 0,
      memoryGrowthRate: 0
    };
    
    this.timings = [];
    this.startTime = Date.now();
  }
  
  recordLogTiming(duration) {
    this.timings.push(duration);
    
    // Keep only recent timings (last 1000)
    if (this.timings.length > 1000) {
      this.timings.shift();
    }
    
    this.updatePerformanceKPIs();
  }
  
  updatePerformanceKPIs() {
    const sorted = [...this.timings].sort((a, b) => a - b);
    
    this.kpis.averageLogTime = this.timings.reduce((a, b) => a + b, 0) / this.timings.length;
    this.kpis.p95LogTime = sorted[Math.floor(sorted.length * 0.95)];
    this.kpis.p99LogTime = sorted[Math.floor(sorted.length * 0.99)];
  }
  
  updateVolumeKPIs() {
    const uptime = (Date.now() - this.startTime) / 1000;
    this.kpis.logsPerSecond = this.kpis.totalLogs / uptime;
  }
  
  getKPIReport() {
    this.updateVolumeKPIs();
    
    return {
      performance: {
        avg: this.kpis.averageLogTime.toFixed(2) + 'ms',
        p95: this.kpis.p95LogTime.toFixed(2) + 'ms',
        p99: this.kpis.p99LogTime.toFixed(2) + 'ms'
      },
      volume: {
        rps: this.kpis.logsPerSecond.toFixed(1) + ' logs/sec',
        total: this.kpis.totalLogs
      },
      health: {
        errorRate: (this.kpis.errorRate * 100).toFixed(2) + '%',
        transportFailures: this.kpis.transportFailures
      }
    };
  }
}

const kpiMonitor = new LoggerKPIMonitor();
```

## Performance Testing

### Benchmark Your Configuration

**Load testing script:**
```javascript
async function benchmarkLogger(logger, testName, iterations = 10000) {
  console.log(`\n=== ${testName} ===`);
  
  const startTime = performance.now();
  const startMemory = process.memoryUsage().heapUsed;
  
  // Warm up
  for (let i = 0; i < 100; i++) {
    logger.info('Warmup message', { iteration: i });
  }
  
  // Actual benchmark
  const benchmarkStart = performance.now();
  
  for (let i = 0; i < iterations; i++) {
    logger.info('Benchmark message', { 
      iteration: i,
      timestamp: Date.now(),
      data: 'test-data-' + i
    });
  }
  
  await logger.flush(); // Ensure all logs are processed
  
  const benchmarkEnd = performance.now();
  const endMemory = process.memoryUsage().heapUsed;
  
  const results = {
    iterations,
    totalTime: benchmarkEnd - benchmarkStart,
    avgTimePerLog: (benchmarkEnd - benchmarkStart) / iterations,
    logsPerSecond: iterations / ((benchmarkEnd - benchmarkStart) / 1000),
    memoryIncrease: (endMemory - startMemory) / 1024 / 1024, // MB
    memoryPerLog: (endMemory - startMemory) / iterations // bytes
  };
  
  console.log(`Total time: ${results.totalTime.toFixed(2)}ms`);
  console.log(`Avg per log: ${results.avgTimePerLog.toFixed(3)}ms`);
  console.log(`Logs/second: ${results.logsPerSecond.toFixed(0)}`);
  console.log(`Memory increase: ${results.memoryIncrease.toFixed(2)}MB`);
  console.log(`Memory per log: ${results.memoryPerLog.toFixed(0)} bytes`);
  
  return results;
}

// Run benchmarks
async function runBenchmarks() {
  
  // Test different configurations
  const configs = [
    {
      name: 'Basic Console',
      logger: createLogger({
        transports: [new ConsoleTransport({ enableInProduction: true })]
      })
    },
    {
      name: 'Multi-Transport',
      logger: createLogger({
        transports: [
          new ConsoleTransport({ enableInProduction: true }),
          new SendBeaconTransport({ endpoint: 'http://localhost/logs' })
        ]
      })
    },
    {
      name: 'With Error Handling',
      logger: createLogger({
        transports: [new ConsoleTransport({ enableInProduction: true })]
      }),
        globalCapture: { enabled: true }
      })
    }
  ];
  
  for (const config of configs) {
    await benchmarkLogger(config.logger, config.name);
    await config.logger.destroy();
  }
}

runBenchmarks().catch(console.error);
```

### Memory Leak Testing

**Memory leak detection:**
```javascript
function detectMemoryLeaks(logger, duration = 60000) {
  console.log('Starting memory leak detection...');
  
  const startMemory = process.memoryUsage().heapUsed;
  let maxMemory = startMemory;
  let logCount = 0;
  
  const interval = setInterval(() => {
    // Generate logs continuously
    logger.info('Memory test log', {
      count: logCount++,
      timestamp: Date.now(),
      randomData: Math.random().toString(36)
    });
    
    // Check memory usage
    const currentMemory = process.memoryUsage().heapUsed;
    maxMemory = Math.max(maxMemory, currentMemory);
    
    // Log memory stats every 10 seconds
    if (logCount % 1000 === 0) {
      const memoryMB = currentMemory / 1024 / 1024;
      console.log(`Logs: ${logCount}, Memory: ${memoryMB.toFixed(2)}MB`);
    }
  }, 10);
  
  setTimeout(async () => {
    clearInterval(interval);
    
    // Force cleanup and measure
    await logger.flush();
    if (global.gc) global.gc();
    
    const endMemory = process.memoryUsage().heapUsed;
    const memoryGrowth = (endMemory - startMemory) / 1024 / 1024;
    const maxGrowth = (maxMemory - startMemory) / 1024 / 1024;
    
    console.log('\n=== Memory Leak Detection Results ===');
    console.log(`Total logs generated: ${logCount}`);
    console.log(`Memory growth: ${memoryGrowth.toFixed(2)}MB`);
    console.log(`Max memory growth: ${maxGrowth.toFixed(2)}MB`);
    console.log(`Memory per log: ${(memoryGrowth * 1024 * 1024 / logCount).toFixed(0)} bytes`);
    
    // Determine if there's a leak
    const bytesPerLog = memoryGrowth * 1024 * 1024 / logCount;
    if (bytesPerLog > 100) { // More than 100 bytes per log retained
      console.warn('WARNING: Potential memory leak detected!');
    } else {
      console.log('OK: No significant memory leak detected');
    }
  }, duration);
}

// Usage
detectMemoryLeaks(logger, 60000); // Test for 1 minute
```

This performance tuning guide provides comprehensive strategies for optimizing lever-ui-logger in production environments. Focus on the areas most relevant to your specific use case and performance requirements.