import { Menu, Button, Avatar, Text, Group } from '@mantine/core';
import { 
  IconUser, 
  IconLogout, 
  IconLogin 
} from '@tabler/icons-react';
import { showNotification } from '@mantine/notifications';
import { useAuthStore } from '../stores/authStore';
import { useNavigate } from 'react-router-dom';

interface UserMenuProps {
  onNavigate?: () => void;
}

export function UserMenu({ onNavigate }: UserMenuProps = {}) {
  const { user, isAuthenticated, logout } = useAuthStore();
  const navigate = useNavigate();

  const handleLogout = () => {
    logout();
    showNotification({
      title: 'Logged out',
      message: 'You have been successfully logged out',
      color: 'blue',
    });
    onNavigate?.(); // Close menu if callback provided
    navigate('/login');
  };

  if (!isAuthenticated || !user) {
    return (
      <Button 
        variant="subtle"
        leftIcon={<IconLogin size={16} />}
        onClick={() => {
          onNavigate?.(); // Close menu if callback provided
          navigate('/login');
        }}
      >
        Sign In
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
        <Menu.Label>Account</Menu.Label>
        <Menu.Item icon={<IconUser size={14} />} disabled>
          {user.username}
        </Menu.Item>
        <Menu.Divider />
        <Menu.Item 
          color="red" 
          icon={<IconLogout size={14} />}
          onClick={handleLogout}
        >
          Logout
        </Menu.Item>
      </Menu.Dropdown>
    </Menu>
  );
}
