// @vitest-environment jsdom
import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import React from 'react';
import { MemoryRouter } from 'react-router-dom';

import ReportTabs from '../../src/components/ReportTabs';

describe('ReportTabs', () => {
  it('renders all four report tab links', () => {
    render(
      <MemoryRouter initialEntries={['/reports/daily-sales']}>
        <ReportTabs />
      </MemoryRouter>,
    );
    expect(screen.getByText('Daily Sales')).toBeDefined();
    expect(screen.getByText('Item-Wise Sales')).toBeDefined();
    expect(screen.getByText('Stock')).toBeDefined();
    expect(screen.getByText('Counter-Wise')).toBeDefined();
  });

  it('applies active styling to current route', () => {
    render(
      <MemoryRouter initialEntries={['/reports/item-wise-sales']}>
        <ReportTabs />
      </MemoryRouter>,
    );
    const activeTab = screen.getByText('Item-Wise Sales');
    expect(activeTab.className).toContain('bg-jewel-royal');
  });

  it('applies inactive styling to non-current routes', () => {
    render(
      <MemoryRouter initialEntries={['/reports/daily-sales']}>
        <ReportTabs />
      </MemoryRouter>,
    );
    const inactiveTab = screen.getByText('Stock');
    expect(inactiveTab.className).toContain('text-gray-600');
    expect(inactiveTab.className).not.toContain('bg-jewel-royal');
  });

  it('links point to correct routes', () => {
    render(
      <MemoryRouter initialEntries={['/reports/daily-sales']}>
        <ReportTabs />
      </MemoryRouter>,
    );
    const links = screen.getAllByRole('link');
    const hrefs = links.map((l) => l.getAttribute('href'));
    expect(hrefs).toContain('/reports/daily-sales');
    expect(hrefs).toContain('/reports/item-wise-sales');
    expect(hrefs).toContain('/reports/stock');
    expect(hrefs).toContain('/reports/counter-wise');
  });
});
