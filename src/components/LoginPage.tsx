import { useState, FormEvent } from 'react';
import { useNavigate, useLocation, Link } from 'react-router-dom';
import {
  TextInput,
  PasswordInput,
  Button,
  Paper,
  Title,
  Text,
  Container,
  Alert,
  Stack,
  Anchor,
} from '@mantine/core';
import { IconAlertCircle } from '@tabler/icons-react';
import { showNotification } from '@mantine/notifications';
import { useAuthStore } from '../stores/authStore';

export function LoginPage() {
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const { login, isLoading, error, clearError } = useAuthStore();
  const navigate = useNavigate();
  const location = useLocation();

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    clearError();
    
    try {
      await login(username, password);
      
      // Show success notification
      showNotification({
        title: 'Welcome!',
        message: 'You have successfully logged in',
        color: 'green',
      });
      
      // Redirect to the page they tried to visit or to notes
      const from = (location.state as any)?.from?.pathname || '/notes';
      navigate(from, { replace: true });
    } catch (err) {
      // Error is already set in the store
      console.error('Login failed:', err);
    }
  };

  return (
    <Container size={420} my={40}>
      <Title
        align="center"
        sx={(theme) => ({
          fontFamily: `Greycliff CF, ${theme.fontFamily}`,
          fontWeight: 900,
        })}
      >
        Welcome to Bible Research
      </Title>
      <Text color="dimmed" size="sm" align="center" mt={5}>
        Sign in to access your notes and tags
      </Text>

      <Paper withBorder shadow="md" p={30} mt={30} radius="md">
        <form onSubmit={handleSubmit}>
          <Stack spacing="md">
            {error && (
              <Alert 
                icon={<IconAlertCircle size={16} />} 
                title="Error" 
                color="red"
                withCloseButton
                onClose={clearError}
              >
                {error}
              </Alert>
            )}
            
            <TextInput
              label="Username"
              placeholder="Your username"
              required
              value={username}
              onChange={(e) => setUsername(e.currentTarget.value)}
              disabled={isLoading}
              autoFocus
            />
            
            <PasswordInput
              label="Password"
              placeholder="Your password"
              required
              value={password}
              onChange={(e) => setPassword(e.currentTarget.value)}
              disabled={isLoading}
            />
            
            <Button 
              fullWidth 
              type="submit" 
              loading={isLoading}
              mt="sm"
            >
              Sign in
            </Button>
          </Stack>
        </form>
        
        <Text color="dimmed" size="sm" align="center" mt="xl">
          Don't have an account?{' '}
          <Anchor component={Link} to="/register" size="sm">
            Create one now
          </Anchor>
        </Text>
      </Paper>
    </Container>
  );
}
