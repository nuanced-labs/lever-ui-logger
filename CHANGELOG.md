# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [0.1.0] - 2025-08-25

### Initial Release - Modern Logging Architecture

Initial release of lever-ui-logger, a modern logging and error handling library with zero dependencies and optional EventBus integration.

### Core Features

#### Zero Dependencies Logger
- **Modern Factory Function**: Simple `createLogger(config)` API
- **Multiple Transports**: Console, SendBeacon, and custom transport support  
- **Contextual Logging**: Child loggers with inherited context via `withContext()`
- **Log Levels**: trace, debug, info, warn, error with configurable minimum levels
- **Component-Specific Levels**: Different log levels per component
- **Structured Metrics**: `metric(name, fields)` for analytics and monitoring
- **Sampling Configuration**: Per-level sampling rates for performance optimization

#### Built-in Privacy Protection
- **PII Redaction**: Automatic detection and redaction of sensitive data
- **Configurable Modes**: strict, balanced, permissive, off
- **Custom Patterns**: User-defined regex patterns for domain-specific PII
- **Field Name Detection**: Automatic redaction based on field names (email, phone, etc.)
- **Performance Optimized**: Efficient redaction with configurable warnings

#### Transport System
- **ConsoleTransport**: Rich console output with colors, timestamps, and formatting
- **SendBeaconTransport**: Reliable telemetry delivery for production
- **EventBusTransport**: Optional EventBus integration for cross-library coordination
- **Custom Transports**: Extensible transport interface for any destination

#### Error Handling System
- **Global Error Capture**: Automatic unhandled error and rejection capture
- **Error Categorization**: Intelligent classification (NETWORK, JAVASCRIPT, etc.)
- **Severity Assessment**: CRITICAL, HIGH, MEDIUM, LOW severity levels
- **Source Map Resolution**: Enhanced stack traces with source map support
- **Rate Limiting**: Sophisticated rate limiting to prevent error spam
- **Recovery Strategies**: Automatic retry, fallback, and circuit breaker patterns

### Architecture

Modern component-based design featuring:
- **Zero Dependencies**: Works completely independently
- **Optional EventBus**: Add via `EventBusTransport` when cross-library coordination is needed
- **Modular Components**: Specialized components (TransportRegistry, LoggerConfiguration, ContextManager, RedactionEngine)
- **Performance First**: Optimized for speed, memory usage, and bundle size
- **Type-Safe**: Full TypeScript support with comprehensive type definitions

### Performance Characteristics

- **Memory Usage**: Efficient memory management with minimal overhead
- **Logging Speed**: <1ms average per log operation
- **Bundle Size**: Core logger ~8KB, complete bundle ~25KB (gzipped)
- **Zero Runtime Dependencies**: No external dependencies required
- **High Throughput**: Handles 1000+ logs/second efficiently

### Testing & Quality Assurance

- **Unit Tests**: Comprehensive component-level testing
- **Integration Tests**: 34 tests validating complete functionality (97%+ coverage)  
- **Performance Tests**: 9 benchmarks measuring speed and memory usage
- **End-to-End Tests**: 13 scenarios covering real-world usage patterns
- **Bundle Tests**: Size monitoring and tree-shaking validation

### Production Ready

This release provides:
- Robust error handling and transport isolation
- Excellent performance characteristics  
- Comprehensive PII protection
- Modern, TypeScript-first API design
- Zero external dependencies
- Optional EventBus integration when needed

### Quick Start

```typescript
import { createLogger, ConsoleTransport } from 'lever-ui-logger';

// Create logger
const logger = createLogger({
  level: 'info',
  component: 'my-app',
  transports: [new ConsoleTransport({ colors: true })]
});

// Start logging
logger.info('Application started', { port: 3000 });
logger.error('Something went wrong', { error: 'details' });
logger.metric('response_time', { duration: 125, endpoint: '/api' });
```

For complete documentation and examples, see [README.md](./README.md) and [docs/api.md](./docs/api.md).

---

**Note**: This project follows semantic versioning. Future releases will maintain backward compatibility within major versions.


