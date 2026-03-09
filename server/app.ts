import express from 'express';
import cors from 'cors';
import salesRoutes from './routes/sales';
import purchaseRoutes from './routes/purchase';
import inventoryRoutes from './routes/inventory';
import accountsRoutes from './routes/accounts';
import branchRoutes from './routes/branch';
import branchManagementRoutes from './routes/branchManagement';
import mastersRoutes from './routes/masters';
import reportsRoutes from './routes/reports';
import authRoutes from './routes/auth';
import cashBankRoutes from './routes/cashBank';
import layawayRoutes from './routes/layaway';
import customerPaymentRoutes from './routes/customerPayments';

const app = express();

app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Health check
app.get('/api/health', (_, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

// Routes
app.use('/api/auth', authRoutes);
app.use('/api/sales', salesRoutes);
app.use('/api/purchase', purchaseRoutes);
app.use('/api/inventory', inventoryRoutes);
app.use('/api/accounts', accountsRoutes);
app.use('/api/branch', branchRoutes);
app.use('/api/branches', branchManagementRoutes);
app.use('/api/masters', mastersRoutes);
app.use('/api/reports', reportsRoutes);
app.use('/api/cash-bank', cashBankRoutes);
app.use('/api/layaway', layawayRoutes);
app.use('/api/customer-payments', customerPaymentRoutes);

// Error handler
app.use((err: any, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
  console.error('Server error:', err);
  res.status(err.status || 500).json({
    error: err.message || 'Internal Server Error',
    ...(process.env.NODE_ENV === 'development' && { stack: err.stack }),
  });
});

export default app;
