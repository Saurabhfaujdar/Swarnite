import request from 'supertest';
import bcrypt from 'bcryptjs';

// ── Mock Prisma before importing app ──────────────────────
import mockPrisma from './__mocks__/prisma';
jest.mock('../../server/prisma', () => ({
  prisma: mockPrisma,
}));

import app from '../../server/app';

// ── Dummy data ─────────────────────────────────────────────
const DUMMY_BRANCH = {
  id: 1, name: 'Main Branch', code: 'BR01',
  address: '123 Jewel St', city: 'Mumbai',
  state: 'Maharashtra', pincode: '400001',
  phone: '022-12345678', isActive: true,
};

const DUMMY_HASHED_PASSWORD = bcrypt.hashSync('Admin@123', 10);

const DUMMY_USER = {
  id: 1, username: 'admin', password: DUMMY_HASHED_PASSWORD,
  fullName: 'Admin User', role: 'ADMIN',
  branchId: 1, isActive: true, branch: DUMMY_BRANCH,
};

// ── Reset mocks between tests ──────────────────────────────
beforeEach(() => {
  jest.clearAllMocks();
});

// ════════════════════════════════════════════════════════════
// AUTH ROUTES
// ════════════════════════════════════════════════════════════
describe('POST /api/auth/login', () => {
  it('returns a token and user on valid credentials', async () => {
    mockPrisma.user.findUnique.mockResolvedValueOnce(DUMMY_USER);

    const res = await request(app)
      .post('/api/auth/login')
      .send({ username: 'admin', password: 'Admin@123' });

    expect(res.status).toBe(200);
    expect(res.body).toHaveProperty('token');
    expect(res.body.user).toMatchObject({
      id: 1,
      username: 'admin',
      fullName: 'Admin User',
      role: 'ADMIN',
    });
  });

  it('returns 401 for wrong password', async () => {
    mockPrisma.user.findUnique.mockResolvedValueOnce(DUMMY_USER);

    const res = await request(app)
      .post('/api/auth/login')
      .send({ username: 'admin', password: 'WrongPassword' });

    expect(res.status).toBe(401);
    expect(res.body).toEqual({ error: 'Invalid credentials' });
  });

  it('returns 401 for non-existent user', async () => {
    mockPrisma.user.findUnique.mockResolvedValueOnce(null);

    const res = await request(app)
      .post('/api/auth/login')
      .send({ username: 'ghost', password: 'whatever' });

    expect(res.status).toBe(401);
    expect(res.body).toEqual({ error: 'Invalid credentials' });
  });

  it('returns 401 for inactive user', async () => {
    mockPrisma.user.findUnique.mockResolvedValueOnce({ ...DUMMY_USER, isActive: false });

    const res = await request(app)
      .post('/api/auth/login')
      .send({ username: 'admin', password: 'Admin@123' });

    expect(res.status).toBe(401);
  });
});

describe('POST /api/auth/register', () => {
  it('creates a new user and returns 201', async () => {
    mockPrisma.user.create.mockResolvedValueOnce({
      id: 2, username: 'newuser', fullName: 'New User',
    });

    const res = await request(app)
      .post('/api/auth/register')
      .send({
        username: 'newuser',
        password: 'Pass@123',
        fullName: 'New User',
        role: 'SALES',
        branchId: 1,
      });

    expect(res.status).toBe(201);
    expect(res.body).toMatchObject({ username: 'newuser', fullName: 'New User' });
  });

  it('returns 409 for duplicate username', async () => {
    mockPrisma.user.create.mockRejectedValueOnce({ code: 'P2002' });

    const res = await request(app)
      .post('/api/auth/register')
      .send({
        username: 'admin',
        password: 'Admin@123',
        fullName: 'Admin',
        role: 'ADMIN',
        branchId: 1,
      });

    expect(res.status).toBe(409);
    expect(res.body).toEqual({ error: 'Username already exists' });
  });
});

describe('GET /api/auth/me', () => {
  it('returns user info for a valid token', async () => {
    // First login to get a token
    mockPrisma.user.findUnique.mockResolvedValueOnce(DUMMY_USER);

    const loginRes = await request(app)
      .post('/api/auth/login')
      .send({ username: 'admin', password: 'Admin@123' });

    const token = loginRes.body.token;

    // Now call /me with the token
    mockPrisma.user.findUnique.mockResolvedValueOnce({
      id: 1, username: 'admin', fullName: 'Admin User',
      role: 'ADMIN', branch: DUMMY_BRANCH, branchId: 1,
    });

    const res = await request(app)
      .get('/api/auth/me')
      .set('Authorization', `Bearer ${token}`);

    expect(res.status).toBe(200);
    expect(res.body).toHaveProperty('username', 'admin');
  });

  it('returns 401 without a token', async () => {
    const res = await request(app).get('/api/auth/me');
    expect(res.status).toBe(401);
    expect(res.body).toEqual({ error: 'No token' });
  });

  it('returns 401 for an invalid token', async () => {
    const res = await request(app)
      .get('/api/auth/me')
      .set('Authorization', 'Bearer totally.invalid.token');

    expect(res.status).toBe(401);
  });
});
