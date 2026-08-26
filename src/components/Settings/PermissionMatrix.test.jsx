import { render, screen, fireEvent } from '@testing-library/react';
import PermissionMatrix from './PermissionMatrix';

// Mock des props nécessaires
const mockProps = {
  db: {}, // Mock de Firebase
  auth: { currentUser: { uid: 'test-user' } },
  permissions: { canManageUsers: true },
  userRole: 'admin'
};

describe('PermissionMatrix Component', () => {
  test('affiche correctement les en-têtes de colonnes', () => {
    render(<PermissionMatrix {...mockProps} />);
    expect(screen.getByText('Permission')).toBeInTheDocument();
    expect(screen.getByText('Staff')).toBeInTheDocument();
  });

  test('bloque les modifications si non autorisé', () => {
    const restrictedProps = { ...mockProps, permissions: { canManageUsers: false } };
    render(<PermissionMatrix {...restrictedProps} />);

    const firstToggle = screen.getAllByRole('checkbox')[0];
    fireEvent.click(firstToggle);

    expect(firstToggle).toBeDisabled();
  });
});import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import PermissionMatrix from './PermissionMatrix';

describe('PermissionMatrix Component', () => {
  const mockProps = {
    db: {},
    auth: { currentUser: { uid: 'test-user' } }
  };

  test('affiche correctement les permissions', async () => {
    render(<PermissionMatrix {...mockProps} />);
    
    await waitFor(() => {
      expect(screen.getByText('Staff')).toBeInTheDocument();
      expect(screen.getByLabelText('staff-can_view')).toBeChecked();
      expect(screen.getByLabelText('staff-can_edit')).not.toBeChecked();
    });
  });

  test('bloque les modifications sans permission', async () => {
    vi.spyOn(require('../../hooks/usePermissions'), 'default')
      .mockImplementation(() => ({
        permissions: { canManageUsers: false },
        loadingPermissions: false
      }));

    render(<PermissionMatrix {...mockProps} />);
    
    fireEvent.click(screen.getByLabelText('staff-can_view'));
    expect(screen.getByText(/non autorisé/i)).toBeInTheDocument();
  });
});
