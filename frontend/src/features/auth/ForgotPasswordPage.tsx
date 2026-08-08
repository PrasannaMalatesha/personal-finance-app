import { useState } from 'react';
import { Link as RouterLink } from 'react-router-dom';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { useMutation } from '@tanstack/react-query';
import {
  Alert,
  Box,
  Button,
  Link,
  Stack,
  TextField,
  Typography,
} from '@mui/material';
import { AuthShell } from '../../shared/components/AuthShell';
import { RequestResetSchema, type RequestResetInput } from './schemas';
import { requestPasswordReset } from './authApi';

export function ForgotPasswordPage() {
  const [submitted, setSubmitted] = useState(false);
  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<RequestResetInput>({
    resolver: zodResolver(RequestResetSchema),
    mode: 'onBlur',
    defaultValues: { email: '' },
  });

  // Backend always returns 200 to avoid user enumeration. Frontend mirrors
  // that: the success view is the same regardless of whether the address
  // exists, and the button is disabled while the network call is in-flight.
  const mutation = useMutation({
    mutationFn: (input: RequestResetInput) => requestPasswordReset(input.email),
    onSuccess: () => setSubmitted(true),
  });

  const onSubmit = handleSubmit((input) => mutation.mutate(input));

  if (submitted) {
    return (
      <AuthShell
        title="Check your email"
        subtitle="We've sent you a link to reset your password"
        footer={
          <>
            Back to{' '}
            <Link component={RouterLink} to="/login">
              log in
            </Link>
          </>
        }
      >
        <Stack spacing={2}>
          <Alert severity="success">
            If an account exists for that address, a reset link is on its way.
            The link expires in one hour.
          </Alert>
          <Typography variant="body2" color="text.secondary">
            No email arrived? Check your spam folder, or try the form again.
          </Typography>
        </Stack>
      </AuthShell>
    );
  }

  return (
    <AuthShell
      title="Reset your password"
      subtitle="Enter your email — we'll send a link to set a new password."
      footer={
        <>
          Remembered it?{' '}
          <Link component={RouterLink} to="/login">
            Log in
          </Link>
        </>
      }
    >
      <Box component="form" noValidate onSubmit={onSubmit}>
        <Stack spacing={2.5}>
          {mutation.isError && (
            <Alert severity="error">
              Something went wrong. Please try again.
            </Alert>
          )}
          <TextField
            {...register('email')}
            label="Email"
            type="email"
            autoComplete="email"
            autoFocus
            fullWidth
            error={Boolean(errors.email)}
            helperText={errors.email?.message}
          />
          <Button
            type="submit"
            variant="contained"
            size="large"
            fullWidth
            disabled={isSubmitting || mutation.isPending}
          >
            {mutation.isPending ? 'Sending…' : 'Send reset link'}
          </Button>
        </Stack>
      </Box>
    </AuthShell>
  );
}
