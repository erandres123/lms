'use client';

import { LiveKitRoom, VideoConference } from '@livekit/components-react';
import '@livekit/components-styles';
import { VideoPresets } from 'livekit-client';

interface MeetingRoomProps {
  serverUrl: string;
  token: string;
  onLeave: () => void;
}

export default function MeetingRoom({ serverUrl, token, onLeave }: MeetingRoomProps) {
  return (
    <LiveKitRoom
      serverUrl={serverUrl}
      token={token}
      connect
      video={false}
      audio={false}
      options={{
        videoCaptureDefaults: { resolution: VideoPresets.h720.resolution },
        publishDefaults: { simulcast: true },
        adaptiveStream: true,
        dynacast: true,
      }}
      onDisconnected={onLeave}
      data-lk-theme="default"
      style={{ height: '100%' }}
    >
      <VideoConference />
    </LiveKitRoom>
  );
}
