import React from 'react';
import { useAppSelector, type HeaderState } from '@gears-frontx/react';

export interface HeaderProps {
  children?: React.ReactNode;
}

export const Header: React.FC<HeaderProps> = ({ children }) => {
  const headerState = useAppSelector((state) => state['layout/header'] as HeaderState | undefined);

  const user = headerState?.user;
  const loading = headerState?.loading ?? false;

  const getInitials = (): string => {
    if (!user?.displayName) return (user?.email?.[0] || '?').toUpperCase();
    const parts = user.displayName.trim().split(/\s+/);
    if (parts.length >= 2) {
      return `${parts[0][0]}${parts[parts.length - 1][0]}`.toUpperCase();
    }
    return user.displayName.slice(0, 2).toUpperCase();
  };

  return (
    <header
      style={{
        height: 64,
        display: 'flex',
        alignItems: 'center',
        paddingLeft: 16,
        paddingRight: 16,
        borderBottom: '1px solid hsl(var(--border))',
        backgroundColor: 'hsl(var(--card))',
      }}
    >
      {children}
      <div style={{ marginLeft: 'auto' }}>
        {loading ? (
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 14 }}>
            <div
              style={{
                width: 32,
                height: 32,
                borderRadius: '50%',
                backgroundColor: 'hsl(var(--muted))',
              }}
            />
            <div
              style={{
                width: 96,
                height: 16,
                borderRadius: 4,
                backgroundColor: 'hsl(var(--muted))',
              }}
            />
          </div>
        ) : (
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 14, color: 'hsl(var(--muted-foreground))' }}>
            <div
              style={{
                width: 36,
                height: 36,
                borderRadius: '50%',
                backgroundColor: 'hsl(var(--primary))',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                fontSize: 13,
                fontWeight: 600,
                color: 'hsl(var(--primary-foreground))',
              }}
            >
              {getInitials()}
            </div>
            <span>{user?.displayName || user?.email || 'User'}</span>
          </div>
        )}
      </div>
    </header>
  );
};

Header.displayName = 'Header';
