import pino from 'pino';
import pretty from 'pino-pretty';

// Determine if we are in a development environment
const isDevelopment = process.env.NODE_ENV !== 'production';

let stream;
let logger;

if (isDevelopment) {
  // In development, create a pretty stream that writes to stderr.
  // We write to stderr because stdout is often captured by other tools
  // like Genkit's OpenTelemetry instrumentation. stderr is less likely
  // to be captured, ensuring logs are visible in the terminal.
  stream = pretty({
    colorize: true,
    translateTime: 'SYS:standard',
    ignore: 'pid,hostname',
    destination: 2 // process.stderr
  });
  logger = pino({ level: process.env.LOG_LEVEL || 'info' }, stream);
} else {
  // In production, create a standard JSON logger that writes to stdout.
  logger = pino({ level: process.env.LOG_LEVEL || 'info' });
}

// Add a startup log to verify the logger is working immediately on import.
logger.info('Logger initialized. Log level: %s', process.env.NODE_ENV);


export default logger;