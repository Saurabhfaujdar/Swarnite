// Format Indian currency (₹)
export function formatCurrency(amount: number | string | null | undefined): string {
  const num = Number(amount) || 0;
  return new Intl.NumberFormat('en-IN', {
    style: 'currency',
    currency: 'INR',
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(num);
}

// Format number with Indian comma separators
export function formatIndianNumber(num: number | string | null | undefined): string {
  const n = Number(num) || 0;
  return new Intl.NumberFormat('en-IN', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(n);
}

// Format weight (grams)
export function formatWeight(weight: number | string | null | undefined): string {
  const w = Number(weight) || 0;
  return w.toFixed(3);
}

// Format date for display
export function formatDate(date: string | Date | null | undefined): string {
  if (!date) return '';
  const d = new Date(date);
  return d.toLocaleDateString('en-IN', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
  });
}

// Format date for input fields
export function formatDateForInput(date: string | Date | null | undefined): string {
  if (!date) return '';
  const d = new Date(date);
  return d.toISOString().split('T')[0];
}

// Get today's date as string
export function getToday(): string {
  return new Date().toISOString().split('T')[0];
}

// Calculate GST
export function calculateGST(amount: number, cgstRate: number = 1.5, sgstRate: number = 1.5) {
  const cgst = (amount * cgstRate) / 100;
  const sgst = (amount * sgstRate) / 100;
  return { cgst, sgst, total: cgst + sgst, taxableAmount: amount };
}

// Calculate fine weight from gross weight and purity
export function calculateFineWeight(grossWeight: number, purity: number): number {
  return (grossWeight * purity) / 100;
}

// Calculate metal amount
export function calculateMetalAmount(weight: number, rate: number): number {
  return weight * rate;
}

// Calculate labour amount
export function calculateLabourAmount(weight: number, labourRate: number): number {
  return weight * labourRate;
}

// Get financial year string
export function getFinancialYear(date?: Date): string {
  const d = date || new Date();
  const year = d.getMonth() >= 3 ? d.getFullYear() : d.getFullYear() - 1;
  return `${year}-${year + 1}`;
}

// Day name
export function getDayName(date: string | Date): string {
  const d = new Date(date);
  return d.toLocaleDateString('en-US', { weekday: 'long' });
}

// Debounce function
export function debounce<T extends (...args: any[]) => any>(fn: T, ms: number) {
  let timer: ReturnType<typeof setTimeout>;
  return (...args: Parameters<T>) => {
    clearTimeout(timer);
    timer = setTimeout(() => fn(...args), ms);
  };
}

// Convert number to Indian words (e.g., 18840 → "Eighteen Thousand Eight Hundred Forty Rupees Only")
export function numberToWords(num: number): string {
  if (num === 0) return 'Zero Rupees Only';

  const ones = ['', 'One', 'Two', 'Three', 'Four', 'Five', 'Six', 'Seven', 'Eight', 'Nine',
    'Ten', 'Eleven', 'Twelve', 'Thirteen', 'Fourteen', 'Fifteen', 'Sixteen', 'Seventeen', 'Eighteen', 'Nineteen'];
  const tens = ['', '', 'Twenty', 'Thirty', 'Forty', 'Fifty', 'Sixty', 'Seventy', 'Eighty', 'Ninety'];

  function twoDigits(n: number): string {
    if (n < 20) return ones[n];
    return tens[Math.floor(n / 10)] + (n % 10 ? ' ' + ones[n % 10] : '');
  }

  function threeDigits(n: number): string {
    if (n >= 100) {
      return ones[Math.floor(n / 100)] + ' Hundred' + (n % 100 ? ' ' + twoDigits(n % 100) : '');
    }
    return twoDigits(n);
  }

  const absNum = Math.abs(Math.floor(num));
  const paise = Math.round((Math.abs(num) - absNum) * 100);

  // Indian numbering: crore, lakh, thousand, hundred
  const crore = Math.floor(absNum / 10000000);
  const lakh = Math.floor((absNum % 10000000) / 100000);
  const thousand = Math.floor((absNum % 100000) / 1000);
  const remainder = absNum % 1000;

  let words = '';
  if (crore) words += threeDigits(crore) + ' Crore ';
  if (lakh) words += twoDigits(lakh) + ' Lakh ';
  if (thousand) words += twoDigits(thousand) + ' Thousand ';
  if (remainder) words += threeDigits(remainder);

  words = words.trim();
  if (paise > 0) {
    words += ' Rupees and ' + twoDigits(paise) + ' Paise Only';
  } else {
    words += ' Rupees Only';
  }

  return (num < 0 ? 'Minus ' : '') + words;
}
