
import { createLogger, format, transports } from 'winston';

export default createLogger({
  level: 'info',
  format: format.combine(
    format.timestamp(),
    // format.align(),
    format.errors({ stack: true }),
    format.prettyPrint(),
  ),
  defaultMeta: { service: 'brconnector' },
  transports: [
    new transports.File({ filename: '/tmp/combined.log' }),
    new transports.Console({
      format: format.splat(),
    })
  ],
});
