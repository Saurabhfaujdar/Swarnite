import request from 'supertest';

// ── Mock Prisma before importing app ──────────────────────
import mockPrisma from './__mocks__/prisma';
jest.mock('../../server/prisma', () => ({
  prisma: mockPrisma,
}));

import app from '../../server/app';

// ── Reset mocks ────────────────────────────────────────────
beforeEach(() => {
  jest.clearAllMocks();
});

// ════════════════════════════════════════════════════════════
// HEALTH CHECK
// ════════════════════════════════════════════════════════════
describe('GET /api/health', () => {
  it('returns status ok and a timestamp', async () => {
    const res = await request(app).get('/api/health');

    expect(res.status).toBe(200);
    expect(res.body).toHaveProperty('status', 'ok');
    expect(res.body).toHaveProperty('timestamp');
    // timestamp should be a valid ISO-8601 string
    expect(new Date(res.body.timestamp).toISOString()).toBe(res.body.timestamp);
  });
});

// ════════════════════════════════════════════════════════════
// NON-EXISTENT ROUTES
// ════════════════════════════════════════════════════════════
describe('Unknown route', () => {
  it('returns 404 for a non-existent GET route', async () => {
    const res = await request(app).get('/api/non-existent');
    // Express default 404
    expect(res.status).toBe(404);
  });

  it('returns 404 for a non-existent POST route', async () => {
    const res = await request(app).post('/api/does-not-exist').send({});
    expect(res.status).toBe(404);
  });
});
