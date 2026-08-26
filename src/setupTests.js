import '@testing-library/jest-dom/vitest';
import { cleanup } from '@testing-library/react';
import { afterEach } from 'vitest';

afterEach(() => {
  cleanup();
});
import '@testing-library/jest-dom/vitest';
import { cleanup } from '@testing-library/react';
import { afterEach, vi } from 'vitest';

// Configuration des mocks globaux
vi.mock('firebase/firestore', () => ({
  getFirestore: vi.fn(),
  doc: vi.fn((db, path) => ({ db, path })),
  onSnapshot: vi.fn((ref, callback) => {
    callback({
      exists: () => true,
      data: () => ({
        staff: { can_view: true, can_edit: false },
        admin: { can_view: true, can_edit: true }
      })
    });
    return () => {}; // unsubscribe function
  }),
  updateDoc: vi.fn().mockResolvedValue(true)
}));

// Mock usePermissions
vi.mock('../../hooks/usePermissions', () => ({
  __esModule: true,
  default: () => ({
    permissions: { canManageUsers: true },
    loadingPermissions: false,
    userRole: 'admin'
  }),
}));

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});
