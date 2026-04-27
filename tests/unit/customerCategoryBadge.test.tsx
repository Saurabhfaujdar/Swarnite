// @vitest-environment jsdom
import { describe, it, expect } from 'vitest';
import { render } from '@testing-library/react';
import CustomerCategoryBadge from '../../src/components/CustomerCategoryBadge';

describe('CustomerCategoryBadge', () => {
  it('renders nothing when tag is null', () => {
    const { container } = render(<CustomerCategoryBadge tag={null} />);
    expect(container.firstChild).toBeNull();
  });

  it('renders nothing when tag is undefined', () => {
    const { container } = render(<CustomerCategoryBadge />);
    expect(container.firstChild).toBeNull();
  });

  it('renders New tag with green color and icon', () => {
    const { container } = render(<CustomerCategoryBadge tag={{ label: 'New', color: 'green' }} />);
    const badge = container.firstChild as HTMLElement;
    expect(badge).toBeTruthy();
    expect(badge.textContent).toContain('New');
    expect(badge.textContent).toContain('🆕');
    expect(badge.className).toContain('bg-green-100');
    expect(badge.className).toContain('text-green-800');
  });

  it('renders Regular tag with blue color', () => {
    const { container } = render(<CustomerCategoryBadge tag={{ label: 'Regular', color: 'blue' }} />);
    const badge = container.firstChild as HTMLElement;
    expect(badge.textContent).toContain('Regular');
    expect(badge.textContent).toContain('🔄');
    expect(badge.className).toContain('bg-blue-100');
  });

  it('renders VIP tag with purple color', () => {
    const { container } = render(<CustomerCategoryBadge tag={{ label: 'VIP', color: 'purple' }} />);
    const badge = container.firstChild as HTMLElement;
    expect(badge.textContent).toContain('VIP');
    expect(badge.textContent).toContain('⭐');
    expect(badge.className).toContain('bg-purple-100');
  });

  it('renders Premium tag with amber color', () => {
    const { container } = render(<CustomerCategoryBadge tag={{ label: 'Premium', color: 'amber' }} />);
    const badge = container.firstChild as HTMLElement;
    expect(badge.textContent).toContain('Premium');
    expect(badge.textContent).toContain('💎');
    expect(badge.className).toContain('bg-amber-100');
  });

  it('renders Inactive tag with gray color', () => {
    const { container } = render(<CustomerCategoryBadge tag={{ label: 'Inactive', color: 'gray' }} />);
    const badge = container.firstChild as HTMLElement;
    expect(badge.textContent).toContain('Inactive');
    expect(badge.textContent).toContain('💤');
    expect(badge.className).toContain('bg-gray-200');
  });

  it('falls back to gray when color is unknown', () => {
    const { container } = render(<CustomerCategoryBadge tag={{ label: 'New', color: 'unknown-color' }} />);
    const badge = container.firstChild as HTMLElement;
    expect(badge.className).toContain('bg-gray-200');
  });

  it('uses smaller text size by default (sm)', () => {
    const { container } = render(<CustomerCategoryBadge tag={{ label: 'New', color: 'green' }} />);
    const badge = container.firstChild as HTMLElement;
    expect(badge.className).toContain('text-[10px]');
  });

  it('uses md text size when size="md"', () => {
    const { container } = render(<CustomerCategoryBadge tag={{ label: 'New', color: 'green' }} size="md" />);
    const badge = container.firstChild as HTMLElement;
    expect(badge.className).toContain('text-xs');
    expect(badge.className).not.toContain('text-[10px]');
  });
});
