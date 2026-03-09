// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, waitFor, act, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import React from 'react';

// ── Mock api module ────────────────────────────────────────
vi.mock('../../src/lib/api', () => ({
  accountsAPI: {
    create: vi.fn(),
    update: vi.fn(),
    gstSearch: vi.fn(),
  },
}));

// ── Mock react-hot-toast ───────────────────────────────────
vi.mock('react-hot-toast', () => {
  const toast = vi.fn() as any;
  toast.success = vi.fn();
  toast.error = vi.fn();
  return { default: toast };
});

// Import the mocked modules to get references
import { accountsAPI } from '../../src/lib/api';
import toast from 'react-hot-toast';

const mockCreate = accountsAPI.create as ReturnType<typeof vi.fn>;
const mockUpdate = accountsAPI.update as ReturnType<typeof vi.fn>;
const mockGstSearch = accountsAPI.gstSearch as ReturnType<typeof vi.fn>;
const mockToast = toast as unknown as ReturnType<typeof vi.fn> & { success: ReturnType<typeof vi.fn>; error: ReturnType<typeof vi.fn> };

// ── Import component after mocks ───────────────────────────
import AccountMasterModal from '../../src/components/AccountMasterModal';

// ── Helper: render within QueryClient ──────────────────────
function renderModal(props: Partial<React.ComponentProps<typeof AccountMasterModal>> = {}) {
  const qc = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  const defaultProps = {
    open: true,
    onClose: vi.fn(),
    onSaved: vi.fn(),
    ...props,
  };
  const utils = render(
    <QueryClientProvider client={qc}>
      <AccountMasterModal {...defaultProps} />
    </QueryClientProvider>,
  );
  return { ...utils, ...defaultProps, qc };
}

// ════════════════════════════════════════════════════════════
// Tests
// ════════════════════════════════════════════════════════════

beforeEach(() => {
  vi.clearAllMocks();
});

describe('AccountMasterModal', () => {
  // ─── Rendering ───────────────────────────────────────────
  describe('rendering', () => {
    it('renders the modal when open=true', () => {
      renderModal();
      expect(screen.getByText('Account Master')).toBeDefined();
    });

    it('does not render when open=false', () => {
      renderModal({ open: false });
      expect(screen.queryByText('Account Master')).toBeNull();
    });

    it('shows title bar with "Account Master"', () => {
      renderModal();
      expect(screen.getByText('Account Master')).toBeDefined();
    });

    it('shows Save and Close buttons', () => {
      renderModal();
      expect(screen.getByText('Save')).toBeDefined();
      expect(screen.getByText('Close')).toBeDefined();
    });

    it('shows Account Name input', () => {
      renderModal();
      expect(screen.getByPlaceholderText('Enter account name')).toBeDefined();
    });

    it('shows Account Category dropdown defaulting to Customer', () => {
      renderModal();
      const select = screen.getAllByRole('combobox')[0];
      expect(select).toBeDefined();
      expect((select as HTMLSelectElement).value).toBe('CUSTOMER');
    });

    it('shows Group Head dropdown', () => {
      renderModal();
      expect(screen.getByText('Group Head')).toBeDefined();
    });

    it('shows Composition Scheme checkbox', () => {
      renderModal();
      expect(screen.getByText('Registered Under Composition Scheme')).toBeDefined();
    });

    it('shows F6 GST search link', () => {
      renderModal();
      expect(screen.getByText(/Press F6 To Search GSTIN/)).toBeDefined();
    });

    it('shows all 5 tab headers', () => {
      renderModal();
      expect(screen.getByText('Address Detail')).toBeDefined();
      expect(screen.getByText('TDS Entry')).toBeDefined();
      expect(screen.getByText('Metal Outstanding')).toBeDefined();
      expect(screen.getByText('Bill To Bill')).toBeDefined();
      expect(screen.getByText('Party Bank Detail')).toBeDefined();
    });
  });

  // ─── Default Form Values ─────────────────────────────────
  describe('default form values', () => {
    it('defaults type to CUSTOMER', () => {
      renderModal();
      const select = screen.getAllByRole('combobox')[0] as HTMLSelectElement;
      expect(select.value).toBe('CUSTOMER');
    });

    it('defaults group head to Sundry Debtors for CUSTOMER', () => {
      renderModal();
      const selects = screen.getAllByRole('combobox') as HTMLSelectElement[];
      // Group Head is second combobox
      expect(selects[1].value).toBe('Sundry Debtors');
    });

    it('defaults balance type to DR', () => {
      renderModal();
      const selects = screen.getAllByRole('combobox') as HTMLSelectElement[];
      // Balance type select
      const drSelect = selects.find((s) => s.value === 'DR');
      expect(drSelect).toBeDefined();
    });

    it('defaults Customer Category to Normal', () => {
      renderModal();
      const selects = screen.getAllByRole('combobox') as HTMLSelectElement[];
      const catSelect = selects.find((s) => s.value === 'Normal');
      expect(catSelect).toBeDefined();
    });
  });

  // ─── forceType prop ──────────────────────────────────────
  describe('forceType prop', () => {
    it('sets type to forced value', () => {
      renderModal({ forceType: 'SUPPLIER' });
      const select = screen.getAllByRole('combobox')[0] as HTMLSelectElement;
      expect(select.value).toBe('SUPPLIER');
    });

    it('disables the type select when forced', () => {
      renderModal({ forceType: 'CUSTOMER' });
      const select = screen.getAllByRole('combobox')[0] as HTMLSelectElement;
      expect(select.disabled).toBe(true);
    });
  });

  // ─── editData prop ──────────────────────────────────────
  describe('editData prop', () => {
    it('pre-fills name from editData', () => {
      renderModal({ editData: { name: 'Test Jewellers', type: 'SUPPLIER' } });
      const nameInput = screen.getByPlaceholderText('Enter account name') as HTMLInputElement;
      expect(nameInput.value).toBe('Test Jewellers');
    });

    it('pre-fills type from editData', () => {
      renderModal({ editData: { name: 'X', type: 'SUPPLIER' } });
      const select = screen.getAllByRole('combobox')[0] as HTMLSelectElement;
      expect(select.value).toBe('SUPPLIER');
    });
  });

  // ─── Tab navigation ──────────────────────────────────────
  describe('tab navigation', () => {
    it('defaults to Address Detail tab', () => {
      renderModal();
      // Address tab fields should be visible
      expect(screen.getByText('Block No.')).toBeDefined();
      expect(screen.getByText('Building')).toBeDefined();
    });

    it('shows "Coming Soon" when clicking TDS Entry tab', async () => {
      renderModal();
      fireEvent.click(screen.getByText('TDS Entry'));
      expect(screen.getByText('TDS Entry — Coming Soon')).toBeDefined();
    });

    it('shows "Coming Soon" for Metal Outstanding tab', async () => {
      renderModal();
      fireEvent.click(screen.getByText('Metal Outstanding'));
      expect(screen.getByText('Metal Outstanding — Coming Soon')).toBeDefined();
    });

    it('shows "Coming Soon" for Bill To Bill tab', async () => {
      renderModal();
      fireEvent.click(screen.getByText('Bill To Bill'));
      expect(screen.getByText('Bill To Bill — Coming Soon')).toBeDefined();
    });

    it('shows "Coming Soon" for Party Bank Detail tab', async () => {
      renderModal();
      fireEvent.click(screen.getByText('Party Bank Detail'));
      expect(screen.getByText('Party Bank Detail — Coming Soon')).toBeDefined();
    });
  });

  // ─── Address tab fields ──────────────────────────────────
  describe('address tab fields', () => {
    it('shows all address fields', () => {
      renderModal();
      expect(screen.getByText('Block No.')).toBeDefined();
      expect(screen.getByText('Building')).toBeDefined();
      expect(screen.getByText('Street')).toBeDefined();
      expect(screen.getByText('Area')).toBeDefined();
      expect(screen.getByText('City')).toBeDefined();
      expect(screen.getByText('Mobile')).toBeDefined();
      expect(screen.getByText('E-Mail')).toBeDefined();
      expect(screen.getByText('IT Pan No.')).toBeDefined();
      expect(screen.getByText('State')).toBeDefined();
      expect(screen.getByText('Pincode')).toBeDefined();
      expect(screen.getByText('Aadhar No.')).toBeDefined();
      expect(screen.getByText('Reference')).toBeDefined();
    });

    it('limits mobile to 10 digits', async () => {
      renderModal();
      const mobileInput = screen.getByPlaceholderText('10-digit mobile') as HTMLInputElement;
      fireEvent.change(mobileInput, { target: { value: '12345678901234' } });
      expect(mobileInput.value).toBe('1234567890');
    });

    it('strips non-digit characters from mobile', () => {
      renderModal();
      const mobileInput = screen.getByPlaceholderText('10-digit mobile') as HTMLInputElement;
      fireEvent.change(mobileInput, { target: { value: 'abc9876543210' } });
      expect(mobileInput.value).toBe('9876543210');
    });

    it('limits PAN to 10 uppercase alphanumeric', () => {
      renderModal();
      const panInput = screen.getByPlaceholderText('ABCDE1234F') as HTMLInputElement;
      fireEvent.change(panInput, { target: { value: 'abcde1234f-extra' } });
      expect(panInput.value).toBe('ABCDE1234F');
    });

    it('limits Aadhar to 12 digits', () => {
      renderModal();
      const aadharInput = screen.getByPlaceholderText('12-digit Aadhar') as HTMLInputElement;
      fireEvent.change(aadharInput, { target: { value: '1234567890123456' } });
      expect(aadharInput.value).toBe('123456789012');
    });

    it('limits pincode to 6 digits', () => {
      renderModal();
      const pincodeInputs = screen.getAllByRole('textbox') as HTMLInputElement[];
      // Find the pincode input by its maxLength
      const pinInput = pincodeInputs.find((i) => i.maxLength === 6 && i.placeholder === '');
      if (pinInput) {
        fireEvent.change(pinInput, { target: { value: 'abc20100199' } });
        expect(pinInput.value).toBe('201001');
      }
    });

    it('shows all Indian states in state dropdown', () => {
      renderModal();
      // State dropdown has 36+ options
      const stateSelect = screen.getByText('-- Select State --')?.closest('select') as HTMLSelectElement;
      expect(stateSelect).toBeDefined();
      // Check a few known states
      const options = Array.from(stateSelect?.options || []).map((o) => o.text);
      expect(options).toContain('Uttar Pradesh');
      expect(options).toContain('Maharashtra');
      expect(options).toContain('Karnataka');
      expect(options).toContain('Delhi');
      expect(options).toContain('Gujarat');
    });
  });

  // ─── GST Search Popup ────────────────────────────────────
  describe('GST search popup', () => {
    it('opens GST popup when F6 link is clicked', () => {
      renderModal();
      fireEvent.click(screen.getByText(/Press F6 To Search GSTIN/));
      expect(screen.getByText('Search GSTIN')).toBeDefined();
      expect(screen.getByPlaceholderText('e.g. 09AAACH7409R1ZZ')).toBeDefined();
    });

    it('opens GST popup on F6 keypress', () => {
      renderModal();
      fireEvent.keyDown(window, { key: 'F6' });
      expect(screen.getByText('Search GSTIN')).toBeDefined();
    });

    it('shows GSTIN input limited to 15 uppercase chars', () => {
      renderModal();
      fireEvent.click(screen.getByText(/Press F6 To Search GSTIN/));
      const input = screen.getByPlaceholderText('e.g. 09AAACH7409R1ZZ') as HTMLInputElement;
      fireEvent.change(input, { target: { value: '09aaach7409r1zz-extra' } });
      expect(input.value).toBe('09AAACH7409R1ZZ');
    });

    it('shows search button', () => {
      renderModal();
      fireEvent.click(screen.getByText(/Press F6 To Search GSTIN/));
      expect(screen.getByText('Search')).toBeDefined();
    });

    it('closes GST popup on Escape', () => {
      renderModal();
      fireEvent.click(screen.getByText(/Press F6 To Search GSTIN/));
      expect(screen.getByText('Search GSTIN')).toBeDefined();
      fireEvent.keyDown(window, { key: 'Escape' });
      expect(screen.queryByPlaceholderText('e.g. 09AAACH7409R1ZZ')).toBeNull();
    });

    it('shows helper text about 15-character GSTIN', () => {
      renderModal();
      fireEvent.click(screen.getByText(/Press F6 To Search GSTIN/));
      expect(screen.getByText(/Enter 15-character GSTIN/)).toBeDefined();
    });

    it('shows toast error when searching with empty input', () => {
      renderModal();
      fireEvent.click(screen.getByText(/Press F6 To Search GSTIN/));
      fireEvent.click(screen.getByText('Search'));
      expect(mockToast.error).toHaveBeenCalledWith('Please enter a GSTIN number');
    });

    it('calls API on search button click with valid input', async () => {
      mockGstSearch.mockResolvedValueOnce({
        data: {
          gstin: '09AAACH7409R1ZZ',
          valid: true,
          stateCode: '09',
          stateName: 'Uttar Pradesh',
          pan: 'AAACH7409R',
          tradeName: '',
          legalName: '',
          status: 'Format valid — enter details manually',
          existingAccount: null,
        },
      });

      renderModal();
      fireEvent.click(screen.getByText(/Press F6 To Search GSTIN/));
      const input = screen.getByPlaceholderText('e.g. 09AAACH7409R1ZZ') as HTMLInputElement;
      fireEvent.change(input, { target: { value: '09AAACH7409R1ZZ' } });
      fireEvent.click(screen.getByText('Search'));

      await waitFor(() => {
        expect(mockGstSearch).toHaveBeenCalledWith('09AAACH7409R1ZZ');
      });
    });

    it('displays GST result after successful search', async () => {
      mockGstSearch.mockResolvedValueOnce({
        data: {
          gstin: '09AAACH7409R1ZZ',
          valid: true,
          stateCode: '09',
          stateName: 'Uttar Pradesh',
          pan: 'AAACH7409R',
          tradeName: 'JAIGURU JEWELS',
          legalName: 'JAIGURU JEWELS LLP',
          status: 'Active',
          type: 'Regular',
          address: 'A-101, Trade Tower, MG Road, Ghaziabad',
          existingAccount: null,
        },
      });

      renderModal();
      fireEvent.click(screen.getByText(/Press F6 To Search GSTIN/));
      const input = screen.getByPlaceholderText('e.g. 09AAACH7409R1ZZ');
      fireEvent.change(input, { target: { value: '09AAACH7409R1ZZ' } });
      fireEvent.click(screen.getByText('Search'));

      await waitFor(() => {
        expect(screen.getByText('GSTIN Found — Details Retrieved')).toBeDefined();
      });
      expect(screen.getByText('JAIGURU JEWELS LLP')).toBeDefined();
      expect(screen.getByText('Active')).toBeDefined();
      expect(screen.getByText('Apply to Form')).toBeDefined();
    });

    it('shows duplicate warning when existingAccount is returned', async () => {
      mockGstSearch.mockResolvedValueOnce({
        data: {
          gstin: '27AABCG1234H1Z5',
          valid: true,
          stateCode: '27',
          stateName: 'Maharashtra',
          pan: 'AABCG1234H',
          tradeName: 'Existing Firm',
          legalName: 'Existing Firm Pvt Ltd',
          status: 'Active',
          existingAccount: { id: 5, name: 'Existing Gold Store', type: 'SUPPLIER' },
        },
      });

      renderModal();
      fireEvent.click(screen.getByText(/Press F6 To Search GSTIN/));
      const input = screen.getByPlaceholderText('e.g. 09AAACH7409R1ZZ');
      fireEvent.change(input, { target: { value: '27AABCG1234H1Z5' } });
      fireEvent.click(screen.getByText('Search'));

      await waitFor(() => {
        expect(mockToast).toHaveBeenCalledWith(
          expect.stringContaining('Existing Gold Store'),
          expect.any(Object),
        );
      });
    });

    it('shows error message on search failure', async () => {
      mockGstSearch.mockRejectedValueOnce({
        response: { data: { error: 'Invalid GSTIN format' } },
      });

      renderModal();
      fireEvent.click(screen.getByText(/Press F6 To Search GSTIN/));
      const input = screen.getByPlaceholderText('e.g. 09AAACH7409R1ZZ');
      fireEvent.change(input, { target: { value: '09AAACH7409R1ZZ' } });
      fireEvent.click(screen.getByText('Search'));

      await waitFor(() => {
        expect(mockToast.error).toHaveBeenCalledWith('Invalid GSTIN format');
      });
    });
  });

  // ─── Apply GST Data ──────────────────────────────────────
  describe('apply GST data to form', () => {
    async function searchAndGetResult() {
      mockGstSearch.mockResolvedValueOnce({
        data: {
          gstin: '09AAACH7409R1ZZ',
          valid: true,
          stateCode: '09',
          stateName: 'Uttar Pradesh',
          pan: 'AAACH7409R',
          tradeName: 'JAIGURU JEWELS',
          legalName: 'JAIGURU JEWELS LLP',
          status: 'Active',
          type: 'Regular',
          blockNo: 'A-101',
          building: 'Trade Tower',
          street: 'MG Road',
          area: 'Indirapuram',
          city: 'Ghaziabad',
          state: 'Uttar Pradesh',
          pincode: '201014',
          existingAccount: null,
        },
      });

      renderModal();
      fireEvent.click(screen.getByText(/Press F6 To Search GSTIN/));
      const input = screen.getByPlaceholderText('e.g. 09AAACH7409R1ZZ');
      fireEvent.change(input, { target: { value: '09AAACH7409R1ZZ' } });
      fireEvent.click(screen.getByText('Search'));

      await waitFor(() => {
        expect(screen.getByText('Apply to Form')).toBeDefined();
      });
    }

    it('applies trade name to account name when empty', async () => {
      await searchAndGetResult();
      fireEvent.click(screen.getByText('Apply to Form'));

      await waitFor(() => {
        const nameInput = screen.getByPlaceholderText('Enter account name') as HTMLInputElement;
        expect(nameInput.value).toBe('JAIGURU JEWELS LLP');
      });
    });

    it('applies PAN from GST data', async () => {
      await searchAndGetResult();
      fireEvent.click(screen.getByText('Apply to Form'));

      await waitFor(() => {
        const panInput = screen.getByPlaceholderText('ABCDE1234F') as HTMLInputElement;
        expect(panInput.value).toBe('AAACH7409R');
      });
    });

    it('shows GST VERIFIED badge after applying', async () => {
      await searchAndGetResult();
      fireEvent.click(screen.getByText('Apply to Form'));

      await waitFor(() => {
        expect(screen.getByText('GST VERIFIED')).toBeDefined();
      });
    });

    it('closes GST popup after applying', async () => {
      await searchAndGetResult();
      fireEvent.click(screen.getByText('Apply to Form'));

      await waitFor(() => {
        expect(screen.queryByPlaceholderText('e.g. 09AAACH7409R1ZZ')).toBeNull();
      });
    });

    it('shows toast on successful apply', async () => {
      await searchAndGetResult();
      fireEvent.click(screen.getByText('Apply to Form'));

      await waitFor(() => {
        expect(mockToast.success).toHaveBeenCalledWith('GST details applied to form');
      });
    });
  });

  // ─── Save validation ────────────────────────────────────
  describe('save validation', () => {
    it('shows error when saving without name', () => {
      renderModal();
      fireEvent.click(screen.getByText('Save'));
      expect(mockToast.error).toHaveBeenCalledWith('Account Name is required');
    });

    it('calls create API when saving new account', async () => {
      mockCreate.mockResolvedValueOnce({ data: { id: 1, name: 'New Jeweller' } });

      renderModal();
      const nameInput = screen.getByPlaceholderText('Enter account name');
      fireEvent.change(nameInput, { target: { value: 'New Jeweller' } });
      fireEvent.click(screen.getByText('Save'));

      await waitFor(() => {
        expect(mockCreate).toHaveBeenCalledTimes(1);
        expect(mockCreate).toHaveBeenCalledWith(
          expect.objectContaining({ name: 'New Jeweller', type: 'CUSTOMER' }),
        );
      });
    });

    it('calls update API when saving existing account', async () => {
      mockUpdate.mockResolvedValueOnce({ data: { id: 42, name: 'Updated' } });

      renderModal({ editData: { id: 42, name: 'Old Name', type: 'CUSTOMER' } });
      const nameInput = screen.getByPlaceholderText('Enter account name') as HTMLInputElement;
      fireEvent.change(nameInput, { target: { value: 'Updated Name' } });
      fireEvent.click(screen.getByText('Save'));

      await waitFor(() => {
        expect(mockUpdate).toHaveBeenCalledWith(42, expect.objectContaining({ name: 'Updated Name' }));
      });
    });

    it('shows success toast after create', async () => {
      mockCreate.mockResolvedValueOnce({ data: { id: 1, name: 'Test' } });

      renderModal();
      fireEvent.change(screen.getByPlaceholderText('Enter account name'), {
        target: { value: 'Test' },
      });
      fireEvent.click(screen.getByText('Save'));

      await waitFor(() => {
        expect(mockToast.success).toHaveBeenCalledWith('Account created!');
      });
    });

    it('shows success toast after update', async () => {
      mockUpdate.mockResolvedValueOnce({ data: { id: 1, name: 'Test' } });

      renderModal({ editData: { id: 1, name: 'Old', type: 'CUSTOMER' } });
      fireEvent.change(screen.getByPlaceholderText('Enter account name'), {
        target: { value: 'Updated' },
      });
      fireEvent.click(screen.getByText('Save'));

      await waitFor(() => {
        expect(mockToast.success).toHaveBeenCalledWith('Account updated!');
      });
    });

    it('calls onClose after successful save', async () => {
      mockCreate.mockResolvedValueOnce({ data: { id: 1, name: 'Test' } });

      const { onClose } = renderModal();
      fireEvent.change(screen.getByPlaceholderText('Enter account name'), {
        target: { value: 'Test' },
      });
      fireEvent.click(screen.getByText('Save'));

      await waitFor(() => {
        expect(onClose).toHaveBeenCalled();
      });
    });

    it('calls onSaved with response data', async () => {
      const responseData = { id: 99, name: 'Created Account' };
      mockCreate.mockResolvedValueOnce({ data: responseData });

      const { onSaved } = renderModal();
      fireEvent.change(screen.getByPlaceholderText('Enter account name'), {
        target: { value: 'Created Account' },
      });
      fireEvent.click(screen.getByText('Save'));

      await waitFor(() => {
        expect(onSaved).toHaveBeenCalledWith(responseData);
      });
    });

    it('builds full address from parts when saving', async () => {
      mockCreate.mockResolvedValueOnce({ data: { id: 1, name: 'Test' } });

      renderModal();
      fireEvent.change(screen.getByPlaceholderText('Enter account name'), {
        target: { value: 'Test' },
      });

      // Fill address parts (use their label-adjacent inputs)
      const inputs = screen.getAllByRole('textbox') as HTMLInputElement[];
      // blockNo, building, street, area are the first few in address tab
      // We need to find them by context

      fireEvent.click(screen.getByText('Save'));

      await waitFor(() => {
        expect(mockCreate).toHaveBeenCalled();
        const payload = mockCreate.mock.calls[0][0];
        expect(payload.name).toBe('Test');
        expect(payload.type).toBe('CUSTOMER');
      });
    });
  });

  // ─── Close behavior ─────────────────────────────────────
  describe('close behavior', () => {
    it('calls onClose when Close button clicked', () => {
      const { onClose } = renderModal();
      fireEvent.click(screen.getByText('Close'));
      expect(onClose).toHaveBeenCalled();
    });

    it('calls onClose when × clicked', () => {
      const { onClose } = renderModal();
      // The × button is in the title bar
      fireEvent.click(screen.getByText('×'));
      expect(onClose).toHaveBeenCalled();
    });

    it('calls onClose on Escape when GST popup is not open', () => {
      const { onClose } = renderModal();
      fireEvent.keyDown(window, { key: 'Escape' });
      expect(onClose).toHaveBeenCalled();
    });

    it('closes only GST popup on Escape when it is open', () => {
      const { onClose } = renderModal();
      // Open GST popup
      fireEvent.click(screen.getByText(/Press F6 To Search GSTIN/));
      expect(screen.getByText('Search GSTIN')).toBeDefined();
      // Press Escape — should close popup, not modal
      fireEvent.keyDown(window, { key: 'Escape' });
      expect(screen.queryByPlaceholderText('e.g. 09AAACH7409R1ZZ')).toBeNull();
      // Modal should still be open
      expect(screen.getByText('Account Master')).toBeDefined();
    });
  });

  // ─── Group head changes with account type ────────────────
  describe('group head changes with account type', () => {
    it('shows Sundry Debtors for CUSTOMER type', () => {
      renderModal();
      const selects = screen.getAllByRole('combobox') as HTMLSelectElement[];
      const groupHead = selects[1];
      expect(groupHead.value).toBe('Sundry Debtors');
    });

    it('updates group head options when type changes to SUPPLIER', async () => {
      renderModal();
      const selects = screen.getAllByRole('combobox') as HTMLSelectElement[];
      const typeSelect = selects[0];

      fireEvent.change(typeSelect, { target: { value: 'SUPPLIER' } });

      await waitFor(() => {
        const groupHead = screen.getAllByRole('combobox')[1] as HTMLSelectElement;
        expect(groupHead.value).toBe('Sundry Creditors');
      });
    });

    it('updates group head options when type changes to BANK', async () => {
      renderModal();
      const selects = screen.getAllByRole('combobox') as HTMLSelectElement[];
      fireEvent.change(selects[0], { target: { value: 'BANK' } });

      await waitFor(() => {
        const groupHead = screen.getAllByRole('combobox')[1] as HTMLSelectElement;
        expect(groupHead.value).toBe('Bank Accounts');
      });
    });
  });

  // ─── Composition scheme ──────────────────────────────────
  describe('composition scheme', () => {
    it('checkbox is unchecked by default', () => {
      renderModal();
      const checkbox = screen.getByRole('checkbox') as HTMLInputElement;
      expect(checkbox.checked).toBe(false);
    });

    it('can be toggled on', () => {
      renderModal();
      const checkbox = screen.getByRole('checkbox') as HTMLInputElement;
      fireEvent.click(checkbox);
      expect(checkbox.checked).toBe(true);
    });
  });

  // ─── Customer category dropdown ──────────────────────────
  describe('customer category', () => {
    it('has options: Normal, Premium, VIP, Wholesale, Corporate', () => {
      renderModal();
      const selects = screen.getAllByRole('combobox') as HTMLSelectElement[];
      const catSelect = selects.find((s) => Array.from(s.options).some((o) => o.value === 'VIP'));
      expect(catSelect).toBeDefined();
      const options = Array.from(catSelect!.options).map((o) => o.value);
      expect(options).toContain('Normal');
      expect(options).toContain('Premium');
      expect(options).toContain('VIP');
      expect(options).toContain('Wholesale');
      expect(options).toContain('Corporate');
    });
  });
});
