# Lever UI Logger - Interactive Demo

A clean, modern interactive demonstration of the lever-ui-logger library features.

## Features Demonstrated

### Core Logging
- **Multiple Log Levels**: Trace, Debug, Info, Warn, Error
- **Contextual Logging**: Add structured context to any log
- **Component-based Logging**: Organize logs by application component
- **Real-time Configuration**: Change settings on the fly

### Privacy & Security
- **PII Redaction**: Automatic detection and redaction of sensitive data
  - Email addresses
  - Phone numbers
  - Social Security Numbers
  - Credit card numbers
  - Sensitive field names (password, userId, etc.)

### Performance
- **Sampling**: Reduce log volume with configurable sampling rates
- **Level Filtering**: Control minimum log level
- **Performance Testing**: Run rapid logging tests to see throughput

### Metrics
- **Structured Metrics**: Track application metrics separately from logs
- **Performance Metrics**: Measure and log performance data

## How to Use

### Running the Demo

  Using Node.js
  ```
   npx http-server demo
   ```

### Interactive Controls

#### Configuration Panel (Left Sidebar)

1. **Log Level**: Set the minimum log level to display
2. **Component Name**: Change the component identifier for logs
3. **Features**:
   - PII Redaction: Toggle automatic data sanitization
   - Sampling: Enable 50% sampling for info/debug logs
   - Context Logging: Include context data with logs

#### Logging Controls

1. **Message Field**: Enter custom log messages
2. **Context Field**: Add JSON context data to logs
3. **Quick Log Buttons**: Log at different levels instantly

#### Demo Scenarios

- **User Journey**: Simulates a typical user session with various log levels
- **Simulate Error**: Demonstrates error handling and recovery logging
- **Performance Test**: Runs 100 rapid logs to test throughput

#### View Modes

- **Console Output**: Formatted, colored log display
- **Raw JSON**: See the raw log data structure
- **Network**: View simulated network transport activity

### Statistics

The demo tracks:
- Total number of logs
- Error count
- Metrics count

## Design Features

### Modern, Clean Interface
- **Gradient Background**: Eye-catching purple gradient
- **Card-based Layout**: Clean separation of controls and output
- **Responsive Design**: Works on desktop and mobile devices
- **Color-coded Logs**: Different colors for each log level

### Professional Styling
- **System Font Stack**: Native fonts for best performance
- **Subtle Shadows**: Depth without being heavy
- **Smooth Transitions**: Polish interactions
- **Accessible Colors**: Good contrast ratios

## Architecture

The demo uses the actual lever-ui-logger library with:
- Real logger implementation from the dist bundle
- Custom DemoConsoleTransport for UI display
- Actual PII redaction from the library
- Real sampling and filtering logic
- Native context inheritance
- Live statistics tracking

## Customization

To customize the demo:

1. **Modify Styles**: Update CSS variables in the `:root` selector
2. **Add Features**: Extend the `DemoLogger` class
3. **Add Scenarios**: Create new demo functions
4. **Change Layout**: Modify the grid structure

## Browser Support

- Chrome 90+
- Firefox 88+
- Safari 14+
- Edge 90+

## Implementation Details

This demo uses the actual lever-ui-logger library from the dist folder. The library is loaded as an ES module and configured with a custom transport that displays logs in the UI while also logging to the browser console.

```javascript
import { createLogger, ConsoleTransport } from 'lever-ui-logger';

const logger = createLogger({
  level: 'info',
  component: 'my-app',
  transports: [new ConsoleTransport()]
});
```

## License

MIT