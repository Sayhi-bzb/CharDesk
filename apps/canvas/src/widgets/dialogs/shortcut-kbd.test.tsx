import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { ShortcutKbd } from './shortcut-kbd';

describe('ShortcutKbd', () => {
  it('renders keys as Kbd elements and the sequence plus outside them', () => {
    render(<ShortcutKbd shortcut="arrowup arrowdown" />);

    const group = screen.getByLabelText('Up Arrow, then Down Arrow');
    expect(group.tagName).toBe('SPAN');
    expect(group.querySelectorAll('kbd')).toHaveLength(2);
    expect(group.querySelectorAll('kbd')[0]).toHaveTextContent('↑');
    expect(group.querySelectorAll('kbd')[1]).toHaveTextContent('↓');
    expect(screen.getByText('+').closest('kbd')).toBeNull();
    expect(screen.queryByText('→')).not.toBeInTheDocument();
    expect(group).not.toHaveTextContent(/arrowdown|then|code:/i);
  });

  it('renders a modified key stroke as one Kbd', () => {
    render(<ShortcutKbd shortcut="mod+z" />);

    const group = screen.getByLabelText(/Command\+Z|Control\+Z/);
    expect(group.querySelectorAll('kbd')).toHaveLength(1);
    expect(group.querySelector('kbd')).toHaveTextContent(/⌘ Z|Ctrl Z/);
  });

  it('renders physical key codes as user-facing key labels', () => {
    render(<ShortcutKbd shortcut="alt+code:Digit6" />);

    const group = screen.getByLabelText(/Alt\+6|Option\+6/);
    expect(group).toHaveTextContent('6');
    expect(group).not.toHaveTextContent(/code:|digit/i);
  });

  it('uses the shared destructive Kbd treatment for conflicts', () => {
    render(<ShortcutKbd shortcut="mod+z" invalid />);

    const group = screen.getByLabelText(/Command\+Z|Control\+Z/);
    expect(group).toHaveAttribute('aria-invalid', 'true');
    expect(group.querySelector('kbd')).toHaveAttribute('data-invalid', 'true');
    expect(group.querySelector('kbd')).toHaveClass(
      'data-[invalid=true]:bg-error/10',
      'data-[invalid=true]:text-error'
    );
  });
});
