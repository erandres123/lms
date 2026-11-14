'use client';

import { Alert, Box, Button, CircularProgress, Stack, Typography } from '@mui/material';
import dynamic from 'next/dynamic';
import { useEffect, useState } from 'react';

const MeetingRoom = dynamic(() => import('@/components/meeting-room'), {
  ssr: false,
  loading: () => (
    <Box sx={{ height: '100%', display: 'grid', placeItems: 'center' }}>
      <CircularProgress sx={{ color: 'white' }} />
    </Box>
  ),
});

interface JoinParams {
  url: string;
  token: string;
  title: string;
  role: string;
}

// Effects run twice under React Strict Mode; keep the first parse so the
// cleared hash does not turn into an "expired link" error on the second run.
let cachedJoin: JoinParams | null = null;

export function LiveJoinView() {
  const [params, setParams] = useState<JoinParams | null>(cachedJoin);
  const [error, setError] = useState<string | null>(null);
  const [left, setLeft] = useState(false);

  useEffect(() => {
    if (cachedJoin) return;
    const hash = window.location.hash.replace(/^#/, '');
    window.history.replaceState(null, '', window.location.pathname);
    if (!hash) {
      setError('This link is missing its meeting details. Reopen it from the LMS app.');
      return;
    }
    const search = new URLSearchParams(hash);
    const url = search.get('url');
    const token = search.get('token');
    if (!url || !token) {
      setError('This link is incomplete or has expired. Reopen it from the LMS app.');
      return;
    }
    cachedJoin = {
      url,
      token,
      title: search.get('title') ?? 'Live class',
      role: search.get('role') ?? 'viewer',
    };
    setParams(cachedJoin);
  }, []);

  if (error) {
    return (
      <Box sx={{ minHeight: '100dvh', display: 'grid', placeItems: 'center', p: 3, bgcolor: 'grey.100' }}>
        <Alert severity="warning" sx={{ maxWidth: 480 }}>
          {error}
        </Alert>
      </Box>
    );
  }

  if (!params) {
    return (
      <Box sx={{ minHeight: '100dvh', display: 'grid', placeItems: 'center', bgcolor: 'black' }}>
        <CircularProgress sx={{ color: 'white' }} />
      </Box>
    );
  }

  if (left) {
    return (
      <Box sx={{ minHeight: '100dvh', display: 'grid', placeItems: 'center', p: 3 }}>
        <Stack spacing={2} sx={{ alignItems: 'center', textAlign: 'center' }}>
          <Typography variant="h6">You left the class</Typography>
          <Typography variant="body2" color="text.secondary">
            Open the LMS app again to rejoin {params.title}.
          </Typography>
        </Stack>
      </Box>
    );
  }

  return (
    <Box sx={{ height: '100dvh', display: 'flex', flexDirection: 'column', bgcolor: 'black' }}>
      <Stack
        direction="row"
        sx={{ alignItems: 'center', gap: 2, px: 2, py: 1, color: 'white' }}
      >
        <Box sx={{ flex: 1, minWidth: 0 }}>
          <Typography variant="subtitle1" noWrap>
            {params.title}
          </Typography>
          <Typography variant="caption" sx={{ color: 'grey.400' }}>
            Joining as {params.role}
          </Typography>
        </Box>
        <Button variant="outlined" color="inherit" size="small" onClick={() => setLeft(true)}>
          Leave
        </Button>
      </Stack>
      <Box sx={{ flex: 1, minHeight: 0 }}>
        <MeetingRoom serverUrl={params.url} token={params.token} onLeave={() => setLeft(true)} />
      </Box>
    </Box>
  );
}
