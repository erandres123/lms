'use client';

import {
  Alert,
  Box,
  Button,
  Divider,
  Paper,
  Stack,
  TextField,
  Typography,
} from '@mui/material';
import { useState, type FormEvent } from 'react';
import { getSupabase } from '@/lib/supabase';

export function LoginScreen({ onDevToken }: { onDevToken: (token: string) => void }) {
  const supabase = getSupabase();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [showDevToken, setShowDevToken] = useState(false);
  const [devToken, setDevToken] = useState('');

  const signIn = async (event: FormEvent) => {
    event.preventDefault();
    if (!supabase) return;

    setBusy(true);
    setError(null);

    const { error: authError } = await supabase.auth.signInWithPassword({
      email: email.trim(),
      password,
    });

    if (authError) {
      setError(authError.message);
      setBusy(false);
    }
  };

  return (
    <Box sx={{ minHeight: '100vh', display: 'grid', placeItems: 'center', px: 3, py: 8 }}>
      <Box sx={{ width: '100%', maxWidth: 420 }}>
        <Typography variant="h4" gutterBottom>
          LMS Gradebook
        </Typography>
        <Typography color="text.secondary" sx={{ mb: 3 }}>
          Sign in with your school account.
        </Typography>

        <Paper sx={{ p: 3 }}>
          {supabase ? (
            <Box component="form" onSubmit={signIn} noValidate>
              <Stack spacing={2}>
                {error && <Alert severity="error">{error}</Alert>}
                <TextField
                  label="Email"
                  type="email"
                  autoComplete="email"
                  value={email}
                  onChange={(event) => setEmail(event.target.value)}
                  required
                  fullWidth
                />
                <TextField
                  label="Password"
                  type="password"
                  autoComplete="current-password"
                  value={password}
                  onChange={(event) => setPassword(event.target.value)}
                  required
                  fullWidth
                />
                <Button
                  type="submit"
                  variant="contained"
                  size="large"
                  disabled={busy || !email.trim() || !password}
                >
                  {busy ? 'Signing in…' : 'Sign in'}
                </Button>
              </Stack>
            </Box>
          ) : (
            <Alert severity="warning">
              Supabase is not configured for this build. Use a developer token below.
            </Alert>
          )}

          <Divider sx={{ my: 3 }}>or</Divider>

          {showDevToken ? (
            <Stack spacing={2}>
              <TextField
                label="Developer access token"
                value={devToken}
                onChange={(event) => setDevToken(event.target.value)}
                multiline
                minRows={3}
                fullWidth
              />
              <Button
                variant="outlined"
                disabled={!devToken.trim()}
                onClick={() => onDevToken(devToken.trim())}
              >
                Connect with token
              </Button>
            </Stack>
          ) : (
            <Button size="small" onClick={() => setShowDevToken(true)}>
              Use a developer token instead
            </Button>
          )}
        </Paper>

        <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mt: 2 }}>
          Accounts are created by your school administrator.
        </Typography>
      </Box>
    </Box>
  );
}
