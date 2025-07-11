/**
 * @license
 * Copyright 2025 Audit Risk Media LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useEffect, useState } from 'react';
import { Box, Text } from 'ink';
import { Colors } from '../colors.js';

interface StreamingIndicatorProps {
  isStreaming: boolean;
  charactersStreamed?: number;
  startTime?: number;
}

export const StreamingIndicator: React.FC<StreamingIndicatorProps> = ({
  isStreaming,
  charactersStreamed = 0,
  startTime,
}) => {
  const [dots, setDots] = useState('');
  const [streamingSpeed, setStreamingSpeed] = useState(0);

  useEffect(() => {
    if (!isStreaming) {
      setDots('');
      return;
    }

    const interval = setInterval(() => {
      setDots((prev) => (prev.length >= 3 ? '' : prev + '.'));
    }, 300);

    return () => clearInterval(interval);
  }, [isStreaming]);

  useEffect(() => {
    if (isStreaming && startTime && charactersStreamed > 0) {
      const elapsedSeconds = (Date.now() - startTime) / 1000;
      const speed = Math.round(charactersStreamed / elapsedSeconds);
      setStreamingSpeed(speed);
    } else {
      setStreamingSpeed(0);
    }
  }, [isStreaming, charactersStreamed, startTime]);

  if (!isStreaming) return null;

  return (
    <Box marginLeft={2}>
      <Text color={Colors.AccentPurple}>
        ⚡ Streaming{dots}
        {streamingSpeed > 0 && (
          <Text color={Colors.AccentGreen}> ({streamingSpeed} chars/s)</Text>
        )}
      </Text>
    </Box>
  );
};