import request from 'supertest';

// ── Mock Prisma before importing app ──────────────────────
import mockPrisma from './__mocks__/prisma';
jest.mock('../../server/prisma', () => ({
  prisma: mockPrisma,
}));

import app from '../../server/app';

// ── Mock global fetch for external GST APIs ───────────────
const originalFetch = global.fetch;
let mockFetchImpl: jest.Mock;

beforeEach(() => {
  jest.clearAllMocks();
  // Default: both external APIs fail (network error) → format-based fallback
  mockFetchImpl = jest.fn().mockRejectedValue(new Error('Network error'));
  global.fetch = mockFetchImpl;
});

afterAll(() => {
  global.fetch = originalFetch;
});

// ── Valid GSTIN samples for testing ────────────────────────
const VALID_GSTIN_UP = '09AAACH7409R1ZZ';       // Uttar Pradesh
const VALID_GSTIN_MH = '27AABCG1234H1Z5';       // Maharashtra
const VALID_GSTIN_KA = '29AABCP1234E1Z3';       // Karnataka
const VALID_GSTIN_DL = '07AAECR4582M1ZK';       // Delhi
const VALID_GSTIN_GJ = '24AADCB2230M1Z3';       // Gujarat

// ════════════════════════════════════════════════════════════
// POST /api/accounts/gstin-search
// ════════════════════════════════════════════════════════════

describe('POST /api/accounts/gstin-search', () => {
  // ─── Validation ──────────────────────────────────────────
  describe('input validation', () => {
    it('rejects empty body', async () => {
      const res = await request(app)
        .post('/api/accounts/gstin-search')
        .send({});

      expect(res.status).toBe(400);
      expect(res.body.error).toBe('GSTIN number is required');
    });

    it('rejects missing gstin field', async () => {
      const res = await request(app)
        .post('/api/accounts/gstin-search')
        .send({ gst: '09AAACH7409R1ZZ' });

      expect(res.status).toBe(400);
      expect(res.body.error).toBe('GSTIN number is required');
    });

    it('rejects null gstin', async () => {
      const res = await request(app)
        .post('/api/accounts/gstin-search')
        .send({ gstin: null });

      expect(res.status).toBe(400);
      expect(res.body.error).toBe('GSTIN number is required');
    });

    it('rejects numeric gstin', async () => {
      const res = await request(app)
        .post('/api/accounts/gstin-search')
        .send({ gstin: 123456789012345 });

      expect(res.status).toBe(400);
      expect(res.body.error).toBe('GSTIN number is required');
    });

    it('rejects gstin shorter than 15 characters', async () => {
      const res = await request(app)
        .post('/api/accounts/gstin-search')
        .send({ gstin: '09AAACH7409R' });

      expect(res.status).toBe(400);
      expect(res.body.error).toContain('Invalid GSTIN format');
    });

    it('rejects gstin with invalid format', async () => {
      const res = await request(app)
        .post('/api/accounts/gstin-search')
        .send({ gstin: 'ABCDEFGHIJKLMNO' });

      expect(res.status).toBe(400);
      expect(res.body.error).toContain('Invalid GSTIN format');
    });

    it('rejects gstin with lowercase letters', async () => {
      // Should auto-uppercase, but pattern ZZ position must be 'Z'
      const res = await request(app)
        .post('/api/accounts/gstin-search')
        .send({ gstin: '09aaach7409r1zz' });

      // Uppercased → 09AAACH7409R1ZZ → valid
      expect(res.status).toBe(200);
    });

    it('rejects gstin with special characters', async () => {
      const res = await request(app)
        .post('/api/accounts/gstin-search')
        .send({ gstin: '09-AACH7409R1ZZ' });

      expect(res.status).toBe(400);
      expect(res.body.error).toContain('Invalid GSTIN format');
    });

    it('rejects gstin where 13th char is not Z', async () => {
      const res = await request(app)
        .post('/api/accounts/gstin-search')
        .send({ gstin: '09AAACH7409R1X5' });

      expect(res.status).toBe(400);
      expect(res.body.error).toContain('Invalid GSTIN format');
    });
  });

  // ─── Format-based extraction (APIs down) ─────────────────
  describe('format-based extraction (when external APIs fail)', () => {
    it('extracts PAN from GSTIN characters 3-12', async () => {
      mockPrisma.account.findFirst.mockResolvedValueOnce(null);

      const res = await request(app)
        .post('/api/accounts/gstin-search')
        .send({ gstin: VALID_GSTIN_UP });

      expect(res.status).toBe(200);
      expect(res.body.pan).toBe('AAACH7409R');
    });

    it('extracts state code and maps to Uttar Pradesh for 09', async () => {
      mockPrisma.account.findFirst.mockResolvedValueOnce(null);

      const res = await request(app)
        .post('/api/accounts/gstin-search')
        .send({ gstin: VALID_GSTIN_UP });

      expect(res.body.stateCode).toBe('09');
      expect(res.body.stateName).toBe('Uttar Pradesh');
    });

    it('maps state code 27 to Maharashtra', async () => {
      mockPrisma.account.findFirst.mockResolvedValueOnce(null);

      const res = await request(app)
        .post('/api/accounts/gstin-search')
        .send({ gstin: VALID_GSTIN_MH });

      expect(res.body.stateCode).toBe('27');
      expect(res.body.stateName).toBe('Maharashtra');
    });

    it('maps state code 29 to Karnataka', async () => {
      mockPrisma.account.findFirst.mockResolvedValueOnce(null);

      const res = await request(app)
        .post('/api/accounts/gstin-search')
        .send({ gstin: VALID_GSTIN_KA });

      expect(res.body.stateCode).toBe('29');
      expect(res.body.stateName).toBe('Karnataka');
    });

    it('maps state code 07 to Delhi', async () => {
      mockPrisma.account.findFirst.mockResolvedValueOnce(null);

      const res = await request(app)
        .post('/api/accounts/gstin-search')
        .send({ gstin: VALID_GSTIN_DL });

      expect(res.body.stateCode).toBe('07');
      expect(res.body.stateName).toBe('Delhi');
    });

    it('maps state code 24 to Gujarat', async () => {
      mockPrisma.account.findFirst.mockResolvedValueOnce(null);

      const res = await request(app)
        .post('/api/accounts/gstin-search')
        .send({ gstin: VALID_GSTIN_GJ });

      expect(res.body.stateCode).toBe('24');
      expect(res.body.stateName).toBe('Gujarat');
    });

    it('returns valid=true when format is correct', async () => {
      mockPrisma.account.findFirst.mockResolvedValueOnce(null);

      const res = await request(app)
        .post('/api/accounts/gstin-search')
        .send({ gstin: VALID_GSTIN_UP });

      expect(res.body.valid).toBe(true);
      expect(res.body.gstin).toBe(VALID_GSTIN_UP);
    });

    it('returns fallback status when APIs fail', async () => {
      mockPrisma.account.findFirst.mockResolvedValueOnce(null);

      const res = await request(app)
        .post('/api/accounts/gstin-search')
        .send({ gstin: VALID_GSTIN_UP });

      expect(res.body.status).toContain('enter details manually');
      expect(res.body.tradeName).toBe('');
      expect(res.body.legalName).toBe('');
    });

    it('auto-uppercases lowercase gstin input', async () => {
      mockPrisma.account.findFirst.mockResolvedValueOnce(null);

      const res = await request(app)
        .post('/api/accounts/gstin-search')
        .send({ gstin: '09aaach7409r1zz' });

      expect(res.body.gstin).toBe('09AAACH7409R1ZZ');
      expect(res.body.valid).toBe(true);
    });

    it('trims whitespace from gstin', async () => {
      mockPrisma.account.findFirst.mockResolvedValueOnce(null);

      const res = await request(app)
        .post('/api/accounts/gstin-search')
        .send({ gstin: '  09AAACH7409R1ZZ  ' });

      expect(res.body.gstin).toBe('09AAACH7409R1ZZ');
    });
  });

  // ─── External API success (primary - gstincheck) ─────────
  describe('external API success (primary)', () => {
    it('populates firm details from gstincheck API', async () => {
      mockPrisma.account.findFirst.mockResolvedValueOnce(null);

      // Mock primary API response
      mockFetchImpl.mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          flag: true,
          data: {
            tradeNam: 'JAIGURU JEWELS LLP',
            lgnm: 'JAIGURU JEWELS LLP',
            sts: 'Active',
            dty: 'Regular',
            pradr: {
              addr: {
                bno: 'A-101',
                bnm: 'Trade Tower',
                st: 'MG Road',
                loc: 'Indirapuram',
                dst: 'Ghaziabad',
                stcd: 'Uttar Pradesh',
                pncd: '201014',
              },
            },
          },
        }),
      });

      const res = await request(app)
        .post('/api/accounts/gstin-search')
        .send({ gstin: VALID_GSTIN_UP });

      expect(res.status).toBe(200);
      expect(res.body.tradeName).toBe('JAIGURU JEWELS LLP');
      expect(res.body.legalName).toBe('JAIGURU JEWELS LLP');
      expect(res.body.status).toBe('Active');
      expect(res.body.type).toBe('Regular');
      expect(res.body.blockNo).toBe('A-101');
      expect(res.body.building).toBe('Trade Tower');
      expect(res.body.street).toBe('MG Road');
      expect(res.body.area).toBe('Indirapuram');
      expect(res.body.city).toBe('Ghaziabad');
      expect(res.body.state).toBe('Uttar Pradesh');
      expect(res.body.pincode).toBe('201014');
    });

    it('constructs full address from parts', async () => {
      mockPrisma.account.findFirst.mockResolvedValueOnce(null);

      mockFetchImpl.mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          flag: true,
          data: {
            tradeNam: 'Test Co',
            lgnm: 'Test Co Legal',
            sts: 'Active',
            dty: 'Regular',
            pradr: {
              addr: {
                bno: '5',
                bnm: 'Pearl Plaza',
                st: 'Ring Road',
                loc: 'Sector 12',
                dst: 'Noida',
                stcd: 'Uttar Pradesh',
                pncd: '201301',
              },
            },
          },
        }),
      });

      const res = await request(app)
        .post('/api/accounts/gstin-search')
        .send({ gstin: VALID_GSTIN_UP });

      expect(res.body.address).toContain('5');
      expect(res.body.address).toContain('Pearl Plaza');
      expect(res.body.address).toContain('Ring Road');
      expect(res.body.address).toContain('Noida');
    });

    it('handles API response with no address block', async () => {
      mockPrisma.account.findFirst.mockResolvedValueOnce(null);

      mockFetchImpl.mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          flag: true,
          data: {
            tradeNam: 'NoAddr Co',
            lgnm: 'NoAddr Legal',
            sts: 'Active',
            dty: 'Composition',
          },
        }),
      });

      const res = await request(app)
        .post('/api/accounts/gstin-search')
        .send({ gstin: VALID_GSTIN_UP });

      expect(res.body.tradeName).toBe('NoAddr Co');
      expect(res.body.blockNo).toBe('');
      expect(res.body.city).toBe('');
    });
  });

  // ─── External API fallback (secondary - appyflow) ────────
  describe('external API fallback (secondary)', () => {
    it('uses secondary API when primary fails', async () => {
      mockPrisma.account.findFirst.mockResolvedValueOnce(null);

      // Primary fails
      mockFetchImpl
        .mockRejectedValueOnce(new Error('Primary API down'))
        // Secondary succeeds
        .mockResolvedValueOnce({
          ok: true,
          json: async () => ({
            taxpayerInfo: {
              tradeNam: 'SecondaryTrade',
              lgnm: 'SecondaryLegal',
              sts: 'Active',
              dty: 'Regular',
              pradr: {
                adr: 'Full address string from secondary',
                addr: {
                  bno: 'B-2',
                  bnm: 'Silver Tower',
                  st: 'Station Road',
                  loc: 'Civil Lines',
                  dst: 'Allahabad',
                  stcd: 'Uttar Pradesh',
                  pncd: '211001',
                },
              },
            },
          }),
        });

      const res = await request(app)
        .post('/api/accounts/gstin-search')
        .send({ gstin: VALID_GSTIN_UP });

      expect(res.status).toBe(200);
      expect(res.body.tradeName).toBe('SecondaryTrade');
      expect(res.body.legalName).toBe('SecondaryLegal');
      expect(res.body.city).toBe('Allahabad');
      expect(res.body.pincode).toBe('211001');
    });

    it('falls back to format-based when both APIs fail', async () => {
      mockPrisma.account.findFirst.mockResolvedValueOnce(null);

      // Both fail
      mockFetchImpl
        .mockRejectedValueOnce(new Error('Primary down'))
        .mockRejectedValueOnce(new Error('Secondary down'));

      const res = await request(app)
        .post('/api/accounts/gstin-search')
        .send({ gstin: VALID_GSTIN_UP });

      expect(res.status).toBe(200);
      expect(res.body.valid).toBe(true);
      expect(res.body.tradeName).toBe('');
      expect(res.body.status).toContain('enter details manually');
    });

    it('falls back when primary returns non-ok status', async () => {
      mockPrisma.account.findFirst.mockResolvedValueOnce(null);

      // Primary returns 500
      mockFetchImpl.mockResolvedValueOnce({
        ok: false,
        status: 500,
      });
      // Secondary also fails
      mockFetchImpl.mockRejectedValueOnce(new Error('Secondary down'));

      const res = await request(app)
        .post('/api/accounts/gstin-search')
        .send({ gstin: VALID_GSTIN_MH });

      expect(res.status).toBe(200);
      expect(res.body.stateName).toBe('Maharashtra');
      expect(res.body.tradeName).toBe('');
    });

    it('falls back when primary returns flag=false', async () => {
      mockPrisma.account.findFirst.mockResolvedValueOnce(null);

      mockFetchImpl.mockResolvedValueOnce({
        ok: true,
        json: async () => ({ flag: false, message: 'Invalid GSTIN' }),
      });
      mockFetchImpl.mockRejectedValueOnce(new Error('Secondary down'));

      const res = await request(app)
        .post('/api/accounts/gstin-search')
        .send({ gstin: VALID_GSTIN_KA });

      expect(res.status).toBe(200);
      expect(res.body.tradeName).toBe('');
    });
  });

  // ─── Duplicate detection ─────────────────────────────────
  describe('duplicate GSTIN detection', () => {
    it('returns existing account when GSTIN is already linked', async () => {
      mockPrisma.account.findFirst.mockResolvedValueOnce({
        id: 5,
        name: 'Existing Gold Store',
        type: 'SUPPLIER',
        city: 'Mumbai',
        state: 'Maharashtra',
      });

      const res = await request(app)
        .post('/api/accounts/gstin-search')
        .send({ gstin: VALID_GSTIN_MH });

      expect(res.status).toBe(200);
      expect(res.body.existingAccount).toMatchObject({
        id: 5,
        name: 'Existing Gold Store',
        type: 'SUPPLIER',
      });
    });

    it('returns null existingAccount when GSTIN is new', async () => {
      mockPrisma.account.findFirst.mockResolvedValueOnce(null);

      const res = await request(app)
        .post('/api/accounts/gstin-search')
        .send({ gstin: VALID_GSTIN_UP });

      expect(res.body.existingAccount).toBeNull();
    });

    it('queries findFirst with active filter', async () => {
      mockPrisma.account.findFirst.mockResolvedValueOnce(null);

      await request(app)
        .post('/api/accounts/gstin-search')
        .send({ gstin: VALID_GSTIN_UP });

      expect(mockPrisma.account.findFirst).toHaveBeenCalledWith({
        where: { gstin: VALID_GSTIN_UP, isActive: true },
        select: { id: true, name: true, type: true, city: true, state: true },
      });
    });
  });

  // ─── State code mapping coverage ─────────────────────────
  describe('state code mapping', () => {
    const stateCases: [string, string, string][] = [
      ['01AAAAA0000A1Z1', '01', 'Jammu & Kashmir'],
      ['03AAAAA0000A1Z1', '03', 'Punjab'],
      ['06AAAAA0000A1Z1', '06', 'Haryana'],
      ['08AAAAA0000A1Z1', '08', 'Rajasthan'],
      ['10AAAAA0000A1Z1', '10', 'Bihar'],
      ['19AAAAA0000A1Z1', '19', 'West Bengal'],
      ['22AAAAA0000A1Z1', '22', 'Chhattisgarh'],
      ['33AAAAA0000A1Z1', '33', 'Tamil Nadu'],
      ['36AAAAA0000A1Z1', '36', 'Telangana'],
    ];

    it.each(stateCases)(
      'maps %s → code %s → %s',
      async (gstin, expectedCode, expectedState) => {
        mockPrisma.account.findFirst.mockResolvedValueOnce(null);

        const res = await request(app)
          .post('/api/accounts/gstin-search')
          .send({ gstin });

        expect(res.status).toBe(200);
        expect(res.body.stateCode).toBe(expectedCode);
        expect(res.body.stateName).toBe(expectedState);
      },
    );
  });

  // ─── Account creation with new GST fields ────────────────
  describe('account creation with GST fields', () => {
    it('creates account with all new GST-related fields', async () => {
      const newAccount = {
        id: 10,
        name: 'GST Test Firm',
        type: 'CUSTOMER',
        groupHead: 'Sundry Debtors',
        customerCategory: 'Premium',
        gstin: '09AAACH7409R1ZZ',
        gstVerified: true,
        gstTradeName: 'GST Test Trading',
        gstStatus: 'Active',
        compositionScheme: false,
        blockNo: 'A-1',
        building: 'Gold House',
        street: 'Jewellers Lane',
        area: 'Old Market',
        city: 'Lucknow',
        state: 'Uttar Pradesh',
        pincode: '226001',
        pan: 'AAACH7409R',
        reference: 'Referral from Rajesh',
        remark: 'Premium customer since 2020',
        isActive: true,
      };
      mockPrisma.account.create.mockResolvedValueOnce(newAccount);

      const res = await request(app)
        .post('/api/accounts')
        .send(newAccount);

      expect(res.status).toBe(201);
      expect(res.body).toMatchObject({
        gstin: '09AAACH7409R1ZZ',
        gstVerified: true,
        gstTradeName: 'GST Test Trading',
        groupHead: 'Sundry Debtors',
        customerCategory: 'Premium',
        blockNo: 'A-1',
        building: 'Gold House',
      });
    });

    it('creates account with composition scheme flag', async () => {
      const account = {
        id: 11,
        name: 'Small Trader',
        type: 'SUPPLIER',
        compositionScheme: true,
        gstin: '27AABCG1234H1Z5',
      };
      mockPrisma.account.create.mockResolvedValueOnce(account);

      const res = await request(app)
        .post('/api/accounts')
        .send(account);

      expect(res.status).toBe(201);
      expect(res.body.compositionScheme).toBe(true);
    });

    it('updates account with GST verification data', async () => {
      const updated = {
        id: 1,
        name: 'Rajesh Kumar',
        gstin: '09AAACH7409R1ZZ',
        gstVerified: true,
        gstTradeName: 'Rajesh Gold Works',
        gstStatus: 'Active',
      };
      mockPrisma.account.update.mockResolvedValueOnce(updated);

      const res = await request(app)
        .put('/api/accounts/1')
        .send({
          gstin: '09AAACH7409R1ZZ',
          gstVerified: true,
          gstTradeName: 'Rajesh Gold Works',
          gstStatus: 'Active',
        });

      expect(res.status).toBe(200);
      expect(res.body.gstVerified).toBe(true);
      expect(res.body.gstTradeName).toBe('Rajesh Gold Works');
    });
  });

  // ─── Error handling ──────────────────────────────────────
  describe('error handling', () => {
    it('returns 500 when database query fails', async () => {
      // Make findFirst throw
      mockPrisma.account.findFirst.mockRejectedValueOnce(new Error('DB connection lost'));

      const res = await request(app)
        .post('/api/accounts/gstin-search')
        .send({ gstin: VALID_GSTIN_UP });

      expect(res.status).toBe(500);
      expect(res.body.error).toBe('Failed to search GSTIN');
    });
  });
});
