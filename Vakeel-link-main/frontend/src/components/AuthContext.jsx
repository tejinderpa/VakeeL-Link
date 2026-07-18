import { useState } from 'react';
import { AuthContext } from './auth-context';

const normalizeRole = (role) => {
  if (!role) return null;
  const normalizedRole = String(role).toLowerCase();

  if (normalizedRole === 'client' || normalizedRole === 'public client') {
    return 'user';
  }

  return normalizedRole;
};

export const AuthProvider = ({ children }) => {
  const [user, setUser] = useState(() => {
    const savedUser = localStorage.getItem('vakeellink_user');
    const token = localStorage.getItem('vakeellink_token');
    if (!savedUser || !token) {
      return null;
    }

    const parsedUser = JSON.parse(savedUser);
    return {
      ...parsedUser,
      role: normalizeRole(parsedUser.role),
    };
  });
  const [loading] = useState(false);

  const login = (userData, token) => {
    const normalizedUser = {
      ...userData,
      id: userData.id || userData.user_id || null,
      name: userData.name || userData.full_name || userData.email || 'User',
      full_name: userData.full_name || userData.name || null,
      role: normalizeRole(userData.role),
    };

    setUser(normalizedUser);
    localStorage.setItem('vakeellink_user', JSON.stringify(normalizedUser));
    localStorage.setItem('vakeellink_token', token);
  };

  const updateUser = (partial) => {
    setUser((prev) => {
      if (!prev) return prev;
      const next = {
        ...prev,
        ...partial,
        name:
          partial?.name ||
          partial?.full_name ||
          prev.name ||
          prev.full_name ||
          prev.email ||
          'User',
        full_name:
          partial?.full_name ||
          partial?.name ||
          prev.full_name ||
          prev.name ||
          null,
        role: partial?.role ? normalizeRole(partial.role) : prev.role,
      };
      localStorage.setItem('vakeellink_user', JSON.stringify(next));
      return next;
    });
  };

  const logout = () => {
    setUser(null);
    localStorage.removeItem('vakeellink_user');
    localStorage.removeItem('vakeellink_token');
  };

  return (
    <AuthContext.Provider value={{ user, login, logout, updateUser, loading }}>
      {children}
    </AuthContext.Provider>
  );
};
