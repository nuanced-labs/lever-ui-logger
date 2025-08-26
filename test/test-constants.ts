/**
 * Shared constants for test files to avoid string duplication
 */

export const TEST_CONSTANTS = {
  // Logger Names
  LOGGER_NAMES: {
    DEFAULT: 'default',
    TEST_LOGGER: 'test-logger',
    CHILD_LOGGER: 'child-logger',
    PARENT_LOGGER: 'parent-logger',
    USER_SERVICE: 'user-service',
    AUTH_SERVICE: 'auth-service',
    API_LOGGER: 'api-logger'
  },

  // Component Names
  COMPONENTS: {
    TEST_COMPONENT: 'test-component',
    PARENT_SERVICE: 'parent-service',
    CHILD_SERVICE: 'child-service',
    USER_SERVICE: 'user-service',
    AUTH_SERVICE: 'auth-service',
    ANALYTICS: 'analytics',
    METRICS_COLLECTOR: 'metrics-collector',
    ERROR_TRACKER: 'error-tracker',
    HEALTH_CHECK: 'health-check',
    RATE_LIMITER: 'rate-limiter',
    EVENTBUS_INTEGRATION: 'eventbus-integration',
    LIFECYCLE_TEST: 'lifecycle-test',
    PII_TEST: 'pii-test',
    CONCURRENT_1: 'concurrent-1',
    CONCURRENT_2: 'concurrent-2',
    INTEGRATION_TEST: 'integration-test'
  },

  // Log Levels
  LEVELS: {
    TRACE: 'trace' as const,
    DEBUG: 'debug' as const,
    INFO: 'info' as const,
    WARN: 'warn' as const,
    ERROR: 'error' as const
  },

  // Common Messages
  MESSAGES: {
    TEST_MESSAGE: 'Test message',
    DEBUG_MESSAGE: 'Debug message',
    INFO_MESSAGE: 'Info message',
    WARN_MESSAGE: 'Warn message',
    ERROR_MESSAGE: 'Error message',
    TRACE_MESSAGE: 'Trace message',
    SAMPLE_MESSAGE: 'Sample message',
    USER_ACTION: 'User action completed',
    PROCESSING_DATA: 'Processing user data',
    CONNECTION_ERROR: 'Connection error',
    VALIDATION_FAILED: 'Validation failed',
    OPERATION_SUCCESS: 'Operation completed successfully',
    SERVICE_STARTED: 'Service started',
    REQUEST_PROCESSED: 'Request processed',
    CHILD_LOGGER_MESSAGE: 'Child logger message',
    SIMPLE_TEST_MESSAGE: 'Simple test message',
    INTEGRATION_TEST_MESSAGE: 'Integration test message',
    CONCURRENT_MESSAGE: 'Concurrent message',
    ERROR_OCCURRED: 'Error occurred',
    TEST_AFTER_EVENTBUS_FAILURE: 'Test after EventBus failure'
  },

  // Transport Names
  TRANSPORT_NAMES: {
    MOCK_TRANSPORT: 'mock-transport',
    TEST_TRANSPORT: 'test-transport',
    MOCK_1: 'mock-1',
    MOCK_2: 'mock-2',
    CONSOLE_TRANSPORT: 'console-transport',
    SENDBEACON_TRANSPORT: 'sendbeacon-transport',
    EVENTBUS_TRANSPORT: 'eventbus-transport',
    FAILING_TRANSPORT: 'failing-transport',
    WORKING_TRANSPORT: 'working-transport',
    BENCHMARK_TRANSPORT: 'benchmark-transport',
    NOOP_TRANSPORT: 'noop-transport',
    PERFORMANCE_TRANSPORT: 'performance-transport'
  },

  // Context Data
  CONTEXT: {
    USER_ID: 'user-123',
    SESSION_ID: 'session-456',
    REQUEST_ID: 'req-789',
    CUSTOMER_ID: 'cust-67890',
    TRACE_ID: 'trace-abc123',
    CORRELATION_ID: 'corr-def456'
  },

  // Error Messages
  ERROR_MESSAGES: {
    TEST_ERROR_MESSAGE: 'Test error message',
    CONNECTION_FAILED: 'Connection failed',
    VALIDATION_ERROR: 'Validation error',
    TIMEOUT_ERROR: 'Timeout error',
    NETWORK_ERROR: 'Network error',
    EVENTBUS_FAILED: 'EventBus failed',
    TRANSPORT_FAILED: 'Transport failed',
    SYNC_WRITE_FAILED: 'Sync write failed',
    ASYNC_WRITE_FAILED: 'Async write failed',
    TRANSPORT_CLOSE_FAILED: 'Transport close failed'
  },

  // Metric Names
  METRIC_NAMES: {
    PAGE_LOAD_TIME: 'page_load_time',
    API_RESPONSE_TIME: 'api_response_time',
    USER_INTERACTION: 'user_interaction',
    ERROR_RATE: 'error_rate',
    MEMORY_USAGE: 'memory_usage'
  },

  // Field Names for Context
  FIELD_NAMES: {
    DURATION: 'duration',
    USER_ID: 'userId',
    SESSION_ID: 'sessionId',
    REQUEST_ID: 'requestId',
    ENDPOINT: 'endpoint',
    METHOD: 'method',
    STATUS_CODE: 'statusCode',
    ERROR_CODE: 'errorCode',
    LOCATION: 'location'
  },

  // Common Values
  VALUES: {
    VERSION: '1.0.0',
    ENVIRONMENT_DEV: 'development',
    ENVIRONMENT_PROD: 'production',
    ENVIRONMENT_TEST: 'test',
    PORT: 3000,
    TIMEOUT_MS: 5000,
    BATCH_SIZE: 100,
    RETRY_COUNT: 3
  },

  // PII Test Data
  PII_DATA: {
    EMAIL: 'sensitive@example.com',
    PHONE: '+1-555-123-4567',
    SSN: '123-45-6789',
    CREDIT_CARD: '4111-1111-1111-1111',
    API_KEY: 'sk_live_abcdef123456789',
    JWT_TOKEN: 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiIxMjM0NTY3ODkwIiwibmFtZSI6IkpvaG4gRG9lIiwiaWF0IjoxNTE2MjM5MDIyfQ.SflKxwRJSMeKKF2QT4fwpMeJf36POk6yJV_adQssw5c'
  },

  // Redacted Values
  REDACTED_VALUES: {
    EMAIL: '<email>',
    PHONE: '<phone>',
    SSN: '<ssn>',
    CREDIT_CARD: '<credit-card>',
    API_KEY: '<api-key>',
    JWT_TOKEN: '<jwt>',
    GENERIC: '<redacted>'
  },

  // URLs and Endpoints
  URLS: {
    API_ENDPOINT: '/api/logs',
    HEALTH_CHECK: '/health',
    METRICS_ENDPOINT: '/metrics',
    HOME_PAGE: '/home',
    LOGIN_PAGE: '/login'
  }
} as const;

// Type helpers for better type safety
export type LogLevel = typeof TEST_CONSTANTS.LEVELS[keyof typeof TEST_CONSTANTS.LEVELS];
export type ComponentName = typeof TEST_CONSTANTS.COMPONENTS[keyof typeof TEST_CONSTANTS.COMPONENTS];
export type LoggerName = typeof TEST_CONSTANTS.LOGGER_NAMES[keyof typeof TEST_CONSTANTS.LOGGER_NAMES];
export type TransportName = typeof TEST_CONSTANTS.TRANSPORT_NAMES[keyof typeof TEST_CONSTANTS.TRANSPORT_NAMES];