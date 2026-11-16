import { useEffect, useState } from 'react';
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
import { useTranslation } from 'react-i18next';
import { textOrKey } from '../i18n/errorText';

export function RegisterPage() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const register = useAuthStore((state) => state.register);
  const isLoading = useAuthStore((state) => state.isLoading);
  const error = useAuthStore((state) => state.error);
  const clearError = useAuthStore((state) => state.clearError);

  // A stale auth error must not greet the user returning from
  // the login page (or a previous failed attempt).
  useEffect(() => {
    clearError();
  }, [clearError]);

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
        title: t('auth.error'),
        message: t('auth.passwordsMismatch'),
        color: 'red',
        icon: <IconAlertCircle />,
      });
      return;
    }

    if (password.length < 8) {
      showNotification({
        title: t('auth.error'),
        message: t('auth.passwordTooShort'),
        color: 'red',
        icon: <IconAlertCircle />,
      });
      return;
    }

    try {
      await register(username, password, passwordConfirm, email || undefined);
      
      showNotification({
        title: t('auth.success'),
        message: t('auth.accountCreated'),
        color: 'green',
        icon: <IconCheck />,
      });

      // Navigate to notes page after successful registration
      void navigate('/notes', { replace: true });
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
        {t('auth.createAccount')}
      </Title>
      <Text color="dimmed" size="sm" align="center" mt={5}>
        {t('auth.joinPrompt')}
      </Text>

      <Paper withBorder shadow="md" p={30} mt={30} radius="md">
        {error && (
          <Alert
            icon={<IconAlertCircle size="1rem" />}
            title={t('auth.registrationFailedTitle')}
            color="red"
            mb="md"
            withCloseButton
            onClose={clearError}
          >
            {error && textOrKey(error)}
          </Alert>
        )}

        <form onSubmit={handleSubmit}>
          <Stack>
            <TextInput
              label={t('auth.username')}
              placeholder={t('auth.chooseUsername')}
              required
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              disabled={isLoading}
              autoFocus
            />

            <TextInput
              label={t('auth.emailOptional')}
              placeholder={t('auth.emailPlaceholder')}
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              disabled={isLoading}
              description={t('auth.emailRecovery')}
            />

            <PasswordInput
              label={t('auth.password')}
              placeholder={t('auth.createPassword')}
              required
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              disabled={isLoading}
              description={t('auth.passwordMinLength')}
            />

            <PasswordInput
              label={t('auth.confirmPassword')}
              placeholder={t('auth.reenterPassword')}
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
              {t('auth.createAccount')}
            </Button>
          </Stack>
        </form>

        <Text color="dimmed" size="sm" align="center" mt="md">
          {t('auth.alreadyHaveAccount')}{' '}
          <Anchor component={Link} to="/login" size="sm">
            {t('auth.signIn')}
          </Anchor>
        </Text>
      </Paper>
    </Container>
  );
}
