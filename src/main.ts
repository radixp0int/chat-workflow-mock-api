import 'reflect-metadata';
import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module.js';
import { readPort } from './common/config.js';
async function bootstrap() {
  const app = await NestFactory.create(AppModule);
  app.enableShutdownHooks();
  try {
    await app.listen(readPort('PORT', 3000));
  } catch (error) {
    await app.close();
    throw error;
  }
}
bootstrap().catch((error: unknown) => {
  console.error(error);
  process.exitCode = 1;
});
