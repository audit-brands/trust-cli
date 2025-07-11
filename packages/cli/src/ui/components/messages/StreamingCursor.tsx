/**
 * @license
 * Copyright 2025 Audit Risk Media LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useEffect, useState } from 'react';
import { Text } from 'ink';
import { Colors } from '../../colors.js';

interface StreamingCursorProps {
  isActive: boolean;
}

export const StreamingCursor: React.FC<StreamingCursorProps> = ({ isActive }) => {
  const [isVisible, setIsVisible] = useState(true);

  useEffect(() => {
    if (!isActive) {
      setIsVisible(false);
      return;
    }

    const interval = setInterval(() => {
      setIsVisible((prev) => !prev);
    }, 530); // Slightly offset from typical cursor blink rate

    return () => clearInterval(interval);
  }, [isActive]);

  if (!isActive) return null;

  return (
    <Text color={Colors.AccentPurple}>
      {isVisible ? '▊' : ' '}
    </Text>
  );
};