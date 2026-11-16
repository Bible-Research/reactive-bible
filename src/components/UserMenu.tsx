import { Menu, Button, Avatar, Text, Group } from '@mantine/core';
import { 
  IconUser, 
  IconLogout, 
  IconLogin 
} from '@tabler/icons-react';
import { showNotification } from '@mantine/notifications';
import { useAuthStore } from '../stores/authStore';
import { useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';

interface UserMenuProps {
  onNavigate?: () => void;
}

export function UserMenu({ onNavigate }: UserMenuProps = {}) {
  const { t } = useTranslation();
  const user = useAuthStore((state) => state.user);
  const isAuthenticated = useAuthStore(
    (state) => state.isAuthenticated
  );
  const logout = useAuthStore((state) => state.logout);
  const navigate = useNavigate();

  const handleLogout = () => {
    logout();
    showNotification({
      title: t('auth.loggedOut'),
      message: t('auth.loggedOutMsg'),
      color: 'blue',
    });
    onNavigate?.(); // Close menu if callback provided
    void navigate('/login');
  };

  if (!isAuthenticated || !user) {
    return (
      <Button 
        variant="subtle"
        leftIcon={<IconLogin size={16} />}
        onClick={() => {
          onNavigate?.(); // Close menu if callback provided
          void navigate('/login');
        }}
      >
        {t('auth.signInCaps')}
      </Button>
    );
  }

  return (
    <Menu shadow="md" width={200}>
      <Menu.Target>
        <Button variant="subtle">
          <Group spacing="xs">
            <Avatar size="sm" radius="xl" color="blue">
              {user.username.charAt(0).toUpperCase()}
            </Avatar>
            <Text size="sm">{user.username}</Text>
          </Group>
        </Button>
      </Menu.Target>

      <Menu.Dropdown>
        <Menu.Label>{t('auth.account')}</Menu.Label>
        <Menu.Item icon={<IconUser size={14} />} disabled>
          {user.username}
        </Menu.Item>
        <Menu.Divider />
        <Menu.Item 
          color="red" 
          icon={<IconLogout size={14} />}
          onClick={handleLogout}
        >
          {t('auth.logout')}
        </Menu.Item>
      </Menu.Dropdown>
    </Menu>
  );
}
