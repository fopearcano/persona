import { buildApp } from './app.js';
import { settleBackground } from './context.js';

const { app, ctx } = await buildApp({ logger: true });

const shutdown = async (signal: string) => {
  app.log.info(`${signal}: arresto in corso…`);
  try {
    await Promise.race([settleBackground(ctx), new Promise((r) => setTimeout(r, 5000))]);
    await app.close();
  } finally {
    process.exit(0);
  }
};
process.on('SIGINT', () => void shutdown('SIGINT'));
process.on('SIGTERM', () => void shutdown('SIGTERM'));

try {
  await app.listen({ host: ctx.config.host, port: ctx.config.port });
  app.log.info(`PERSONA in ascolto su http://${ctx.config.host}:${ctx.config.port} — dati: ${ctx.config.dataDir}`);
  if (!ctx.config.webDistDir && ctx.config.production) {
    app.log.warn('Build del frontend non trovata: eseguire "npm run build" nella root del progetto.');
  }
} catch (err) {
  app.log.error(err);
  process.exit(1);
}
