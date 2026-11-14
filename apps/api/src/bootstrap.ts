import type { NestExpressApplication } from '@nestjs/platform-express';

export function configureApp(app: NestExpressApplication): void {
  // LiveKit signs webhooks sent as application/webhook+json; the default JSON
  // parser ignores that content type and leaves the raw body unavailable.
  app.useBodyParser('json', { type: ['application/json', 'application/webhook+json'] });
}
