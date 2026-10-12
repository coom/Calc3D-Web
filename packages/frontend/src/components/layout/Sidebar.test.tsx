import { render, screen, fireEvent, act } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import i18n from '@/i18n';
import { useAuthStore } from '@/stores/auth.store';
import { useUiStore } from '@/stores/ui.store';
import { setViewportWidth } from '@/test-utils/viewport';
import { Sidebar } from './Sidebar';

function setup(role: 'admin' | 'user' = 'admin') {
  useAuthStore.setState({ accessToken: 't', refreshToken: 'r', user: { id: 1, username: 'u', displayName: 'U', role } });
  render(
    <MemoryRouter initialEntries={['/']}>
      <Sidebar />
      <Routes><Route path="*" element={<div>PAGE</div>} /></Routes>
    </MemoryRouter>,
  );
}

describe('Sidebar', () => {
  beforeAll(async () => { await i18n.changeLanguage('en'); });
  beforeEach(() => { useUiStore.setState({ sidebarCollapsed: false, tabletSidebarExpanded: false, mobileNavOpen: false }); });

  it('on desktop, shows the labels and hides them once collapsed', () => {
    setViewportWidth(1280);
    setup();
    expect(screen.getByRole('link', { name: 'Quote' })).toBeVisible();
    fireEvent.click(screen.getByRole('button', { name: 'Collapse' }));
    expect(screen.queryByText('Quote')).not.toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Quote' })).toBeInTheDocument();
  });

  it('lists the four workshop pages', () => {
    setViewportWidth(1280);
    setup();
    for (const name of ['Quote', 'History', 'Purchases', 'Finances']) expect(screen.getByRole('link', { name })).toBeInTheDocument();
  });

  it('hides the administration section from a plain user', () => {
    setViewportWidth(1280);
    setup('user');
    expect(screen.getByRole('link', { name: 'Quote' })).toBeInTheDocument();
    expect(screen.queryByRole('link', { name: 'Audit log' })).not.toBeInTheDocument();
    expect(screen.queryByText('Administration')).not.toBeInTheDocument();
  });

  it('on tablet, starts with icons only and expands with the same button', () => {
    setViewportWidth(900);
    setup();
    expect(screen.queryByText('Quote')).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Expand' }));
    expect(screen.getByText('Quote')).toBeInTheDocument();
    expect(useUiStore.getState().sidebarCollapsed).toBe(false);
  });

  it('on mobile, is a closed drawer that opens from the store and closes when a link is followed', () => {
    setViewportWidth(400);
    setup();
    const nav = screen.getByRole('navigation', { name: 'Main menu', hidden: true });
    expect(nav.closest('aside')).toHaveAttribute('aria-hidden', 'true');
    expect(screen.queryByTestId('nav-backdrop')).not.toBeInTheDocument();

    act(() => useUiStore.getState().setMobileNavOpen(true));
    expect(screen.getByRole('navigation', { name: 'Main menu' }).closest('aside')).not.toHaveAttribute('aria-hidden');
    fireEvent.click(screen.getByRole('link', { name: 'Audit log' }));
    expect(useUiStore.getState().mobileNavOpen).toBe(false);
  });

  it('on mobile, closes when the backdrop is clicked or Escape is pressed', () => {
    setViewportWidth(400);
    setup();
    act(() => useUiStore.getState().setMobileNavOpen(true));
    fireEvent.click(screen.getByTestId('nav-backdrop'));
    expect(useUiStore.getState().mobileNavOpen).toBe(false);

    act(() => useUiStore.getState().setMobileNavOpen(true));
    fireEvent.keyDown(document, { key: 'Escape' });
    expect(useUiStore.getState().mobileNavOpen).toBe(false);
  });

  it('on mobile, never shows the collapse button', () => {
    setViewportWidth(400);
    setup();
    act(() => useUiStore.getState().setMobileNavOpen(true));
    expect(screen.queryByRole('button', { name: 'Collapse' })).not.toBeInTheDocument();
  });
});
