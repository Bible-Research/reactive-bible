import { Menu, Button, Avatar, Text, Group } from '@mantine/core';
import { IconUser, IconLogout, IconLogin } from '@tabler/icons-react';
import { useAuthStore } from '../stores/authStore';
import { useNavigate } from 'react-router-dom';

export function UserMenu() {
  const { user, isAuthenticated, logout } = useAuthStore();
  const navigate = useNavigate();

  const handleLogout = () => {
    logout();
    navigate('/login');
  };

  if (!isAuthenticated || !user) {
    return (
      <Button 
        variant="subtle"
        leftIcon={<IconLogin size={16} />}
        onClick={() => navigate('/login')}
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
