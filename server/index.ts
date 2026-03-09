// Re-export prisma for backward compat (routes import from here)
export { prisma } from './prisma';
import app from './app';

const PORT = process.env.PORT || 3001;

// Only start the server when run directly (not during tests)
if (process.env.NODE_ENV !== 'test') {
  app.listen(PORT, () => {
    console.log(`JewelERP API running on http://localhost:${PORT}`);
  });
}

export default app;
