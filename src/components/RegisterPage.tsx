import { useState } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import {
  Container,
  Paper,
  Title,
  Text,
  TextInput,
  PasswordInput,
  Button,
  Alert,
  Stack,
  Anchor,
} from '@mantine/core';
import { IconAlertCircle, IconCheck } from '@tabler/icons-react';
import { showNotification } from '@mantine/notifications';
import { useAuthStore } from '../stores/authStore';

export function RegisterPage() {
  const navigate = useNavigate();
  const { register, isLoading, error, clearError } = useAuthStore();

  const [username, setUsername] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [passwordConfirm, setPasswordConfirm] = useState('');

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    clearError();

    // Client-side validation
    if (password !== passwordConfirm) {
      showNotification({
        title: 'Error',
        message: 'Passwords do not match',
        color: 'red',
        icon: <IconAlertCircle />,
      });
      return;
    }

    if (password.length < 8) {
      showNotification({
        title: 'Error',
        message: 'Password must be at least 8 characters long',
        color: 'red',
        icon: <IconAlertCircle />,
      });
      return;
    }

    try {
      await register(username, password, passwordConfirm, email || undefined);
      
      showNotification({
        title: 'Success',
        message: 'Account created successfully! Welcome to Bible Research.',
        color: 'green',
        icon: <IconCheck />,
      });

      // Navigate to notes page after successful registration
      navigate('/notes', { replace: true });
    } catch (err) {
      // Error is already set in the store
      console.error('Registration failed:', err);
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
        Create Account
      </Title>
      <Text color="dimmed" size="sm" align="center" mt={5}>
        Join Bible Research to save and organize your study notes
      </Text>

      <Paper withBorder shadow="md" p={30} mt={30} radius="md">
        {error && (
          <Alert
            icon={<IconAlertCircle size="1rem" />}
            title="Registration Failed"
            color="red"
            mb="md"
            withCloseButton
            onClose={clearError}
          >
            {error}
          </Alert>
        )}

        <form onSubmit={handleSubmit}>
          <Stack>
            <TextInput
              label="Username"
              placeholder="Choose a username"
              required
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              disabled={isLoading}
              autoFocus
            />

            <TextInput
              label="Email (optional)"
              placeholder="your.email@example.com"
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              disabled={isLoading}
              description="Used for password recovery"
            />

            <PasswordInput
              label="Password"
              placeholder="Create a strong password"
              required
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              disabled={isLoading}
              description="Must be at least 8 characters"
            />

            <PasswordInput
              label="Confirm Password"
              placeholder="Re-enter your password"
              required
              value={passwordConfirm}
              onChange={(e) => setPasswordConfirm(e.target.value)}
              disabled={isLoading}
            />

            <Button
              type="submit"
              fullWidth
              mt="md"
              loading={isLoading}
              disabled={isLoading}
            >
              Create Account
            </Button>
          </Stack>
        </form>

        <Text color="dimmed" size="sm" align="center" mt="md">
          Already have an account?{' '}
          <Anchor component={Link} to="/login" size="sm">
            Sign in
          </Anchor>
        </Text>
      </Paper>
    </Container>
  );
}
