/**
 * Custom Transport Example
 * 
 * Demonstrates creating custom transport implementations:
 * - File system transport for server-side logging
 * - Database transport for persistent log storage
 * - WebSocket transport for real-time log streaming
 * - Custom filtering and formatting logic
 * 
 * Run with: node examples/custom-transport.js
 */

import { promises as fs } from 'fs';
import { join } from 'path';
import { EventBus } from 'lever-ui-eventbus';
import { createLogger, ConsoleTransport } from 'lever-ui-logger';

console.log('🔧 Custom Transport Example\n');

/**
 * File System Transport
 * Writes logs to rotating log files with different levels
 */
class FileSystemTransport {
  constructor(config = {}) {
    this.name = 'filesystem';
    this.config = {
      logDir: './logs',
      maxFileSize: 10 * 1024 * 1024, // 10MB
      maxFiles: 5,
      enableRotation: true,
      enableCompression: false,
      ...config
    };
    
    this.currentFile = null;
    this.currentFileSize = 0;
    this.writeQueue = [];
    this.isWriting = false;
    
    this.initializeLogDirectory();
  }
  
  async initializeLogDirectory() {
    try {
      await fs.mkdir(this.config.logDir, { recursive: true });
      this.currentFile = join(this.config.logDir, `app-${this.getDateString()}.log`);
      
      // Get current file size if it exists
      try {
        const stats = await fs.stat(this.currentFile);
        this.currentFileSize = stats.size;
      } catch {
        this.currentFileSize = 0;
      }
      
      console.log(`📁 FileSystem transport initialized: ${this.currentFile}`);
    } catch (error) {
      console.error('Failed to initialize log directory:', error.message);
    }
  }
  
  write(event) {
    const logEntry = this.formatLogEntry(event);
    this.writeQueue.push(logEntry);
    this.processWriteQueue();
  }
  
  async processWriteQueue() {
    if (this.isWriting || this.writeQueue.length === 0) return;
    
    this.isWriting = true;
    
    try {
      while (this.writeQueue.length > 0) {
        const entry = this.writeQueue.shift();
        await this.writeToFile(entry);
      }
    } catch (error) {
      console.error('FileSystem transport write error:', error.message);
    } finally {
      this.isWriting = false;
    }
  }
  
  async writeToFile(entry) {
    const entrySize = Buffer.byteLength(entry, 'utf8');
    
    // Check if file rotation is needed
    if (this.config.enableRotation && 
        this.currentFileSize + entrySize > this.config.maxFileSize) {
      await this.rotateFile();
    }
    
    await fs.appendFile(this.currentFile, entry);
    this.currentFileSize += entrySize;
  }
  
  async rotateFile() {
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
    const rotatedFile = this.currentFile.replace('.log', `-${timestamp}.log`);
    
    try {
      await fs.rename(this.currentFile, rotatedFile);
      console.log(`🔄 Rotated log file: ${rotatedFile}`);
      
      this.currentFile = join(this.config.logDir, `app-${this.getDateString()}.log`);
      this.currentFileSize = 0;
      
      // Clean up old files if needed
      await this.cleanupOldFiles();
    } catch (error) {
      console.error('File rotation failed:', error.message);
    }
  }
  
  async cleanupOldFiles() {
    try {
      const files = await fs.readdir(this.config.logDir);
      const logFiles = files.filter(f => f.endsWith('.log')).sort();
      
      if (logFiles.length > this.config.maxFiles) {
        const filesToDelete = logFiles.slice(0, logFiles.length - this.config.maxFiles);
        
        for (const file of filesToDelete) {
          await fs.unlink(join(this.config.logDir, file));
          console.log(`🗑️ Deleted old log file: ${file}`);
        }
      }
    } catch (error) {
      console.error('Cleanup failed:', error.message);
    }
  }
  
  formatLogEntry(event) {
    const timestamp = new Date(event.timestamp).toISOString();
    const level = event.level.toUpperCase().padEnd(5);
    const component = event.component ? `[${event.component}]` : '';
    
    let entry = `${timestamp} ${level} ${component} ${event.message}`;
    
    if (Object.keys(event.context).length > 0) {
      entry += ` | Context: ${JSON.stringify(event.context)}`;
    }
    
    if (event.args.length > 0) {
      entry += ` | Args: ${JSON.stringify(event.args)}`;
    }
    
    return entry + '\n';
  }
  
  getDateString() {
    return new Date().toISOString().split('T')[0];
  }
  
  async flush() {
    await this.processWriteQueue();
    console.log('📁 FileSystem transport flushed');
  }
  
  async close() {
    await this.flush();
    console.log('📁 FileSystem transport closed');
  }
}

/**
 * Mock Database Transport
 * Simulates writing logs to a database with structured data
 */
class DatabaseTransport {
  constructor(config = {}) {
    this.name = 'database';
    this.config = {
      connectionString: 'postgresql://localhost:5432/logs',
      tableName: 'application_logs',
      batchSize: 100,
      flushInterval: 5000,
      enableBatching: true,
      ...config
    };
    
    this.logBuffer = [];
    this.flushTimer = null;
    this.isConnected = false;
    
    this.connect();
    this.startFlushTimer();
  }
  
  async connect() {
    // Simulate database connection
    console.log('🗄️ Connecting to database...');
    await new Promise(resolve => setTimeout(resolve, 500));
    this.isConnected = true;
    console.log('🗄️ Database transport connected');
  }
  
  write(event) {
    if (!this.isConnected) {
      console.log('⚠️ Database not connected, buffering log...');
      return;
    }
    
    const logRecord = this.formatLogRecord(event);
    
    if (this.config.enableBatching) {
      this.logBuffer.push(logRecord);
      
      if (this.logBuffer.length >= this.config.batchSize) {
        this.flushBatch();
      }
    } else {
      this.insertLogRecord(logRecord);
    }
  }
  
  formatLogRecord(event) {
    return {
      id: this.generateId(),
      timestamp: new Date(event.timestamp),
      level: event.level,
      component: event.component || null,
      logger: event.logger || null,
      message: event.message,
      context: JSON.stringify(event.context),
      args: JSON.stringify(event.args),
      created_at: new Date()
    };
  }
  
  async insertLogRecord(record) {
    // Simulate database insert
    const query = `INSERT INTO ${this.config.tableName} (id, timestamp, level, component, logger, message, context, args, created_at) VALUES (...)`;
    console.log(`🗄️ Database INSERT: [${record.level}] ${record.message}`);
  }
  
  async flushBatch() {
    if (this.logBuffer.length === 0) return;
    
    const records = [...this.logBuffer];
    this.logBuffer.length = 0;
    
    try {
      // Simulate batch insert
      console.log(`🗄️ Database BATCH INSERT: ${records.length} records`);
      records.forEach(record => {
        console.log(`   - [${record.level}] ${record.message}`);
      });
      
      // Simulate async operation
      await new Promise(resolve => setTimeout(resolve, 100));
      
    } catch (error) {
      console.error('Database batch insert failed:', error.message);
      // In a real implementation, you might want to retry or store locally
    }
  }
  
  startFlushTimer() {
    this.flushTimer = setInterval(() => {
      this.flushBatch();
    }, this.config.flushInterval);
  }
  
  generateId() {
    return Math.random().toString(36).substr(2, 9);
  }
  
  async flush() {
    await this.flushBatch();
    console.log('🗄️ Database transport flushed');
  }
  
  async close() {
    if (this.flushTimer) {
      clearInterval(this.flushTimer);
    }
    
    await this.flush();
    console.log('🗄️ Database transport disconnected');
  }
}

/**
 * Mock WebSocket Transport
 * Simulates real-time log streaming via WebSocket
 */
class WebSocketTransport {
  constructor(config = {}) {
    this.name = 'websocket';
    this.config = {
      url: 'ws://localhost:8080/logs',
      reconnectInterval: 5000,
      maxReconnectAttempts: 5,
      enableHeartbeat: true,
      heartbeatInterval: 30000,
      ...config
    };
    
    this.ws = null;
    this.isConnected = false;
    this.reconnectAttempts = 0;
    this.messageQueue = [];
    this.heartbeatTimer = null;
    
    this.connect();
  }
  
  connect() {
    console.log(`🔌 Connecting to WebSocket: ${this.config.url}`);
    
    // Simulate WebSocket connection
    setTimeout(() => {
      this.isConnected = true;
      this.reconnectAttempts = 0;
      console.log('🔌 WebSocket transport connected');
      
      // Send queued messages
      this.processMessageQueue();
      
      // Start heartbeat
      if (this.config.enableHeartbeat) {
        this.startHeartbeat();
      }
    }, 1000);
  }
  
  write(event) {
    const message = {
      type: 'log',
      timestamp: Date.now(),
      data: {
        level: event.level,
        component: event.component,
        logger: event.logger,
        message: event.message,
        context: event.context,
        args: event.args,
        originalTimestamp: event.timestamp
      }
    };
    
    if (this.isConnected) {
      this.sendMessage(message);
    } else {
      this.messageQueue.push(message);
      console.log('🔌 WebSocket not connected, queuing message...');
    }
  }
  
  sendMessage(message) {
    try {
      // Simulate WebSocket send
      console.log(`🔌 WebSocket SEND: [${message.data.level}] ${message.data.message}`);
      
      // In a real implementation:
      // this.ws.send(JSON.stringify(message));
    } catch (error) {
      console.error('WebSocket send failed:', error.message);
      this.messageQueue.push(message); // Re-queue on failure
    }
  }
  
  processMessageQueue() {
    while (this.messageQueue.length > 0 && this.isConnected) {
      const message = this.messageQueue.shift();
      this.sendMessage(message);
    }
  }
  
  startHeartbeat() {
    this.heartbeatTimer = setInterval(() => {
      if (this.isConnected) {
        this.sendMessage({
          type: 'heartbeat',
          timestamp: Date.now()
        });
      }
    }, this.config.heartbeatInterval);
  }
  
  simulateDisconnect() {
    if (this.heartbeatTimer) {
      clearInterval(this.heartbeatTimer);
    }
    
    this.isConnected = false;
    console.log('🔌 WebSocket disconnected, attempting reconnect...');
    
    if (this.reconnectAttempts < this.config.maxReconnectAttempts) {
      this.reconnectAttempts++;
      setTimeout(() => this.connect(), this.config.reconnectInterval);
    } else {
      console.log('🔌 Max reconnect attempts reached, giving up');
    }
  }
  
  async flush() {
    this.processMessageQueue();
    console.log('🔌 WebSocket transport flushed');
  }
  
  async close() {
    if (this.heartbeatTimer) {
      clearInterval(this.heartbeatTimer);
    }
    
    this.isConnected = false;
    console.log('🔌 WebSocket transport closed');
  }
}

/**
 * Filtered Transport
 * Wraps another transport and applies filtering logic
 */
class FilteredTransport {
  constructor(baseTransport, filterConfig = {}) {
    this.name = `filtered-${baseTransport.name}`;
    this.baseTransport = baseTransport;
    this.config = {
      minLevel: 'info',
      excludeComponents: [],
      includeComponents: [],
      maxMessageLength: 1000,
      filterFunction: null,
      ...filterConfig
    };
    
    this.levelOrder = { trace: 0, debug: 1, info: 2, warn: 3, error: 4 };
  }
  
  write(event) {
    if (!this.shouldLog(event)) {
      return;
    }
    
    // Apply message truncation if needed
    const processedEvent = this.processEvent(event);
    
    this.baseTransport.write(processedEvent);
  }
  
  shouldLog(event) {
    // Level filtering
    if (this.levelOrder[event.level] < this.levelOrder[this.config.minLevel]) {
      return false;
    }
    
    // Component filtering
    if (this.config.excludeComponents.includes(event.component)) {
      return false;
    }
    
    if (this.config.includeComponents.length > 0 && 
        !this.config.includeComponents.includes(event.component)) {
      return false;
    }
    
    // Custom filter function
    if (this.config.filterFunction && !this.config.filterFunction(event)) {
      return false;
    }
    
    return true;
  }
  
  processEvent(event) {
    const processedEvent = { ...event };
    
    // Truncate long messages
    if (processedEvent.message.length > this.config.maxMessageLength) {
      processedEvent.message = processedEvent.message.substring(0, this.config.maxMessageLength) + '...';
    }
    
    return processedEvent;
  }
  
  async flush() {
    if (this.baseTransport.flush) {
      await this.baseTransport.flush();
    }
  }
  
  async close() {
    if (this.baseTransport.close) {
      await this.baseTransport.close();
    }
  }
}

// Demo function
async function runCustomTransportDemo() {
  try {
    console.log('🚀 Initializing custom transports...\n');
    
    // Initialize EventBus
    const eventBus = new EventBus();
    
    // Create custom transports
    const fileTransport = new FileSystemTransport({
      logDir: './demo-logs',
      maxFileSize: 1024 * 1024, // 1MB for demo
      maxFiles: 3
    });
    
    const dbTransport = new DatabaseTransport({
      batchSize: 5, // Small batch for demo
      flushInterval: 3000
    });
    
    const wsTransport = new WebSocketTransport({
      url: 'ws://localhost:8080/logs'
    });
    
    // Create filtered console transport (warnings and errors only)
    const filteredConsole = new FilteredTransport(
      new ConsoleTransport({ format: 'compact' }),
      {
        minLevel: 'warn',
        filterFunction: (event) => !event.message.includes('filtered-out')
      }
    );
    
    // Create logger with all custom transports
    const logger = createLogger(eventBus, {
      level: 'debug',
      component: 'custom-transport-demo',
      defaultContext: {
        demo: true,
        version: '1.0.0'
      },
      transports: [
        new ConsoleTransport({ format: 'pretty', colors: true }), // Standard console
        fileTransport,
        dbTransport,
        wsTransport,
        filteredConsole
      ]
    });
    
    console.log('✅ Logger created with 5 transports\n');
    
    // Demonstrate logging to all transports
    console.log('--- Logging to All Transports ---');
    
    logger.debug('Debug message for development', { debugInfo: 'detailed-data' });
    logger.info('User action completed', { userId: '123', action: 'login' });
    logger.warn('Warning: high memory usage', { usage: '85%', threshold: '80%' });
    logger.error('Database connection failed', { host: 'localhost', error: 'ECONNREFUSED' });
    
    // Test message that will be filtered out
    logger.info('This message contains filtered-out text and should not appear in filtered transport');
    
    console.log('');
    
    // Test metrics
    logger.metric('custom_transport_demo', {
      transports: 5,
      messages: 4,
      success: true
    });
    
    // Wait for async operations
    console.log('Waiting for async operations...');
    await new Promise(resolve => setTimeout(resolve, 4000));
    
    // Test file rotation (generate large message)
    console.log('\n--- Testing File Rotation ---');
    const largeMessage = 'Large message: ' + 'x'.repeat(500000); // 500KB message
    logger.info(largeMessage, { test: 'file-rotation' });
    
    await new Promise(resolve => setTimeout(resolve, 2000));
    
    // Simulate WebSocket disconnect and reconnect
    console.log('\n--- Testing WebSocket Reconnection ---');
    wsTransport.simulateDisconnect();
    
    await new Promise(resolve => setTimeout(resolve, 6000));
    
    // More logging after reconnect
    logger.info('Message after WebSocket reconnection', { reconnect: true });
    
    // Force flush all transports
    console.log('\n--- Flushing All Transports ---');
    await logger.flush();
    
    console.log('\n--- Demo Complete ---');
    console.log('✅ Custom transports demonstrated successfully');
    console.log('📁 Check ./demo-logs/ directory for log files');
    console.log('🗄️ Database records were simulated (see console output)');
    console.log('🔌 WebSocket messages were simulated (see console output)');
    
    // Clean up
    await logger.destroy();
    
    console.log('🧹 All transports cleaned up');
    
  } catch (error) {
    console.error('Demo failed:', error);
    process.exit(1);
  }
}

// Start the demo
runCustomTransportDemo().catch(console.error);

// Handle graceful shutdown
process.on('SIGINT', async () => {
  console.log('\n🛑 Shutting down gracefully...');
  process.exit(0);
});

process.on('SIGTERM', async () => {
  console.log('\n🛑 Terminating gracefully...');
  process.exit(0);
});